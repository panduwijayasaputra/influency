import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimPlayback,
  pauseAllVideos,
  prefersTapToPlay,
  releasePlayback,
  usePlaybackActive,
} from './video-playback';

afterEach(() => {
  pauseAllVideos();
  vi.unstubAllGlobals();
});

describe('single playback store', () => {
  it('lets one video play at a time', () => {
    const a = renderHook(() => usePlaybackActive('a'));
    const b = renderHook(() => usePlaybackActive('b'));
    act(() => claimPlayback('a'));
    expect([a.result.current, b.result.current]).toEqual([true, false]);
    act(() => claimPlayback('b'));
    expect([a.result.current, b.result.current]).toEqual([false, true]);
    // A stale release doesn't stop the new holder.
    act(() => releasePlayback('a'));
    expect(b.result.current).toBe(true);
    act(() => pauseAllVideos());
    expect(b.result.current).toBe(false);
  });
});

describe('prefersTapToPlay', () => {
  const media = (matches: boolean) => vi.fn(() => ({ matches }) as MediaQueryList);

  it('is true for reduced motion or data saving, false otherwise', () => {
    vi.stubGlobal('matchMedia', media(false));
    expect(prefersTapToPlay()).toBe(false);
    vi.stubGlobal('matchMedia', media(true));
    expect(prefersTapToPlay()).toBe(true);
    vi.stubGlobal('matchMedia', media(false));
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    expect(prefersTapToPlay()).toBe(true);
  });
});
