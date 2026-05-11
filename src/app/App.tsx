import { useEffect } from 'react';
import { WebBleMotorClient } from '../ble/client';
import { BleClientError } from '../ble/errors';
import { CommandRateLimiter } from '../domain/rateLimiter';
import { zeroCommand } from '../domain/motor';
import { useControllerStore } from '../state/controllerStore';
import { ConnectionPanel } from '../components/ConnectionPanel';
import { JoystickPad } from '../components/JoystickPad';
import { ModeToggle } from '../components/ModeToggle';
import { MotorSliders } from '../components/MotorSliders';
import { StatusBar } from '../components/StatusBar';
import { StopButton } from '../components/StopButton';
import styles from './App.module.css';

const buildInfo = __APP_BUILD_INFO__;

const bleClient = new WebBleMotorClient();
const rateLimiter = new CommandRateLimiter({
  intervalMs: 50,
  send: async (command) => {
    await bleClient.writeCommand(command);
  }
});

export const App = () => {
  const support = useControllerStore((state) => state.support);
  const mode = useControllerStore((state) => state.mode);
  const desiredCommand = useControllerStore((state) => state.desiredCommand);
  const resetToken = useControllerStore((state) => state.resetToken);
  const canReconnect = useControllerStore((state) => state.canReconnect);
  const connectionStatus = useControllerStore((state) => state.connectionStatus);
  const errorCategory = useControllerStore((state) => state.errorCategory);
  const bannerMessage = useControllerStore((state) => state.bannerMessage);
  const setSupport = useControllerStore((state) => state.setSupport);
  const setCanReconnect = useControllerStore((state) => state.setCanReconnect);
  const beginConnection = useControllerStore((state) => state.beginConnection);
  const setConnected = useControllerStore((state) => state.setConnected);
  const setDisconnected = useControllerStore((state) => state.setDisconnected);
  const beginDisconnect = useControllerStore((state) => state.beginDisconnect);
  const setDesiredCommand = useControllerStore((state) => state.setDesiredCommand);
  const emergencyResetUi = useControllerStore((state) => state.emergencyResetUi);
  const setMode = useControllerStore((state) => state.setMode);
  const clearBanner = useControllerStore((state) => state.clearBanner);

  const isConnected = connectionStatus === 'connected';
  const isBusy = connectionStatus === 'connecting' || connectionStatus === 'disconnecting';

  useEffect(() => {
    let cancelled = false;

    const inspectBrowserState = async () => {
      setSupport({
        isSecureContext: window.isSecureContext,
        webBluetoothSupported: 'bluetooth' in navigator
      });

      if (!bleClient.isSupported()) {
        return;
      }

      try {
        const [availability, reconnectable] = await Promise.all([
          bleClient.getAvailability(),
          bleClient.hasKnownDevice().catch(() => false)
        ]);

        if (!cancelled) {
          setSupport({ bluetoothAvailable: availability });
          setCanReconnect(reconnectable);
        }
      } catch (error) {
        if (!cancelled && error instanceof BleClientError) {
          setSupport({ bluetoothAvailable: false });
          setDisconnected(error.category);
        }
      }
    };

    void inspectBrowserState();
    return () => {
      cancelled = true;
    };
  }, [setCanReconnect, setConnected, setDisconnected, setSupport]);

  useEffect(() => {
    rateLimiter.setErrorHandler((error: unknown) => {
      setDisconnected(error instanceof BleClientError ? error.category : 'write-failed');
    });

    const unsubscribe = bleClient.onDisconnected(() => {
      rateLimiter.stop();
      setDisconnected('gatt-disconnected');
    });

    return () => {
      rateLimiter.setErrorHandler(undefined);
      unsubscribe();
    };
  }, [setDisconnected]);

  useEffect(() => {
    if (!isConnected) {
      rateLimiter.stop();
      return;
    }

    rateLimiter.setDesired(desiredCommand);
  }, [desiredCommand, isConnected]);

  useEffect(() => {
    const stopForVisibility = () => {
      if (document.visibilityState === 'hidden' && isConnected) {
        emergencyResetUi();
        rateLimiter.setDesired(zeroCommand());
      }
    };

    const stopForExit = () => {
      if (isConnected) {
        emergencyResetUi();
        rateLimiter.setDesired(zeroCommand());
      }
    };

    document.addEventListener('visibilitychange', stopForVisibility);
    window.addEventListener('pagehide', stopForExit);
    window.addEventListener('beforeunload', stopForExit);

    return () => {
      document.removeEventListener('visibilitychange', stopForVisibility);
      window.removeEventListener('pagehide', stopForExit);
      window.removeEventListener('beforeunload', stopForExit);
    };
  }, [emergencyResetUi, isConnected]);

  const connect = async () => {
    beginConnection();
    clearBanner();
    try {
      await bleClient.requestAndConnect();
      setConnected();
      setCanReconnect(true);
    } catch (error) {
      if (error instanceof BleClientError && error.category === 'user-cancelled') {
        setDisconnected(null);
        return;
      }
      setDisconnected(error instanceof BleClientError ? error.category : 'connection-failed');
    }
  };

  const reconnect = async () => {
    beginConnection();
    clearBanner();
    try {
      const connected = await bleClient.reconnectKnownDevice();
      if (connected) {
        setConnected();
      } else {
        setDisconnected(null);
        setCanReconnect(false);
      }
    } catch (error) {
      setDisconnected(error instanceof BleClientError ? error.category : 'connection-failed');
    }
  };

  const disconnect = async () => {
    beginDisconnect();
    emergencyResetUi();
    try {
      await bleClient.disconnect();
    } finally {
      setDisconnected(null);
    }
  };

  const stop = async () => {
    emergencyResetUi();
  };

  const switchMode = (nextMode: 'drive' | 'direct') => {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
  };

  return (
    <main className={styles.shell}>
      <StatusBar
        mode={mode}
        command={desiredCommand}
        isConnected={isConnected}
        bluetoothAvailable={support.bluetoothAvailable}
        isSupported={support.isSecureContext && support.webBluetoothSupported}
      />
      {bannerMessage && <div className={styles.banner}>{bannerMessage}</div>}
      <ConnectionPanel
        isSupported={support.isSecureContext && support.webBluetoothSupported}
        isSecureContext={support.isSecureContext}
        bluetoothAvailable={support.bluetoothAvailable}
        isConnecting={isBusy}
        isConnected={isConnected}
        canReconnect={canReconnect}
        errorCategory={errorCategory}
        onConnect={() => void connect()}
        onReconnect={() => void reconnect()}
        onDisconnect={() => void disconnect()}
      />
      <section className={styles.controlCard}>
        <p className={styles.sectionLabel}>Control Mode</p>
        <ModeToggle mode={mode} disabled={!isConnected} onModeChange={switchMode} />
        {mode === 'drive' ? (
          <JoystickPad
            disabled={!isConnected}
            resetToken={resetToken}
            onCommandChange={setDesiredCommand}
          />
        ) : (
          <MotorSliders
            disabled={!isConnected}
            resetToken={resetToken}
            onCommandChange={setDesiredCommand}
          />
        )}
      </section>
      <StopButton onPress={() => void stop()} />
      <footer className={styles.buildInfo}>
        v{buildInfo.version} - {buildInfo.branch} - {buildInfo.commit}
      </footer>
    </main>
  );
};
