import { encodeDriveCommand } from './encode';

const toBytes = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer));

describe('encodeDriveCommand', () => {
  it('encodes stop as a single-byte packet', () => {
    expect(toBytes(encodeDriveCommand({ left: 0, right: 0 }))).toEqual([0x00]);
  });

  it('encodes representative drive packets as little-endian signed i16 values', () => {
    expect(toBytes(encodeDriveCommand({ left: 50, right: 50 }))).toEqual([0x01, 0x32, 0x00, 0x32, 0x00]);
    expect(toBytes(encodeDriveCommand({ left: -50, right: 50 }))).toEqual([0x01, 0xce, 0xff, 0x32, 0x00]);
    expect(toBytes(encodeDriveCommand({ left: 100, right: -100 }))).toEqual([0x01, 0x64, 0x00, 0x9c, 0xff]);
  });

  it('clamps out-of-range values before encoding', () => {
    expect(toBytes(encodeDriveCommand({ left: -999, right: 999 }))).toEqual([0x01, 0x9c, 0xff, 0x64, 0x00]);
  });
});
