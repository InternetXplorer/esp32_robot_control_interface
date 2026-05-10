import {
  COMMAND_CHARACTERISTIC_UUID,
  DEVICE_NAME_HINT,
  MOTOR_SERVICE_UUID,
  REQUEST_DEVICE_OPTIONS
} from './constants';
import { BleClientError, normalizeBleError } from './errors';
import { encodeDriveCommand } from '../domain/encode';
import { DriveCommand } from '../domain/motor';

export interface BleMotorClient {
  isSupported(): boolean;
  getAvailability(): Promise<boolean>;
  requestAndConnect(): Promise<void>;
  reconnectKnownDevice(): Promise<boolean>;
  disconnect(): Promise<void>;
  writeCommand(command: DriveCommand): Promise<void>;
  emergencyStop(): Promise<void>;
  onDisconnected(listener: () => void): () => void;
}

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
  private listeners = new Set<() => void>();
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
    if (!this.server?.connected || !this.commandCharacteristic) {
      throw new BleClientError('gatt-disconnected', 'Device is not connected.');
    }

    try {
      const packet = encodeDriveCommand(command);
      debug('write', { command, packet: Array.from(new Uint8Array(packet)) });
      await this.commandCharacteristic.writeValue(packet);
    } catch (error) {
      debug('write failure', error);
      this.clearSession();
      throw new BleClientError('write-failed', 'Failed to write motor command.', {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  async emergencyStop(): Promise<void> {
    if (!this.server?.connected) {
      return;
    }

    await this.writeCommand({ left: 0, right: 0 });
  }

  onDisconnected(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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
    debug('connected');
  }

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
    this.server = null;
    this.commandCharacteristic = null;
    this.device = null;
    this.suppressDisconnectEvent = false;
  }
}
