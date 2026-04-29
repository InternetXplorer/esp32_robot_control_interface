export type BleErrorCategory =
  | 'unsupported'
  | 'insecure-context'
  | 'bluetooth-unavailable'
  | 'user-cancelled'
  | 'connection-failed'
  | 'gatt-disconnected'
  | 'write-failed';

export class BleClientError extends Error {
  constructor(
    public readonly category: BleErrorCategory,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'BleClientError';
  }
}

export const getErrorMessage = (category: BleErrorCategory): string => {
  switch (category) {
    case 'unsupported':
      return 'Web Bluetooth is not available in this browser.';
    case 'insecure-context':
      return 'Use Android Chrome over HTTPS to enable Bluetooth.';
    case 'bluetooth-unavailable':
      return 'Bluetooth is unavailable or disabled. Check Android Bluetooth settings.';
    case 'user-cancelled':
      return 'Device selection was cancelled.';
    case 'connection-failed':
      return 'Could not connect to the ESP32 controller.';
    case 'gatt-disconnected':
      return 'Device disconnected, motors forced to stop on firmware side.';
    case 'write-failed':
      return 'A motor command failed to send. Reconnect and try again.';
    default:
      return 'Bluetooth error.';
  }
};

export const normalizeBleError = (error: unknown): BleClientError => {
  if (error instanceof BleClientError) {
    return error;
  }

  if (error instanceof DOMException) {
    if (error.name === 'NotFoundError') {
      return new BleClientError('user-cancelled', 'User cancelled the device chooser.', {
        cause: error
      });
    }

    if (error.name === 'NotSupportedError' || error.name === 'SecurityError') {
      return new BleClientError(
        window.isSecureContext ? 'unsupported' : 'insecure-context',
        error.message,
        { cause: error }
      );
    }

    if (error.name === 'NetworkError') {
      return new BleClientError('connection-failed', error.message, { cause: error });
    }
  }

  return new BleClientError('connection-failed', 'Unknown BLE error.', {
    cause: error instanceof Error ? error : undefined
  });
};

