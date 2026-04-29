export type MotorValue = number;

export type DriveCommand = {
  left: MotorValue;
  right: MotorValue;
};

export type JoystickVector = {
  x: number;
  y: number;
};

export const MOTOR_MIN = -100;
export const MOTOR_MAX = 100;
export const DEFAULT_DEAD_ZONE = 0.05;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const clampMotorValue = (value: number): MotorValue => clamp(Math.round(value), MOTOR_MIN, MOTOR_MAX);

export const zeroCommand = (): DriveCommand => ({ left: 0, right: 0 });

export const isZeroCommand = (command: DriveCommand): boolean => command.left === 0 && command.right === 0;

export const mixJoystickAxes = (x: number, y: number): DriveCommand => {
  const speed = -y * 100;
  const turn = x * 100;

  return {
    left: clampMotorValue(speed + turn),
    right: clampMotorValue(speed - turn)
  };
};

export const applyRadialDeadZone = (
  x: number,
  y: number,
  deadZone: number = DEFAULT_DEAD_ZONE
): JoystickVector => {
  const magnitude = Math.hypot(x, y);

  if (magnitude <= deadZone) {
    return { x: 0, y: 0 };
  }

  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }

  const scaledMagnitude = clamp((magnitude - deadZone) / (1 - deadZone), 0, 1);
  const scale = scaledMagnitude / magnitude;

  return {
    x: x * scale,
    y: y * scale
  };
};

export const normalizeJoystickPosition = (
  deltaX: number,
  deltaY: number,
  radius: number,
  deadZone: number = DEFAULT_DEAD_ZONE
): JoystickVector => {
  if (radius <= 0) {
    return { x: 0, y: 0 };
  }

  const rawX = deltaX / radius;
  const rawY = deltaY / radius;
  const magnitude = Math.hypot(rawX, rawY);

  if (magnitude <= 1) {
    return applyRadialDeadZone(rawX, rawY, deadZone);
  }

  const clampedX = rawX / magnitude;
  const clampedY = rawY / magnitude;
  return applyRadialDeadZone(clampedX, clampedY, deadZone);
};

