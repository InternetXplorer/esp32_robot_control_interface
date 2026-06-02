import { useState } from 'react';
import styles from './AutonomyPanel.module.css';

type Props = {
  disabled: boolean;
  onReturnToOrigin: () => Promise<void>;
};

export const AutonomyPanel = ({ disabled, onReturnToOrigin }: Props) => {
  const [isSending, setIsSending] = useState(false);

  const sendReturnToOrigin = async () => {
    if (disabled || isSending) {
      return;
    }

    setIsSending(true);
    try {
      await onReturnToOrigin();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className={`${styles.shell} ${disabled ? styles.disabled : ''}`}>
      <button
        className={styles.commandButton}
        disabled={disabled || isSending}
        onClick={() => void sendReturnToOrigin()}
        type="button"
      >
        <span className={styles.label}>Return to origin</span>
      </button>
    </section>
  );
};
