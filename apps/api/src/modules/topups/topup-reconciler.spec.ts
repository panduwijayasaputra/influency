import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../common/env.js';
import { nextCheckDelayMs, type TopupReconcileService } from './topup-reconcile.service.js';
import { TopupReconciler } from './topup-reconciler.js';

describe('TopupReconciler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const reconcilerWith = (seconds: number, reconcileDue: () => Promise<number>) =>
    new TopupReconciler(
      { reconcileDue } as unknown as TopupReconcileService,
      { TOPUP_RECONCILE_INTERVAL_SECONDS: seconds } as Env,
    );

  it('starts no timer when the interval is 0', async () => {
    const reconcileDue = vi.fn(() => Promise.resolve(0));
    reconcilerWith(0, reconcileDue).onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(reconcileDue).not.toHaveBeenCalled();
  });

  it('runs on every tick until shutdown', async () => {
    const reconcileDue = vi.fn(() => Promise.resolve(0));
    const reconciler = reconcilerWith(60, reconcileDue);
    reconciler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(reconcileDue).toHaveBeenCalledTimes(3);
    reconciler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(reconcileDue).toHaveBeenCalledTimes(3);
  });

  it('skips a tick while the previous run is still going', async () => {
    let finish!: () => void;
    const reconcileDue = vi.fn(() => new Promise<number>((resolve) => (finish = () => resolve(0))));
    const reconciler = reconcilerWith(60, reconcileDue);
    reconciler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reconcileDue).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reconcileDue).toHaveBeenCalledTimes(2);
    reconciler.onApplicationShutdown();
  });

  it('keeps running after a failed run', async () => {
    const reconcileDue = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(0);
    const reconciler = reconcilerWith(60, reconcileDue);
    reconciler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reconcileDue).toHaveBeenCalledTimes(2);
    reconciler.onApplicationShutdown();
  });
});

describe('nextCheckDelayMs', () => {
  it('doubles from 30 s and caps at 30 minutes', () => {
    expect([0, 1, 2, 3].map(nextCheckDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(nextCheckDelayMs(6)).toBe(1_800_000);
    expect(nextCheckDelayMs(500)).toBe(1_800_000);
  });
});
