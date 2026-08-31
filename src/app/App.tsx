import { useEffect, useState } from 'react';
import { RobotDiagnostics, WebBleMotorClient } from '../ble/client';
import { BleClientError } from '../ble/errors';
import { CommandRateLimiter } from '../domain/rateLimiter';
import { zeroCommand } from '../domain/motor';
import { useControllerStore } from '../state/controllerStore';
import { AutonomyPanel } from '../components/AutonomyPanel';
import { ConnectionPanel } from '../components/ConnectionPanel';
import { JoystickPad } from '../components/JoystickPad';
import { ModeToggle } from '../components/ModeToggle';
import { MotionTestButtons } from '../components/MotionTestButtons';
import { MotorSliders } from '../components/MotorSliders';
import { RobotPose } from '../components/RobotPose';
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
  const [diagnostics, setDiagnostics] = useState<RobotDiagnostics | null>(null);
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

  useEffect(() => bleClient.onDiagnostics(setDiagnostics), []);

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
    rateLimiter.stop();
    emergencyResetUi();
    try {
      await bleClient.disconnect();
    } finally {
      setDisconnected(null);
    }
  };

  const stop = async () => {
    rateLimiter.stop();
    emergencyResetUi();

    if (!isConnected) {
      return;
    }

    try {
      // Do not bypass the limiter here. A slider write can still be awaiting
      // its GATT response; the limiter coalesces the requested zero and sends
      // it immediately after that write instead of issuing concurrent ATT
      // operations. The UI reset above also triggers the normal desired-
      // command effect, which deduplicates this same zero command.
      rateLimiter.setDesired(zeroCommand());
      await rateLimiter.flushNow();
    } catch (error) {
      setDisconnected(error instanceof BleClientError ? error.category : 'write-failed');
    }
  };

  const returnToOrigin = async () => {
    if (!isConnected) {
      return;
    }

    rateLimiter.stop();
    try {
      await bleClient.returnToOrigin();
    } catch (error) {
      setDisconnected(error instanceof BleClientError ? error.category : 'write-failed');
    }
  };

  const resetOrigin = async () => {
    if (!isConnected) {
      return;
    }

    // Origin must be captured while stopped. Queue the stop before the reset
    // on the same BLE write stream so it cannot race an in-flight drive write.
    rateLimiter.stop();
    emergencyResetUi();
    try {
      await bleClient.emergencyStop();
      await bleClient.resetOrigin();
    } catch (error) {
      setDisconnected(error instanceof BleClientError ? error.category : 'write-failed');
    }
  };

  const switchMode = (nextMode: typeof mode) => {
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
      {diagnostics && (
        <RobotPose
          diagnostics={diagnostics}
          disabled={!isConnected}
          onResetOrigin={resetOrigin}
        />
      )}
      {diagnostics && (
        <section className={styles.diagnostics} aria-label="Robot diagnostics">
          <p className={styles.sectionLabel}>Firmware diagnostics</p>
          <textarea
            aria-label="Copyable firmware diagnostics"
            readOnly
            value={`mode=${diagnostics.mode}\nlast_request=${diagnostics.lastRequest}\nodometry_stale=${diagnostics.odometryStale}\nx_mm=${diagnostics.xMm}\ny_mm=${diagnostics.yMm}\nheading_mdeg=${diagnostics.headingMdeg}`}
          />
        </section>
      )}
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
        ) : mode === 'direct' ? (
          <MotorSliders
            disabled={!isConnected}
            resetToken={resetToken}
            onCommandChange={setDesiredCommand}
          />
        ) : mode === 'test' ? (
          <MotionTestButtons
            disabled={!isConnected}
            resetToken={resetToken}
            onCommandChange={setDesiredCommand}
          />
        ) : (
          <AutonomyPanel disabled={!isConnected} onReturnToOrigin={returnToOrigin} />
        )}
      </section>
      <StopButton onPress={() => void stop()} />
      <footer className={styles.buildInfo}>
        v{buildInfo.version} - {buildInfo.branch} - {buildInfo.commit}
      </footer>
    </main>
  );
};
