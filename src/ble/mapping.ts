export const MAP_REQUEST_UUID = '12345678-1234-5678-9abc-def012345703';
export const MAP_RESPONSE_UUID = '12345678-1234-5678-9abc-def012345704';
export const MAP_LENGTH = 40064;
export const MAP_HEADER = 64;
export const phases = [
  'paused',
  'scanning',
  'planning',
  'moving',
  'finished',
  'sensor-limited',
  'blocked',
  'map-limit',
  'faulted'
] as const;
const stopReasons = [
  '',
  'operator command',
  'no eligible reachable target',
  'missing echoes',
  'no clear route',
  'map boundary',
  'odometry alignment lost',
  'phase deadline',
  'stale odometry',
  'stalled',
  'obstacle safety disabled',
  'control fault',
  'three scans without useful progress'
];
export type MapStatus = {
  phase: string;
  aligned: boolean;
  active: boolean;
  revision: number;
  x: number;
  y: number;
  heading: number;
};
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function validateMap(bytes: Uint8Array): void {
  if (bytes.length !== MAP_LENGTH) throw new Error('Incorrect map length.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    String.fromCharCode(...bytes.slice(0, 4)) !== 'RMAP' ||
    view.getUint16(4, true) !== 1 ||
    view.getUint16(6, true) !== 100 ||
    view.getUint16(20, true) !== 200 ||
    view.getUint16(22, true) !== 200 ||
    bytes.slice(54, 64).some((v) => v !== 0)
  )
    throw new Error('Unsupported map format.');
  if (
    new Int8Array(bytes.buffer, bytes.byteOffset + MAP_HEADER, 40000).some(
      (v) => v < -8 || v > 8
    )
  )
    throw new Error('Invalid occupancy evidence.');
}
type Pending = {
  op: number;
  id: number;
  offset?: number;
  resolve: (view: DataView) => void;
  reject: (error: Error) => void;
};
export class MappingClient {
  private pending: Pending | null = null;
  private requestCharacteristic: BluetoothRemoteGATTCharacteristic | null =
    null;
  private responseCharacteristic: BluetoothRemoteGATTCharacteristic | null =
    null;
  private nextId = 1;
  private epoch = 0;
  private requestQueue: Promise<void> = Promise.resolve();
  busy = false;
  available = false;
  fragmentSize = 12;
  constructor(private enqueue: (write: () => Promise<void>) => Promise<void>) {}
  async connect(service: BluetoothRemoteGATTService): Promise<void> {
    this.requestCharacteristic =
      await service.getCharacteristic(MAP_REQUEST_UUID);
    this.responseCharacteristic =
      await service.getCharacteristic(MAP_RESPONSE_UUID);
    await this.responseCharacteristic.startNotifications();
    this.responseCharacteristic.addEventListener(
      'characteristicvaluechanged',
      this.receive
    );
    this.available = true;
    const capabilities = await this.rpc(0);
    this.fragmentSize = Math.max(12, Math.min(236, capabilities.getUint8(13)));
  }
  disconnect(): void {
    this.cancel();
    this.responseCharacteristic?.removeEventListener(
      'characteristicvaluechanged',
      this.receive
    );
    this.requestCharacteristic = null;
    this.responseCharacteristic = null;
    this.available = false;
  }
  cancel(): void {
    this.epoch++;
    this.pending?.reject(new Error('Map operation cancelled.'));
    this.pending = null;
  }
  private receive = (event: Event): void => {
    const v = (event.target as BluetoothRemoteGATTCharacteristic).value;
    const p = this.pending;
    if (
      !v ||
      v.byteLength < 5 ||
      v.getUint8(0) !== 1 ||
      !p ||
      v.getUint8(1) !== p.op ||
      v.getUint16(2, true) !== p.id
    )
      return;
    if (v.byteLength < (p.op === 6 ? 9 : p.op === 11 ? 13 : 20)) {
      p.reject(new Error('Truncated mapping response.'));
      return;
    }
    if (v.getUint8(4) !== 0)
      p.reject(new Error(`Robot refused map request (${v.getUint8(4)}).`));
    else if (p.offset === undefined || v.getUint16(5, true) === p.offset)
      p.resolve(v);
  };
  private rpc(
    op: number,
    fill?: (view: DataView) => void,
    id = this.nextId++ & 0xffff,
    offset?: number,
    length = 20
  ): Promise<DataView> {
    const epoch = this.epoch;
    const result = this.requestQueue.then(() => {
      if (epoch !== this.epoch) throw new Error('Map operation cancelled.');
      return this.executeRpc(op, fill, id, offset, length);
    });
    this.requestQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
  private async executeRpc(
    op: number,
    fill: ((view: DataView) => void) | undefined,
    id: number,
    offset: number | undefined,
    length: number
  ): Promise<DataView> {
    if (!this.available || !this.requestCharacteristic)
      throw new Error('Mapping is unavailable on this firmware.');
    if (this.pending) throw new Error('A map request is already in progress.');
    const packet = new ArrayBuffer(Math.max(20, length)),
      view = new DataView(packet);
    view.setUint8(0, 1);
    view.setUint8(1, op);
    view.setUint16(2, id, true);
    fill?.(view);
    const epoch = this.epoch;
    let timer: ReturnType<typeof setTimeout>;
    let rejectResponse: (error: Error) => void = () => undefined;
    const response = new Promise<DataView>((resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error('Map response timed out. Reconnect to synchronize.')
          ),
        5000
      );
      this.pending = { op, id, offset, resolve, reject };
      rejectResponse = reject;
    });
    // Attach rejection handling immediately, including cancellation during a write.
    const result = response.finally(() => {
      clearTimeout(timer);
      this.pending = null;
    });
    void result.catch(() => undefined);
    try {
      await this.enqueue(async () => {
        if (this.epoch !== epoch || !this.requestCharacteristic)
          throw new Error('Map operation cancelled.');
        await this.requestCharacteristic.writeValue(packet);
      });
      return await result;
    } catch (error) {
      rejectResponse(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  async command(op: 1 | 2 | 3): Promise<void> {
    await this.rpc(op, (v) => v.setUint8(4, 1));
  }
  async geometry(): Promise<{
    target: [number, number] | null;
    extents: number[];
    reason: string;
  }> {
    const v = await this.rpc(12);
    return {
      target: v.getUint8(5) ? [v.getInt16(6, true), v.getInt16(8, true)] : null,
      extents: [10, 12, 14, 16].map((offset) => v.getUint16(offset, true)),
      reason: stopReasons[v.getUint8(18)] ?? 'unknown'
    };
  }
  async refreshTile(
    map: Uint8Array,
    since: number,
    cursor: number
  ): Promise<{ map: Uint8Array; cursor: number; revision: number }> {
    const change = await this.rpc(15, (v) => {
      v.setUint16(4, cursor, true);
      v.setUint32(6, since, true);
    });
    const tile = change.getUint16(5, true),
      revision = change.getUint32(8, true);
    if (tile === 65535) return { map, cursor: 0, revision };
    if (tile >= 400) throw new Error('Invalid map tile.');
    const bytes = new Uint8Array(100);
    let tileRevision: number | undefined;
    for (let offset = 0; offset < 100; ) {
      const v = await this.rpc(11, (v) => {
        v.setUint16(4, tile, true);
        v.setUint8(6, offset);
        v.setUint8(7, this.fragmentSize - 4);
      });
      const current = v.getUint32(8, true);
      if (tileRevision !== undefined && tileRevision !== current)
        return { map, cursor: tile, revision: since };
      tileRevision = current;
      const n = v.byteLength - 12;
      if (
        v.getUint16(5, true) !== tile ||
        v.getUint8(7) !== offset ||
        n < 1 ||
        offset + n > 100
      )
        throw new Error('Invalid tile fragment.');
      bytes.set(new Uint8Array(v.buffer, v.byteOffset + 12, n), offset);
      offset += n;
    }
    const next = map.slice();
    for (let i = 0; i < 100; i++)
      next[
        MAP_HEADER +
          (Math.floor(tile / 20) * 10 + Math.floor(i / 10)) * 200 +
          (tile % 20) * 10 +
          (i % 10)
      ] = bytes[i];
    // Display tiles are not a consistent save snapshot; saving requests a fresh snapshot.
    return { map: next, cursor: tile + 1, revision: since };
  }
  async status(): Promise<MapStatus> {
    const v = await this.rpc(4);
    return {
      phase: phases[v.getUint8(5)] ?? 'unknown',
      aligned: !!v.getUint8(6),
      active: !!v.getUint8(7),
      revision: v.getUint32(8, true),
      x: v.getInt16(12, true),
      y: v.getInt16(14, true),
      heading: v.getInt32(16, true) / 1000
    };
  }
  async snapshot(progress?: (fraction: number) => void): Promise<Uint8Array> {
    if (this.busy) throw new Error('Another map transfer is in progress.');
    this.busy = true;
    const epoch = this.epoch,
      id = this.nextId++ & 0xffff;
    try {
      await this.rpc(10);
      const header = await this.rpc(5, undefined, id);
      if (header.getUint32(9, true) !== MAP_LENGTH)
        throw new Error('Unsupported map size.');
      const bytes = new Uint8Array(MAP_LENGTH);
      for (let offset = 0; offset < bytes.length; ) {
        if (epoch !== this.epoch) throw new Error('Map operation cancelled.');
        const v = await this.rpc(
          6,
          (v) => {
            v.setUint16(4, offset, true);
            v.setUint8(6, this.fragmentSize);
          },
          id,
          offset
        );
        const n = v.getUint8(7);
        if (
          n < 1 ||
          n > this.fragmentSize ||
          offset + n > bytes.length ||
          v.byteLength < 8 + n
        )
          throw new Error('Invalid map fragment.');
        bytes.set(new Uint8Array(v.buffer, v.byteOffset + 8, n), offset);
        offset += n;
        progress?.(offset / bytes.length);
      }
      if (crc32(bytes) !== header.getUint32(5, true))
        throw new Error('Map checksum mismatch.');
      validateMap(bytes);
      return bytes;
    } finally {
      if (epoch === this.epoch && this.available)
        await this.rpc(10).catch(() => undefined);
      this.busy = false;
    }
  }
  async restore(
    bytes: Uint8Array,
    progress?: (fraction: number) => void
  ): Promise<void> {
    validateMap(bytes);
    if (this.busy) throw new Error('Another map transfer is in progress.');
    this.busy = true;
    const epoch = this.epoch,
      id = this.nextId++ & 0xffff;
    try {
      await this.rpc(10);
      await this.rpc(
        7,
        (v) => {
          v.setUint32(4, bytes.length, true);
          v.setUint32(8, crc32(bytes), true);
          v.setUint8(14, 1);
        },
        id
      );
      for (let offset = 0; offset < bytes.length; offset += this.fragmentSize) {
        if (epoch !== this.epoch) throw new Error('Map operation cancelled.');
        const data = bytes.slice(offset, offset + this.fragmentSize);
        await this.rpc(
          8,
          (v) => {
            v.setUint16(4, offset, true);
            v.setUint8(6, data.length);
            new Uint8Array(v.buffer).set(data, 8);
          },
          id,
          undefined,
          8 + data.length
        );
        progress?.(Math.min(1, (offset + this.fragmentSize) / bytes.length));
      }
      await this.rpc(9, (v) => v.setUint8(4, 1), id);
    } finally {
      if (epoch === this.epoch && this.available)
        await this.rpc(10).catch(() => undefined);
      this.busy = false;
    }
  }
}
