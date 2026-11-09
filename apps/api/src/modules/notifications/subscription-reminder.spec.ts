import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../common/env.js';
import type { NotificationProducer } from './notification-producer.service.js';
import { SubscriptionReminder } from './subscription-reminder.js';

describe('SubscriptionReminder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const reminderWith = (seconds: number, remindEndingSubscriptions: () => Promise<void>) =>
    new SubscriptionReminder(
      { remindEndingSubscriptions } as unknown as NotificationProducer,
      { SUBSCRIPTION_REMINDER_INTERVAL_SECONDS: seconds } as Env,
    );

  it('starts no timer when the interval is 0', async () => {
    const remind = vi.fn(() => Promise.resolve());
    reminderWith(0, remind).onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(86_400_000);
    expect(remind).not.toHaveBeenCalled();
  });

  it('runs on every tick until shutdown', async () => {
    const remind = vi.fn(() => Promise.resolve());
    const reminder = reminderWith(60, remind);
    reminder.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(remind).toHaveBeenCalledTimes(3);
    reminder.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(remind).toHaveBeenCalledTimes(3);
  });

  it('skips a tick while the previous run is still going, and survives a failure', async () => {
    let finish!: () => void;
    const remind = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue();
    const reminder = reminderWith(60, remind);
    reminder.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(remind).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(remind).toHaveBeenCalledTimes(3);
    reminder.onApplicationShutdown();
  });
});
