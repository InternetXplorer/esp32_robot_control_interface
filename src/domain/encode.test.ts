import {
  encodeDriveUntilObstacleCommand,
  encodeDriveUntilObstacleTurnRightAndDriveCommand,
  encodeDriveCommand,
  encodeResetOriginCommand,
  encodeReturnToOriginCommand,
  encodeStopCommand
} from './encode';

const toBytes = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer));

describe('encodeDriveCommand', () => {
  it('encodes stop as a single-byte packet', () => {
    expect(toBytes(encodeStopCommand())).toEqual([0x00]);
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

describe('encodeReturnToOriginCommand', () => {
  it('encodes return to origin as a single-byte packet', () => {
    expect(toBytes(encodeReturnToOriginCommand())).toEqual([0x02]);
  });
});

describe('encodeResetOriginCommand', () => {
  it('encodes reset origin as a single-byte packet', () => {
    expect(toBytes(encodeResetOriginCommand())).toEqual([0x03]);
  });
});

describe('encodeDriveUntilObstacleCommand', () => {
  it('encodes the stop distance as an unsigned little-endian value', () => {
    expect(toBytes(encodeDriveUntilObstacleCommand(200))).toEqual([0x06, 0xc8, 0x00]);
  });

  it('rejects distances that cannot be represented as a u16', () => {
    expect(() => encodeDriveUntilObstacleCommand(-1)).toThrow(RangeError);
    expect(() => encodeDriveUntilObstacleCommand(65_536)).toThrow(RangeError);
    expect(() => encodeDriveUntilObstacleCommand(12.5)).toThrow(RangeError);
  });
});

describe('encodeDriveUntilObstacleTurnRightAndDriveCommand', () => {
  it('encodes the stop distance as an unsigned little-endian value', () => {
    expect(toBytes(encodeDriveUntilObstacleTurnRightAndDriveCommand(200))).toEqual([0x08, 0xc8, 0x00]);
  });
});
