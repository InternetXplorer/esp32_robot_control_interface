export const DEVICE_NAME_HINT = 'Wheeled Robot';
export const MOTOR_SERVICE_UUID = '12345678-1234-5678-9abc-def012345700';
export const COMMAND_CHARACTERISTIC_UUID = '12345678-1234-5678-9abc-def012345701';

export const REQUEST_DEVICE_OPTIONS: RequestDeviceOptions = {
  filters: [{ services: [MOTOR_SERVICE_UUID] }],
  optionalServices: [MOTOR_SERVICE_UUID]
};
