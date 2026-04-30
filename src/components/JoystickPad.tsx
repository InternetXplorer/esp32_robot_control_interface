import { useEffect, useRef, useState } from 'react';
import {
  DriveCommand,
  mixJoystickAxes,
  normalizeJoystickPosition,
  zeroCommand
} from '../domain/motor';
import styles from './JoystickPad.module.css';

type Props = {
  disabled: boolean;
  resetToken: number;
  onCommandChange: (command: DriveCommand) => void;
};

type ThumbState = {
  x: number;
  y: number;
};

const centeredThumb = { x: 50, y: 50 };

export const JoystickPad = ({ disabled, resetToken, onCommandChange }: Props) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [thumb, setThumb] = useState<ThumbState>(centeredThumb);
  const [command, setCommand] = useState<DriveCommand>(zeroCommand());

  useEffect(() => {
    activePointerId.current = null;
    setThumb(centeredThumb);
    setCommand(zeroCommand());
  }, [resetToken]);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) {
      return;
    }

    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2 - 24;
    const normalized = normalizeJoystickPosition(clientX - centerX, clientY - centerY, radius);
    const nextCommand = mixJoystickAxes(normalized.x, normalized.y);
    setThumb({
      x: 50 + normalized.x * 38,
      y: 50 + normalized.y * 38
    });
    setCommand(nextCommand);
    onCommandChange(nextCommand);
  };

  const reset = () => {
    activePointerId.current = null;
    setThumb(centeredThumb);
    const stopped = zeroCommand();
    setCommand(stopped);
    onCommandChange(stopped);
  };

  return (
    <section className={styles.shell}>
      <div
        ref={padRef}
        className={`${styles.pad} ${disabled ? styles.disabled : ''}`}
        onPointerDown={(event) => {
          if (disabled || activePointerId.current !== null) {
            return;
          }

          event.preventDefault();
          activePointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (disabled || activePointerId.current !== event.pointerId) {
            return;
          }
          event.preventDefault();
          updateFromPointer(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (activePointerId.current !== event.pointerId) {
            return;
          }
          event.currentTarget.releasePointerCapture(event.pointerId);
          reset();
        }}
        onPointerCancel={(event) => {
          if (activePointerId.current !== event.pointerId) {
            return;
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          reset();
        }}
      >
        <div className={`${styles.guide} ${styles.guideHorizontal}`} />
        <div className={`${styles.guide} ${styles.guideVertical}`} />
        <div className={styles.thumb} style={{ left: `${thumb.x}%`, top: `${thumb.y}%` }} />
      </div>
      <div className={styles.readout}>
        <div className={styles.tile}>
          <p className={styles.label}>Left</p>
          <p className={styles.value}>{command.left}</p>
        </div>
        <div className={styles.tile}>
          <p className={styles.label}>Right</p>
          <p className={styles.value}>{command.right}</p>
        </div>
      </div>
    </section>
  );
};
