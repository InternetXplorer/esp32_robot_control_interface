import { useEffect, useState } from 'react';
import { clampMotorValue, DriveCommand, zeroCommand } from '../domain/motor';
import styles from './MotionTestButtons.module.css';

type Props = {
  disabled: boolean;
  resetToken: number;
  onCommandChange: (command: DriveCommand) => void;
};

type TestAction = {
  id: string;
  label: string;
  leftDirection: -1 | 1;
  rightDirection: -1 | 1;
};

const actions: TestAction[] = [
  { id: 'forward', label: 'Forward', leftDirection: 1, rightDirection: 1 },
  { id: 'backward', label: 'Backward', leftDirection: -1, rightDirection: -1 },
  { id: 'rotate-left', label: 'Rotate left', leftDirection: -1, rightDirection: 1 },
  { id: 'rotate-right', label: 'Rotate right', leftDirection: 1, rightDirection: -1 }
];

const buildCommand = (action: TestAction, speed: number): DriveCommand => ({
  left: clampMotorValue(action.leftDirection * speed),
  right: clampMotorValue(action.rightDirection * speed)
});

export const MotionTestButtons = ({ disabled, resetToken, onCommandChange }: Props) => {
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(100);

  useEffect(() => {
    setActiveActionId(null);
  }, [resetToken]);

  const startAction = (action: TestAction) => {
    if (disabled) {
      return;
    }

    setActiveActionId(action.id);
    onCommandChange(buildCommand(action, speed));
  };

  const stopAction = () => {
    setActiveActionId(null);
    onCommandChange(zeroCommand());
  };

  const updateSpeed = (nextSpeed: number) => {
    const sanitized = clampMotorValue(nextSpeed);
    setSpeed(sanitized);

    const activeAction = actions.find((action) => action.id === activeActionId);
    if (activeAction) {
      onCommandChange(buildCommand(activeAction, sanitized));
    }
  };

  return (
    <section className={`${styles.shell} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.speedControl}>
        <div className={styles.speedHeader}>
          <label className={styles.speedLabel} htmlFor="test-speed">
            Speed
          </label>
          <span className={styles.speedValue}>{speed}</span>
        </div>
        <input
          id="test-speed"
          className={styles.speedTrack}
          disabled={disabled}
          max={100}
          min={0}
          onChange={(event) => updateSpeed(Number(event.target.value))}
          step={1}
          type="range"
          value={speed}
        />
      </div>
      <div className={styles.panel}>
        {actions.map((action) => {
          const command = buildCommand(action, speed);

          return (
            <button
              key={action.id}
              className={`${styles.button} ${activeActionId === action.id ? styles.active : ''}`}
              disabled={disabled}
              onBlur={stopAction}
              onKeyDown={(event) => {
                if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) {
                  return;
                }

                event.preventDefault();
                startAction(action);
              }}
              onKeyUp={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return;
                }

                event.preventDefault();
                stopAction();
              }}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                stopAction();
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                startAction(action);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                stopAction();
              }}
              type="button"
            >
              <span className={styles.label}>{action.label}</span>
              <span className={styles.values}>
                {command.left} / {command.right}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
