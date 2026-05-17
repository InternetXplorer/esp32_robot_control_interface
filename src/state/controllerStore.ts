import { create } from 'zustand';
import { BleErrorCategory, getErrorMessage } from '../ble/errors';
import { DriveCommand, zeroCommand } from '../domain/motor';

export type ControlMode = 'drive' | 'direct' | 'test';
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting';

type SupportState = {
  isSecureContext: boolean;
  webBluetoothSupported: boolean;
  bluetoothAvailable: boolean | null;
};

type ControllerState = {
  support: SupportState;
  connectionStatus: ConnectionStatus;
  mode: ControlMode;
  desiredCommand: DriveCommand;
  resetToken: number;
  canReconnect: boolean;
  errorCategory: BleErrorCategory | null;
  bannerMessage: string | null;
  setSupport: (support: Partial<SupportState>) => void;
  setCanReconnect: (canReconnect: boolean) => void;
  beginConnection: () => void;
  setConnected: () => void;
  setDisconnected: (category?: BleErrorCategory | null) => void;
  beginDisconnect: () => void;
  setDesiredCommand: (command: DriveCommand) => void;
  emergencyResetUi: () => void;
  setMode: (mode: ControlMode) => void;
  clearBanner: () => void;
  clearError: () => void;
};

const initialSupport: SupportState = {
  isSecureContext: window.isSecureContext,
  webBluetoothSupported: 'bluetooth' in navigator,
  bluetoothAvailable: null
};

export const useControllerStore = create<ControllerState>((set) => ({
  support: initialSupport,
  connectionStatus: 'idle',
  mode: 'drive',
  desiredCommand: zeroCommand(),
  resetToken: 0,
  canReconnect: false,
  errorCategory: null,
  bannerMessage: null,
  setSupport: (support) =>
    set((state) => ({
      support: { ...state.support, ...support }
    })),
  setCanReconnect: (canReconnect) => set({ canReconnect }),
  beginConnection: () => set({ connectionStatus: 'connecting', errorCategory: null, bannerMessage: null }),
  setConnected: () => set({ connectionStatus: 'connected', errorCategory: null, bannerMessage: null }),
  setDisconnected: (category = null) =>
    set((state) => ({
      connectionStatus: 'idle',
      desiredCommand: zeroCommand(),
      resetToken: state.resetToken + 1,
      errorCategory: category,
      bannerMessage:
        category === 'gatt-disconnected' ? getErrorMessage('gatt-disconnected') : state.bannerMessage
    })),
  beginDisconnect: () => set({ connectionStatus: 'disconnecting' }),
  setDesiredCommand: (command) => set({ desiredCommand: command }),
  emergencyResetUi: () =>
    set((state) => ({
      desiredCommand: zeroCommand(),
      resetToken: state.resetToken + 1
    })),
  setMode: (mode) =>
    set((state) => ({
      mode,
      desiredCommand: zeroCommand(),
      resetToken: state.resetToken + 1
    })),
  clearBanner: () => set({ bannerMessage: null }),
  clearError: () => set({ errorCategory: null })
}));
