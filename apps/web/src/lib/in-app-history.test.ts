import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasInAppHistory,
  markInAppNavigation,
  resetInAppHistory,
  subscribeInAppHistory,
} from './in-app-history';

describe('in-app history', () => {
  beforeEach(resetInAppHistory);

  it('flips once and notifies subscribers once', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInAppHistory(listener);
    expect(hasInAppHistory()).toBe(false);

    markInAppNavigation();
    markInAppNavigation();
    expect(hasInAppHistory()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    resetInAppHistory();
    markInAppNavigation();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
