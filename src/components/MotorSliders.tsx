import { useEffect, useState } from 'react';
import { clampMotorValue, DriveCommand, zeroCommand } from '../domain/motor';
import styles from './MotorSliders.module.css';

type Props = {
  disabled: boolean;
  resetToken: number;
  onCommandChange: (command: DriveCommand) => void;
};

export const MotorSliders = ({ disabled, resetToken, onCommandChange }: Props) => {
  const [command, setCommand] = useState<DriveCommand>(zeroCommand());

  useEffect(() => {
    const stopped = zeroCommand();
    setCommand(stopped);
  }, [resetToken]);

  const updateCommand = (next: DriveCommand) => {
    const sanitized = {
      left: clampMotorValue(next.left),
      right: clampMotorValue(next.right)
    };
    setCommand(sanitized);
    onCommandChange(sanitized);
  };

  return (
    <section className={styles.panel}>
      <div className={`${styles.sliderCard} ${disabled ? styles.disabled : ''}`}>
        <p className={styles.label}>Left</p>
        <p className={styles.value}>{command.left}</p>
        <input
          className={styles.track}
          type="range"
          min={-100}
          max={100}
          step={1}
          value={command.left}
          disabled={disabled}
          onChange={(event) =>
            updateCommand({ left: Number(event.target.value), right: command.right })
          }
        />
        <p className={styles.hint}>0 centered</p>
      </div>
      <div className={`${styles.sliderCard} ${disabled ? styles.disabled : ''}`}>
        <p className={styles.label}>Right</p>
        <p className={styles.value}>{command.right}</p>
        <input
          className={styles.track}
          type="range"
          min={-100}
          max={100}
          step={1}
          value={command.right}
          disabled={disabled}
          onChange={(event) =>
            updateCommand({ left: command.left, right: Number(event.target.value) })
          }
        />
        <p className={styles.hint}>0 centered</p>
      </div>
    </section>
  );
};

