import { encodeMotorValue } from './encode';

const decode = (buffer: ArrayBuffer) => new DataView(buffer).getInt16(0, true);

describe('encodeMotorValue', () => {
  it('encodes representative values as little-endian i16', () => {
    expect(decode(encodeMotorValue(-100))).toBe(-100);
    expect(decode(encodeMotorValue(-1))).toBe(-1);
    expect(decode(encodeMotorValue(0))).toBe(0);
    expect(decode(encodeMotorValue(1))).toBe(1);
    expect(decode(encodeMotorValue(100))).toBe(100);
  });

  it('clamps out-of-range values before encoding', () => {
    expect(decode(encodeMotorValue(-999))).toBe(-100);
    expect(decode(encodeMotorValue(999))).toBe(100);
  });
});

