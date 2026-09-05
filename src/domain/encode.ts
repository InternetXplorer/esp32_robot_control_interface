import { clampMotorValue, DriveCommand, isZeroCommand } from './motor';

const STOP_COMMAND = 0x00;
const DRIVE_COMMAND = 0x01;
const RETURN_TO_ORIGIN_COMMAND = 0x02;
const RESET_ORIGIN_COMMAND = 0x03;

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
