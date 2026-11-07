import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardInset } from './use-keyboard-inset';

function stubViewport(height: number) {
  const listeners = new Map<string, () => void>();
  const vv = {
    height,
    offsetTop: 0,
    addEventListener: vi.fn((type: string, fn: () => void) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  };
  vi.stubGlobal('visualViewport', vv);
  vi.stubGlobal('innerHeight', 800);
  return { vv, listeners };
}

describe('useKeyboardInset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the height the keyboard covers while active', () => {
    stubViewport(500);
    const { result } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toBe(300);
  });

  it('returns 0 when inactive', () => {
    const { vv } = stubViewport(500);
    const { result } = renderHook(() => useKeyboardInset(false));
    expect(result.current).toBe(0);
    expect(vv.addEventListener).not.toHaveBeenCalled();
  });

  it('recomputes on viewport resize and unsubscribes on unmount', () => {
    const { vv, listeners } = stubViewport(800);
    const { result, unmount } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toBe(0);
    vv.height = 450;
    act(() => listeners.get('resize')!());
    expect(result.current).toBe(350);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
