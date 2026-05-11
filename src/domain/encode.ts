import { clampMotorValue, DriveCommand, isZeroCommand } from './motor';

const STOP_COMMAND = 0x00;
const DRIVE_COMMAND = 0x01;

export const encodeDriveCommand = (command: DriveCommand): ArrayBuffer => {
  if (isZeroCommand(command)) {
    return Uint8Array.of(STOP_COMMAND).buffer;
  }

  const buffer = new ArrayBuffer(5);
  const view = new DataView(buffer);
  view.setUint8(0, DRIVE_COMMAND);
  view.setInt16(1, clampMotorValue(command.left), true);
  view.setInt16(3, clampMotorValue(command.right), true);
  return buffer;
};
