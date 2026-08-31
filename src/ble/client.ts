import {
  COMMAND_CHARACTERISTIC_UUID,
  DEVICE_NAME_HINT,
  DIAGNOSTICS_CHARACTERISTIC_UUID,
  MOTOR_SERVICE_UUID,
  REQUEST_DEVICE_OPTIONS
} from './constants';
import { BleClientError, normalizeBleError } from './errors';
import {
  encodeDriveCommand,
  encodeReturnToOriginCommand,
  encodeStopCommand
} from '../domain/encode';
import { DriveCommand } from '../domain/motor';

export interface BleMotorClient {
  isSupported(): boolean;
  getAvailability(): Promise<boolean>;
  requestAndConnect(): Promise<void>;
  reconnectKnownDevice(): Promise<boolean>;
  disconnect(): Promise<void>;
  writeCommand(command: DriveCommand): Promise<void>;
  returnToOrigin(): Promise<void>;
  emergencyStop(): Promise<void>;
  onDisconnected(listener: () => void): () => void;
  onDiagnostics(listener: (diagnostics: RobotDiagnostics) => void): () => void;
}

export type RobotDiagnostics = {
  mode: 'manual' | 'returning';
  lastRequest: 'stop' | 'drive' | 'home' | 'unknown';
  odometryStale: boolean;
  xMm: number;
  yMm: number;
  headingMdeg: number;
};

const DEV = import.meta.env.DEV;

const debug = (...args: unknown[]): void => {
  if (DEV) {
    console.debug('[ble]', ...args);
  }
};

export class WebBleMotorClient implements BleMotorClient {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private commandCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private diagnosticsCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners = new Set<() => void>();
  private diagnosticsListeners = new Set<(diagnostics: RobotDiagnostics) => void>();
  private suppressDisconnectEvent = false;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator && window.isSecureContext;
  }

  async getAvailability(): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      throw new BleClientError('unsupported', 'Web Bluetooth unavailable.');
    }

    const bluetooth = navigator.bluetooth as Bluetooth & {
      getAvailability?: () => Promise<boolean>;
    };

    if (typeof bluetooth.getAvailability === 'function') {
      return bluetooth.getAvailability();
    }

    return true;
  }

  async requestAndConnect(): Promise<void> {
    this.ensureSupport();
    try {
      const device = await navigator.bluetooth.requestDevice(REQUEST_DEVICE_OPTIONS);
      await this.connectDevice(device);
    } catch (error) {
      throw normalizeBleError(error);
    }
  }

  async reconnectKnownDevice(): Promise<boolean> {
    this.ensureSupport();
    const bluetooth = navigator.bluetooth as Bluetooth & {
      getDevices?: () => Promise<BluetoothDevice[]>;
    };

    if (typeof bluetooth.getDevices !== 'function') {
      return false;
    }

    const devices = await bluetooth.getDevices();
    const knownDevice = devices.find(
      (device) =>
        device.name === DEVICE_NAME_HINT ||
        device.uuids?.includes(MOTOR_SERVICE_UUID.toLowerCase())
    );

    if (!knownDevice) {
      return false;
    }

    try {
      await this.connectDevice(knownDevice);
      return true;
    } catch (error) {
      throw normalizeBleError(error);
    }
  }

  async hasKnownDevice(): Promise<boolean> {
    this.ensureSupport();
    const bluetooth = navigator.bluetooth as Bluetooth & {
      getDevices?: () => Promise<BluetoothDevice[]>;
    };

    if (typeof bluetooth.getDevices !== 'function') {
      return false;
    }

    const devices = await bluetooth.getDevices();
    return devices.some(
      (device) =>
        device.name === DEVICE_NAME_HINT ||
        device.uuids?.includes(MOTOR_SERVICE_UUID.toLowerCase())
    );
  }

  async disconnect(): Promise<void> {
    if (this.server?.connected) {
      this.suppressDisconnectEvent = true;
      try {
        await this.emergencyStop();
      } catch (error) {
        debug('best-effort stop before disconnect failed', error);
      }
      this.server.disconnect();
    }
    this.clearSession();
  }

  async writeCommand(command: DriveCommand): Promise<void> {
    await this.writePacket(encodeDriveCommand(command), 'drive', command);
  }

  async returnToOrigin(): Promise<void> {
    await this.writePacket(encodeReturnToOriginCommand(), 'return-to-origin');
  }

  async emergencyStop(): Promise<void> {
    if (!this.server?.connected) {
      return;
    }

    await this.writePacket(encodeStopCommand(), 'stop');
  }

  onDisconnected(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onDiagnostics(listener: (diagnostics: RobotDiagnostics) => void): () => void {
    this.diagnosticsListeners.add(listener);
    return () => this.diagnosticsListeners.delete(listener);
  }

  private async writePacket(packet: ArrayBuffer, label: string, command?: DriveCommand): Promise<void> {
    if (!this.server?.connected || !this.commandCharacteristic) {
      throw new BleClientError('gatt-disconnected', 'Device is not connected.');
    }

    try {
      debug('write', { label, command, packet: Array.from(new Uint8Array(packet)) });
      await this.commandCharacteristic.writeValue(packet);
    } catch (error) {
      debug('write failure', error);
      this.clearSession();
      throw new BleClientError('write-failed', 'Failed to write motor command.', {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  private ensureSupport(): void {
    if (!window.isSecureContext) {
      throw new BleClientError('insecure-context', 'HTTPS required.');
    }
    if (!('bluetooth' in navigator)) {
      throw new BleClientError('unsupported', 'Web Bluetooth unavailable.');
    }
  }

  private async connectDevice(device: BluetoothDevice): Promise<void> {
    debug('connecting', device.name ?? DEVICE_NAME_HINT);
    this.device = device;
    this.device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);

    const server = await device.gatt?.connect();
    if (!server) {
      throw new BleClientError('connection-failed', 'GATT server unavailable.');
    }

    const service = await server.getPrimaryService(MOTOR_SERVICE_UUID);
    const commandCharacteristic = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

    this.server = server;
    this.commandCharacteristic = commandCharacteristic;
    try {
      const diagnosticsCharacteristic = await service.getCharacteristic(DIAGNOSTICS_CHARACTERISTIC_UUID);
      await diagnosticsCharacteristic.startNotifications();
      diagnosticsCharacteristic.addEventListener('characteristicvaluechanged', this.handleDiagnostics);
      this.diagnosticsCharacteristic = diagnosticsCharacteristic;
      debug('diagnostics enabled');
    } catch (error) {
      // Diagnostics are intentionally optional so this UI remains compatible
      // with an already-flashed firmware image during the upgrade.
      debug('diagnostics unavailable', error);
    }
    debug('connected');
  }

  private readonly handleDiagnostics = (event: Event): void => {
    const value = (event.target as unknown as BluetoothRemoteGATTCharacteristic).value;
    if (!value || value.byteLength !== 16 || value.getUint8(0) !== 1) {
      return;
    }

    const lastRequest = (['stop', 'drive', 'home'] as const)[value.getUint8(2)] ?? 'unknown';
    const diagnostics: RobotDiagnostics = {
      mode: value.getUint8(1) === 1 ? 'returning' : 'manual',
      lastRequest,
      odometryStale: value.getUint8(3) !== 0,
      xMm: value.getInt32(4, true),
      yMm: value.getInt32(8, true),
      headingMdeg: value.getInt32(12, true)
    };
    this.diagnosticsListeners.forEach((listener) => listener(diagnostics));
  };

  private readonly handleDisconnected = (): void => {
    debug('gatt disconnected');
    if (this.suppressDisconnectEvent) {
      this.suppressDisconnectEvent = false;
      this.clearSession();
      return;
    }
    this.clearSession();
    this.listeners.forEach((listener) => listener());
  };

  private clearSession(): void {
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    }
    if (this.diagnosticsCharacteristic) {
      this.diagnosticsCharacteristic.removeEventListener(
        'characteristicvaluechanged',
        this.handleDiagnostics
      );
    }
    this.server = null;
    this.commandCharacteristic = null;
    this.diagnosticsCharacteristic = null;
    this.device = null;
    this.suppressDisconnectEvent = false;
  }
}
