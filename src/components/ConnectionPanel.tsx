import styles from './ConnectionPanel.module.css';
import { BleErrorCategory, getErrorMessage } from '../ble/errors';

type Props = {
  isSupported: boolean;
  isSecureContext: boolean;
  bluetoothAvailable: boolean | null;
  isConnecting: boolean;
  isConnected: boolean;
  canReconnect: boolean;
  errorCategory: BleErrorCategory | null;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
};

export const ConnectionPanel = ({
  isSupported,
  isSecureContext,
  bluetoothAvailable,
  isConnecting,
  isConnected,
  canReconnect,
  errorCategory,
  onConnect,
  onReconnect,
  onDisconnect
}: Props) => {
  const setupMessage = !isSecureContext
    ? 'Use Android Chrome over HTTPS.'
    : bluetoothAvailable === false
      ? 'Bluetooth is unavailable or disabled.'
      : 'Use Android Chrome over HTTPS.';

  return (
    <section className={styles.panel}>
      <p className={styles.message}>{setupMessage}</p>
      {!isSupported && (
        <p className={`${styles.message} ${styles.error}`}>
          {!isSecureContext
            ? getErrorMessage('insecure-context')
            : getErrorMessage('unsupported')}
        </p>
      )}
      {errorCategory && errorCategory !== 'user-cancelled' && (
        <p className={`${styles.message} ${styles.error}`}>{getErrorMessage(errorCategory)}</p>
      )}
      <div className={styles.actions}>
        <button
          className={`${styles.button} ${styles.primary}`}
          disabled={!isSupported || isConnecting || isConnected}
          onClick={onConnect}
          type="button"
        >
          {isConnecting ? 'Connecting…' : 'Connect'}
        </button>
        {canReconnect && !isConnected && (
          <button
            className={`${styles.button} ${styles.secondary}`}
            disabled={!isSupported || isConnecting}
            onClick={onReconnect}
            type="button"
          >
            Reconnect
          </button>
        )}
        <button
          className={`${styles.button} ${styles.secondary}`}
          disabled={!isConnected}
          onClick={onDisconnect}
          type="button"
        >
          Disconnect
        </button>
      </div>
    </section>
  );
};

