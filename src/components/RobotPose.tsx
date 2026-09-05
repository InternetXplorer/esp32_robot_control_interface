import { useRef, useState } from 'react';
import { RobotDiagnostics } from '../ble/client';
import styles from './RobotPose.module.css';

type Props = {
  diagnostics: RobotDiagnostics;
  disabled: boolean;
  onResetOrigin: () => Promise<void>;
};

const normalizeHeading = (headingMdeg: number): number => {
  const degrees = headingMdeg / 1000;
  return ((degrees % 360) + 360) % 360;
};

const formatHeading = (headingDegrees: number): string => `${headingDegrees.toFixed(1)}°`;

export const RobotPose = ({ diagnostics, disabled, onResetOrigin }: Props) => {
  const [isResetting, setIsResetting] = useState(false);
  const originAngle = useRef<{ wrapped: number; unwrapped: number } | null>(null);
  // Keep the accumulated value for the transform: CSS can then animate past
  // full turns (for example 359° → 360° → 361°) without reversing at 0°.
  // Odometry uses counterclockwise-positive angles, whereas CSS rotation is
  // clockwise-positive on screen, so negate it for this compass display.
  const unwrappedHeadingDegrees = -diagnostics.headingMdeg / 1000;
  const headingDegrees = normalizeHeading(-diagnostics.headingMdeg);
  const headingLabel = formatHeading(headingDegrees);
  const isAtOrigin = diagnostics.xMm === 0 && diagnostics.yMm === 0;
  // atan2 returns the counterclockwise-positive bearing used by odometry.
  // Negate it to place the origin marker correctly in CSS screen coordinates.
  const originDirectionDegrees = isAtOrigin
    ? null
    : -Math.atan2(-diagnostics.yMm, -diagnostics.xMm) * (180 / Math.PI);
  let unwrappedOriginDirectionDegrees: number | null = null;

  if (originDirectionDegrees === null) {
    originAngle.current = null;
  } else if (originAngle.current === null) {
    originAngle.current = {
      wrapped: originDirectionDegrees,
      unwrapped: originDirectionDegrees
    };
    unwrappedOriginDirectionDegrees = originDirectionDegrees;
  } else {
    // atan2 wraps at ±180°. Apply only the shortest angular difference so
    // the marker remains continuous when the origin crosses the bottom edge.
    const delta = ((originDirectionDegrees - originAngle.current.wrapped + 540) % 360) - 180;
    originAngle.current = {
      wrapped: originDirectionDegrees,
      unwrapped: originAngle.current.unwrapped + delta
    };
    unwrappedOriginDirectionDegrees = originAngle.current.unwrapped;
  }

  const resetOrigin = async () => {
    if (disabled || isResetting) {
      return;
    }

    setIsResetting(true);
    try {
      await onResetOrigin();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <section className={styles.card} aria-label="Robot position and heading">
      <div className={styles.header}>
        <div>
          <p className={styles.sectionLabel}>Robot pose</p>
          <p className={styles.summary}>Live position and orientation</p>
        </div>
        {diagnostics.odometryStale && <span className={styles.stale}>Odometry stale</span>}
      </div>
      <div className={styles.content}>
        <div className={styles.compass} aria-label={`Heading ${headingLabel}`}>
          <span className={styles.north}>N</span>
          <span className={styles.east}>E</span>
          <span className={styles.south}>S</span>
          <span className={styles.west}>W</span>
          <div
            className={styles.needle}
            style={{ transform: `rotate(${unwrappedHeadingDegrees}deg)` }}
          >
            <span className={styles.arrow}>▲</span>
          </div>
          {unwrappedOriginDirectionDegrees !== null && (
            <div
              aria-label="Direction to origin"
              className={styles.homeNeedle}
              style={{ transform: `rotate(${unwrappedOriginDirectionDegrees}deg)` }}
            >
              <span className={styles.homeArrow} />
            </div>
          )}
          <span className={styles.robot}>Robot</span>
        </div>
        <div className={styles.readings}>
          <div className={styles.reading}>
            <p className={styles.label}>Heading</p>
            <p className={styles.value}>{headingLabel}</p>
            <p className={styles.detail}>Normalized to 0–360°</p>
            <p className={`${styles.detail} ${styles.homeLegend}`}>
              <span className={styles.homeKey} />
              {isAtOrigin ? 'At origin' : 'Marker points to origin'}
            </p>
          </div>
          <div className={styles.coordinateGrid}>
            <div className={styles.coordinate}>
              <p className={styles.label}>X position</p>
              <p className={styles.value}>{diagnostics.xMm} mm</p>
            </div>
            <div className={styles.coordinate}>
              <p className={styles.label}>Y position</p>
              <p className={styles.value}>{diagnostics.yMm} mm</p>
            </div>
          </div>
          <button
            className={styles.resetButton}
            disabled={disabled || isResetting}
            onClick={() => void resetOrigin()}
            type="button"
          >
            {isResetting ? 'Resetting origin…' : 'Reset origin'}
          </button>
        </div>
      </div>
    </section>
  );
};
