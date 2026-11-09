import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../common/env.js';
import { MediaSweeper } from './media-sweeper.js';
import type { PostMediaService } from './post-media.service.js';

describe('MediaSweeper', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const sweeperWith = (seconds: number, sweep: () => Promise<number>) =>
    new MediaSweeper(
      { sweep } as unknown as PostMediaService,
      { MEDIA_SWEEP_INTERVAL_SECONDS: seconds } as Env,
    );

  it('starts no timer when the interval is 0', async () => {
    const sweep = vi.fn(() => Promise.resolve(0));
    const sweeper = sweeperWith(0, sweep);
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(sweep).not.toHaveBeenCalled();
  });

  it('sweeps on every tick until shutdown', async () => {
    const sweep = vi.fn(() => Promise.resolve(0));
    const sweeper = sweeperWith(60, sweep);
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(sweep).toHaveBeenCalledTimes(3);
    sweeper.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(sweep).toHaveBeenCalledTimes(3);
  });

  it('skips a tick while the previous run is still going', async () => {
    let finish!: () => void;
    const sweep = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = () => resolve(0);
        }),
    );
    const sweeper = sweeperWith(60, sweep);
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sweep).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sweep).toHaveBeenCalledTimes(2);
    sweeper.onApplicationShutdown();
  });

  it('keeps running after a failed sweep', async () => {
    const sweep = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(0);
    const sweeper = sweeperWith(60, sweep);
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sweep).toHaveBeenCalledTimes(2);
    sweeper.onApplicationShutdown();
  });
});
