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
  private timer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private scheduledAt = 0;
  private pending: DriveCommand | null = null;
  private lastSent: DriveCommand | null = null;
  private inFlight = false;
  private generation = 0;
  private nextAllowedAt = 0;

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
      this.scheduleFlush(0);
      return;
    }

    this.scheduleFlush(this.getDelayUntilAllowed());
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
    this.nextAllowedAt = 0;
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
      if (this.pending?.left === command.left && this.pending.right === command.right) {
        this.pending = null;
      }
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
      this.nextAllowedAt = Date.now() + this.intervalMs;
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
        this.scheduleFlush(isZeroCommand(this.pending) ? 0 : this.getDelayUntilAllowed());
      }
    }
  }

  private getDelayUntilAllowed(): number {
    return Math.max(0, this.nextAllowedAt - Date.now());
  }

  private scheduleFlush(delayMs: number): void {
    if (this.inFlight) {
      return;
    }

    const targetTime = Date.now() + delayMs;
    if (this.timer !== null && this.scheduledAt <= targetTime) {
      return;
    }

    this.stopTimer();
    this.scheduledAt = targetTime;
    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      this.scheduledAt = 0;
      void this.flushTick();
    }, delayMs);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      globalThis.clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduledAt = 0;
  }
}
