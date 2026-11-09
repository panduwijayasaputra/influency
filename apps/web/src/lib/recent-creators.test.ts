import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addRecentCreator,
  RECENT_CREATORS_KEY,
  RECENT_CREATORS_MAX,
  removeRecentCreator,
  useRecentCreators,
} from './recent-creators';

const creator = (slug: string) => ({ slug, displayName: `Creator ${slug}`, avatarUrl: null });
const slugs = () => {
  const raw = localStorage.getItem(RECENT_CREATORS_KEY);
  return (raw ? (JSON.parse(raw) as { slug: string }[]) : []).map((c) => c.slug);
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('recent creators', () => {
  it('keeps the newest first and moves a reopened creator to the front', () => {
    addRecentCreator(creator('a'));
    addRecentCreator(creator('b'));
    addRecentCreator(creator('a'));
    expect(slugs()).toEqual(['a', 'b']);
  });

  it('caps the list', () => {
    for (let i = 0; i < RECENT_CREATORS_MAX + 5; i++) addRecentCreator(creator(`c${i}`));
    expect(slugs()).toHaveLength(RECENT_CREATORS_MAX);
    expect(slugs()[0]).toBe(`c${RECENT_CREATORS_MAX + 4}`);
  });

  it('removes a creator', () => {
    addRecentCreator(creator('a'));
    addRecentCreator(creator('b'));
    removeRecentCreator('a');
    expect(slugs()).toEqual(['b']);
  });

  it('updates the hook and reads corrupt storage as empty', () => {
    localStorage.setItem(RECENT_CREATORS_KEY, '{not json');
    const { result } = renderHook(() => useRecentCreators());
    expect(result.current).toEqual([]);
    act(() => addRecentCreator(creator('a')));
    expect(result.current.map((c) => c.slug)).toEqual(['a']);
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => addRecentCreator(creator('a'))).not.toThrow();
    const { result } = renderHook(() => useRecentCreators());
    expect(result.current).toEqual([]);
  });
});
