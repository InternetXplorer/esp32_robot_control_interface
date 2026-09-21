import { describe, expect, it } from 'vitest';
import { crc32, MAP_LENGTH, validateMap } from './mapping';
import { exportMap, importMap } from '../domain/mapStorage';
function map(): Uint8Array {
  const bytes = new Uint8Array(MAP_LENGTH);
  bytes.set([82, 77, 65, 80, 1, 0, 100, 0]);
  bytes.set([200, 0, 200, 0], 20);
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
