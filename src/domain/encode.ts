import { clampMotorValue } from './motor';

export const encodeMotorValue = (value: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setInt16(0, clampMotorValue(value), true);
  return buffer;
};

