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
  private generation = 0;

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
      void this.flushTick();
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
    this.generation += 1;
    this.stopTimer();
    this.pending = null;
    this.lastSent = null;
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
        this.stopTimer();
      }
      return;
    }

    const generation = this.generation;
    this.inFlight = true;
    try {
      await this.send(command);
      if (generation !== this.generation) {
        return;
      }
      this.lastSent = command;
      if (this.pending?.left === command.left && this.pending.right === command.right) {
        this.pending = null;
      }
      if (isZeroCommand(command) && this.pending === null) {
        this.stopTimer();
      }
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      this.stop();
      this.onError?.(error);
    } finally {
      this.inFlight = false;
      if (this.pending !== null) {
        void this.flushTick();
      }
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
