import { ControlMode } from '../state/controllerStore';
import { DriveCommand } from '../domain/motor';
import styles from './StatusBar.module.css';

type Props = {
  mode: ControlMode;
  command: DriveCommand;
  isConnected: boolean;
  bluetoothAvailable: boolean | null;
  isSupported: boolean;
};

export const StatusBar = ({
  mode,
  command,
  isConnected,
  bluetoothAvailable,
  isSupported
}: Props) => {
  const supportLabel = !isSupported
    ? 'Unsupported'
    : bluetoothAvailable === false
      ? 'Bluetooth off'
      : 'Ready';

  return (
    <header className={styles.bar}>
      <div className={styles.topline}>
        <div>
          <p className={styles.eyebrow}>BiMotor Car</p>
          <p className={styles.status}>{isConnected ? 'Connected' : 'Disconnected'}</p>
        </div>
        <p className={styles.eyebrow}>Android Chrome</p>
      </div>
      <div className={styles.grid}>
        <div className={styles.tile}>
          <p className={styles.label}>Mode</p>
          <p className={styles.value}>{mode === 'drive' ? 'Drive' : 'Direct'}</p>
        </div>
        <div className={styles.tile}>
          <p className={styles.label}>Left / Right</p>
          <p className={`${styles.value} ${styles.commandValue}`}>
            <span className={styles.motorValue}>{command.left}</span>
            <span className={styles.separator}> / </span>
            <span className={styles.motorValue}>{command.right}</span>
          </p>
        </div>
        <div className={styles.tile}>
          <p className={styles.label}>Support</p>
          <p className={styles.value}>{supportLabel}</p>
        </div>
      </div>
    </header>
  );
};
