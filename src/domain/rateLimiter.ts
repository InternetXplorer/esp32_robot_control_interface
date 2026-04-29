import { DriveCommand, isZeroCommand } from './motor';

type RateLimiterOptions = {
  intervalMs: number;
  send: (command: DriveCommand) => Promise<void>;
  onError?: (error: unknown) => void;
};

export class CommandRateLimiter {
  private readonly intervalMs: number;
  private readonly send: (command: DriveCommand) => Promise<void>;
  private onError?: (error: unknown) => void;
  private timer: number | null = null;
  private pending: DriveCommand | null = null;
  private lastSent: DriveCommand | null = null;
  private inFlight = false;

  constructor(options: RateLimiterOptions) {
    this.intervalMs = options.intervalMs;
    this.send = options.send;
    this.onError = options.onError;
  }

  setErrorHandler(onError: ((error: unknown) => void) | undefined): void {
    this.onError = onError;
  }

  setDesired(command: DriveCommand): void {
    this.pending = command;

    if (isZeroCommand(command)) {
      void this.flushNow();
      return;
    }

    if (this.timer === null) {
      this.timer = window.setInterval(() => {
        void this.flushTick();
      }, this.intervalMs);
    }
  }

  async flushNow(): Promise<void> {
    if (this.pending === null) {
      return;
    }

    await this.flush(this.pending);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.pending = null;
    this.lastSent = null;
    this.inFlight = false;
  }

  private async flushTick(): Promise<void> {
    if (this.pending === null || this.inFlight) {
      return;
    }

    await this.flush(this.pending);
  }

  private async flush(command: DriveCommand): Promise<void> {
    if (this.inFlight) {
      return;
    }

    if (
      this.lastSent !== null &&
      this.lastSent.left === command.left &&
      this.lastSent.right === command.right
    ) {
      if (isZeroCommand(command)) {
        this.stop();
      }
      return;
    }

    this.inFlight = true;
    try {
      await this.send(command);
      this.lastSent = command;
      if (this.pending?.left === command.left && this.pending.right === command.right) {
        this.pending = null;
      }
      if (isZeroCommand(command)) {
        this.stop();
      }
    } catch (error) {
      this.stop();
      this.onError?.(error);
    } finally {
      this.inFlight = false;
    }
  }
}
