/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare global {
  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
  }

  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[];
    name?: string;
    namePrefix?: string;
  }

  type BluetoothServiceUUID = string | number;
  type BufferSource = ArrayBuffer | ArrayBufferView;

  interface BluetoothRemoteGATTCharacteristic {
    writeValue(value: BufferSource): Promise<void>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(
      characteristic: BluetoothServiceUUID
    ): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothDevice extends EventTarget {
    id: string;
    name?: string;
    uuids?: string[];
    gatt?: BluetoothRemoteGATTServer;
  }

  interface Bluetooth {
    requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
    getAvailability?(): Promise<boolean>;
    getDevices?(): Promise<BluetoothDevice[]>;
  }

  interface Navigator {
    bluetooth: Bluetooth;
  }
}

export {};
