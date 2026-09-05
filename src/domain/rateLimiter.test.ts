import { CommandRateLimiter } from './rateLimiter';
import { DriveCommand } from './motor';

describe('CommandRateLimiter', () => {
  it('sends stop immediately', async () => {
    vi.useFakeTimers();

    const send = vi.fn<(_: DriveCommand) => Promise<void>>().mockResolvedValue(undefined);
    const limiter = new CommandRateLimiter({
      intervalMs: 50,
      send
    });

    limiter.setDesired({ left: 0, right: 0 });
    await vi.runAllTimersAsync();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ left: 0, right: 0 });
  });

  it('keeps at least the configured interval between sequential writes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));

    const sentAt: number[] = [];
    const send = vi.fn(async (command: DriveCommand) => {
      void command;
      sentAt.push(Date.now());
    });

    const limiter = new CommandRateLimiter({
      intervalMs: 50,
      send
    });

    limiter.setDesired({ left: 10, right: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    limiter.setDesired({ left: 20, right: 0 });
    await vi.advanceTimersByTimeAsync(49);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sentAt[1] - sentAt[0]).toBe(50);
  });
});
