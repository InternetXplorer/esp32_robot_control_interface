export const DEVICE_NAME_HINT = 'BiMotor Car';
export const MOTOR_SERVICE_UUID = '12345678-1234-5678-9abc-def012345678';
export const LEFT_MOTOR_CHARACTERISTIC_UUID = '12345678-1234-5678-9abc-def012345679';
export const RIGHT_MOTOR_CHARACTERISTIC_UUID = '12345678-1234-5678-9abc-def012345680';

export const REQUEST_DEVICE_OPTIONS: RequestDeviceOptions = {
  filters: [{ services: [MOTOR_SERVICE_UUID] }],
  optionalServices: [MOTOR_SERVICE_UUID]
};

