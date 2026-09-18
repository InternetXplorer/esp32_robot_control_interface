import { useState } from 'react';
import styles from './AutonomyPanel.module.css';

type Props = {
  disabled: boolean;
  onDriveUntilObstacle: () => Promise<void>;
  onDriveUntilObstacleAndReturn: () => Promise<void>;
  onReturnToOrigin: () => Promise<void>;
};

export const AutonomyPanel = ({
  disabled,
  onDriveUntilObstacle,
  onDriveUntilObstacleAndReturn,
  onReturnToOrigin
}: Props) => {
  const [isSending, setIsSending] = useState(false);

  const sendCommand = async (command: () => Promise<void>) => {
    if (disabled || isSending) {
      return;
    }

    setIsSending(true);
    try {
      await command();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className={`${styles.shell} ${disabled ? styles.disabled : ''}`}>
      <button
        className={styles.commandButton}
        disabled={disabled || isSending}
        onClick={() => void sendCommand(onDriveUntilObstacle)}
        type="button"
      >
        <span className={styles.label}>Drive until obstacle</span>
        <span className={styles.detail}>Stop 20 cm away</span>
      </button>
      <button
        className={styles.commandButton}
        disabled={disabled || isSending}
        onClick={() => void sendCommand(onDriveUntilObstacleAndReturn)}
        type="button"
      >
        <span className={styles.label}>Drive until obstacle, then return</span>
        <span className={styles.detail}>Stop 20 cm away, then return to origin</span>
      </button>
      <button
        className={styles.commandButton}
        disabled={disabled || isSending}
        onClick={() => void sendCommand(onReturnToOrigin)}
        type="button"
      >
        <span className={styles.label}>Return to origin</span>
      </button>
    </section>
  );
};
