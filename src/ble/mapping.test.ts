import { describe, expect, it, vi } from 'vitest';
import {
  crc32,
  MAP_LENGTH,
  validateMap,
  MappingClient,
  MAP_REQUEST_UUID
} from './mapping';
import { exportMap, importMap } from '../domain/mapStorage';
function map(): Uint8Array {
  const bytes = new Uint8Array(MAP_LENGTH);
  bytes.set([82, 77, 65, 80, 1, 0, 100, 0]);
  bytes.set([200, 0, 200, 0], 20);
  const v = new DataView(bytes.buffer);
  [120, 100, 90, 90, 100, 0, 100, 15000, 20, 4000].forEach((value, i) =>
    v.setUint16(24 + i * 2, value, true)
  );
  bytes.set([248, 8, 3, 255, 3, 254], 48);
  return bytes;
}
describe('mapping files', () => {
  it('matches the firmware CRC standard vector', () =>
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926));
  it('round trips signed evidence without changing bytes', () => {
    const bytes = map();
    bytes[100] = 248;
    expect(importMap(exportMap(bytes))).toEqual(bytes);
  });
  it('rejects corrupt evidence, lengths and checksums', () => {
    const bytes = map();
    bytes[100] = 127;
    expect(() => validateMap(bytes)).toThrow();
    expect(() => validateMap(bytes.slice(1))).toThrow();
    const file = JSON.parse(exportMap(map()));
    file.layers[0].data[100] = 1;
    expect(() => importMap(JSON.stringify(file))).toThrow('checksum');
  });
  it('rejects unsupported coordinate frames', () => {
    const file = JSON.parse(exportMap(map()));
    file.frame.y = 'right';
    expect(() => importMap(JSON.stringify(file))).toThrow();
  });
});

class Characteristic extends EventTarget {
  value?: DataView;
  write: (packet: ArrayBuffer) => Promise<void> = async () => undefined;
  async startNotifications() {
    return this;
  }
  async writeValue(packet: ArrayBuffer) {
    await this.write(packet);
  }
  notify(bytes: Uint8Array) {
    this.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}
function robot(fragmentSize = 12) {
  const request = new Characteristic(),
    response = new Characteristic();
  const bytes = map(),
    staging = new Uint8Array(MAP_LENGTH);
  const writes: Uint8Array[] = [];
  let active = false;
  let intercept: ((request: DataView) => boolean) | undefined;
  request.write = async (packet) => {
    const req = new DataView(packet);
    writes.push(new Uint8Array(packet).slice());
    if (intercept?.(req)) return;
    const out = new Uint8Array(244),
      v = new DataView(out.buffer);
    out.set(new Uint8Array(packet).slice(0, 4));
    let length = 20;
    switch (req.getUint8(1)) {
      case 0:
        v.setUint8(13, fragmentSize);
        break;
      case 1:
      case 3:
        active = true;
        break;
      case 2:
        active = false;
        break;
      case 4:
        v.setUint8(5, active ? 1 : 0);
        v.setUint8(6, 1);
        v.setUint8(7, +active);
        break;
      case 5:
        v.setUint32(5, crc32(bytes), true);
        v.setUint32(9, bytes.length, true);
        break;
      case 6: {
        const offset = req.getUint16(4, true),
          n = Math.min(fragmentSize, bytes.length - offset);
        v.setUint16(5, offset, true);
        v.setUint8(7, n);
        out.set(bytes.slice(offset, offset + n), 8);
        length = 8 + n;
        break;
      }
      case 8: {
        const offset = req.getUint16(4, true),
          n = req.getUint8(6);
        staging.set(new Uint8Array(packet, 8, n), offset);
        break;
      }
    }
    response.notify(out.slice(0, length));
  };
  const service = {
    getCharacteristic: async (uuid: string) =>
      uuid === MAP_REQUEST_UUID ? request : response
  } as unknown as BluetoothRemoteGATTService;
  const client = new MappingClient(async (write) => write());
  return {
    client,
    service,
    bytes,
    staging,
    writes,
    response,
    setIntercept: (fn: typeof intercept) => {
      intercept = fn;
    }
  };
}
describe('mapping transport', () => {
  it('identifies motor-command interruptions and allows a subsequent request', async () => {
    const r = robot();
    await r.client.connect(r.service);
    r.setIntercept((req) => {
      if (req.getUint8(1) !== 7) return false;
      const bytes = new Uint8Array(20);
      bytes.set(new Uint8Array(req.buffer).slice(0, 4));
      bytes[4] = 3;
      r.response.notify(bytes);
      return true;
    });
    await expect(r.client.restore(r.bytes)).rejects.toThrow(
      'operation 7 (3): interrupted'
    );
    expect(r.client.busy).toBe(false);
    r.setIntercept(undefined);
    await r.client.restore(r.bytes);
    expect(r.staging).toEqual(r.bytes);
  });
  it.each([12, 236])(
    'saves and restores at %i-byte fragment size',
    async (size) => {
      const r = robot(size);
      await r.client.connect(r.service);
      expect(await r.client.snapshot()).toEqual(r.bytes);
      await r.client.restore(r.bytes);
      expect(r.staging).toEqual(r.bytes);
      expect(r.writes.every((w) => w.length <= size + 8)).toBe(true);
      expect((await r.client.status()).active).toBe(false);
    }
  );
  it('cancels bulk work without sending the remaining fragments', async () => {
    const r = robot(236);
    await r.client.connect(r.service);
    let cancel = false;
    const transfer = r.client.snapshot(() => {
      if (!cancel) {
        cancel = true;
        r.client.cancel();
      }
    });
    await expect(transfer).rejects.toThrow('cancelled');
    expect(r.writes.filter((w) => w[1] === 6)).toHaveLength(1);
    expect(r.client.busy).toBe(false);
  });
  it('reports missing replies and clears the request slot', async () => {
    vi.useFakeTimers();
    try {
      const r = robot();
      await r.client.connect(r.service);
      r.setIntercept((req) => req.getUint8(1) === 4);
      const failed = expect(r.client.status()).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(5001);
      await failed;
      r.setIntercept(undefined);
      expect((await r.client.status()).aligned).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects truncated replies and reconnects after disconnect during a transfer', async () => {
    const r = robot();
    await r.client.connect(r.service);
    r.setIntercept((req) => {
      if (req.getUint8(1) !== 4) return false;
      const bytes = new Uint8Array(req.buffer.slice(0, 5));
      r.response.notify(bytes);
      return true;
    });
    await expect(r.client.status()).rejects.toThrow('Truncated');
    r.setIntercept(undefined);
    await expect(
      r.client.snapshot(() => r.client.disconnect())
    ).rejects.toThrow('cancelled');
    await r.client.connect(r.service);
    expect(await r.client.snapshot()).toEqual(r.bytes);
  });
});
