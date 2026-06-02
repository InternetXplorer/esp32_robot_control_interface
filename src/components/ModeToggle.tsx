import { ControlMode } from '../state/controllerStore';
import styles from './ModeToggle.module.css';

type Props = {
  mode: ControlMode;
  disabled: boolean;
  onModeChange: (mode: ControlMode) => void;
};

export const ModeToggle = ({ mode, disabled, onModeChange }: Props) => (
  <div className={styles.toggle} role="tablist" aria-label="Control mode">
    <button
      className={`${styles.button} ${mode === 'drive' ? styles.active : ''}`}
      disabled={disabled}
      onClick={() => onModeChange('drive')}
      role="tab"
      aria-selected={mode === 'drive'}
      type="button"
    >
      Drive
    </button>
    <button
      className={`${styles.button} ${mode === 'direct' ? styles.active : ''}`}
      disabled={disabled}
      onClick={() => onModeChange('direct')}
      role="tab"
      aria-selected={mode === 'direct'}
      type="button"
    >
      Direct
    </button>
    <button
      className={`${styles.button} ${mode === 'test' ? styles.active : ''}`}
      disabled={disabled}
      onClick={() => onModeChange('test')}
      role="tab"
      aria-selected={mode === 'test'}
      type="button"
    >
      Test
    </button>
    <button
      className={`${styles.button} ${mode === 'autonomy' ? styles.active : ''}`}
      disabled={disabled}
      onClick={() => onModeChange('autonomy')}
      role="tab"
      aria-selected={mode === 'autonomy'}
      type="button"
    >
      Autonomy
    </button>
  </div>
);
