/**
 * Deklarasi tipe minimal untuk Web Bluetooth API.
 * TypeScript DOM lib belum menyertakan API ini secara default, sedangkan
 * fitur cetak langsung ke printer thermal memakainya (hanya Chrome/Edge).
 * Cukup mencakup bagian yang kita pakai (GATT + tulis characteristic).
 */

interface BluetoothRemoteGATTCharacteristic {
  readonly properties: {
    readonly write: boolean;
    readonly writeWithoutResponse: boolean;
  };
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  addEventListener(
    type: "gattserverdisconnected",
    listener: (this: BluetoothDevice, ev: Event) => void,
  ): void;
}

interface RequestDeviceOptions {
  filters?: Array<{
    services?: Array<number | string>;
    name?: string;
    namePrefix?: string;
  }>;
  optionalServices?: Array<number | string>;
  acceptAllDevices?: boolean;
}

interface Bluetooth {
  getAvailability(): Promise<boolean>;
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
}

interface Navigator {
  readonly bluetooth?: Bluetooth;
}
