import styles from './StopButton.module.css';

type Props = {
  onPress: () => void;
};

export const StopButton = ({ onPress }: Props) => (
  <button className={styles.stop} onClick={onPress} type="button">
    STOP
  </button>
);

