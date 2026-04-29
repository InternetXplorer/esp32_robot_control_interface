import {
  applyRadialDeadZone,
  clampMotorValue,
  mixJoystickAxes,
  normalizeJoystickPosition
} from './motor';

describe('clampMotorValue', () => {
  it('clamps and rounds motor values', () => {
    expect(clampMotorValue(-150)).toBe(-100);
    expect(clampMotorValue(-99.6)).toBe(-100);
    expect(clampMotorValue(12.4)).toBe(12);
    expect(clampMotorValue(130)).toBe(100);
  });
});

describe('mixJoystickAxes', () => {
  it('mixes forward and turn input into left and right motor outputs', () => {
    expect(mixJoystickAxes(0, -1)).toEqual({ left: 100, right: 100 });
    expect(mixJoystickAxes(1, 0)).toEqual({ left: 100, right: -100 });
    expect(mixJoystickAxes(0.25, -0.5)).toEqual({ left: 75, right: 25 });
  });
});

describe('dead zone behavior', () => {
  it('zeros vectors inside the radial dead zone', () => {
    expect(applyRadialDeadZone(0.02, 0.03, 0.05)).toEqual({ x: 0, y: 0 });
  });

  it('rescales vectors outside the dead zone', () => {
    const result = applyRadialDeadZone(0.2, 0, 0.05);
    expect(result.x).toBeCloseTo(0.1578947);
    expect(result.y).toBe(0);
  });

  it('normalizes positions to the unit circle', () => {
    const result = normalizeJoystickPosition(500, 0, 100, 0.05);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(0);
  });
});

