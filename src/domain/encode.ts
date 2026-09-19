import { clampMotorValue, DriveCommand, isZeroCommand } from './motor';

const STOP_COMMAND = 0x00;
const DRIVE_COMMAND = 0x01;
const RETURN_TO_ORIGIN_COMMAND = 0x02;
const RESET_ORIGIN_COMMAND = 0x03;
const DRIVE_UNTIL_OBSTACLE_COMMAND = 0x06;
const DRIVE_UNTIL_OBSTACLE_AND_RETURN_COMMAND = 0x07;

export const encodeStopCommand = (): ArrayBuffer => Uint8Array.of(STOP_COMMAND).buffer;

export const encodeDriveCommand = (command: DriveCommand): ArrayBuffer => {
  if (isZeroCommand(command)) {
    return encodeStopCommand();
  }

  const buffer = new ArrayBuffer(5);
  const view = new DataView(buffer);
  view.setUint8(0, DRIVE_COMMAND);
  view.setInt16(1, clampMotorValue(command.left), true);
  view.setInt16(3, clampMotorValue(command.right), true);
  return buffer;
};

export const encodeReturnToOriginCommand = (): ArrayBuffer =>
  Uint8Array.of(RETURN_TO_ORIGIN_COMMAND).buffer;

export const encodeResetOriginCommand = (): ArrayBuffer => Uint8Array.of(RESET_ORIGIN_COMMAND).buffer;

const encodeObstacleCommand = (command: number, stopDistanceMm: number): ArrayBuffer => {
  if (!Number.isInteger(stopDistanceMm) || stopDistanceMm < 0 || stopDistanceMm > 0xffff) {
    throw new RangeError('Obstacle stop distance must be an unsigned 16-bit integer.');
  }

  const buffer = new ArrayBuffer(3);
  const view = new DataView(buffer);
  view.setUint8(0, command);
  view.setUint16(1, stopDistanceMm, true);
  return buffer;
};

export const encodeDriveUntilObstacleCommand = (stopDistanceMm: number): ArrayBuffer =>
  encodeObstacleCommand(DRIVE_UNTIL_OBSTACLE_COMMAND, stopDistanceMm);

export const encodeDriveUntilObstacleAndReturnCommand = (stopDistanceMm: number): ArrayBuffer =>
  encodeObstacleCommand(DRIVE_UNTIL_OBSTACLE_AND_RETURN_COMMAND, stopDistanceMm);
