import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOPLAY_KEY,
  readAutoplayEnabled,
  setAutoplayEnabled,
  useAutoplayEnabled,
} from './autoplay-preference';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('autoplay preference', () => {
  it('is on by default and off once saved off', () => {
    expect(readAutoplayEnabled()).toBe(true);
    setAutoplayEnabled(false);
    expect(localStorage.getItem(AUTOPLAY_KEY)).toBe('off');
    expect(readAutoplayEnabled()).toBe(false);
  });

  it('updates the hook', () => {
    const { result } = renderHook(() => useAutoplayEnabled());
    expect(result.current).toBe(true);
    act(() => setAutoplayEnabled(false));
    expect(result.current).toBe(false);
    act(() => setAutoplayEnabled(true));
    expect(result.current).toBe(true);
  });

  it('counts blocked storage as on', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => setAutoplayEnabled(false)).not.toThrow();
    expect(readAutoplayEnabled()).toBe(true);
  });
});
