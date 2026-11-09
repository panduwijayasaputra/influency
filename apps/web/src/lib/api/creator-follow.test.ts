import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFollow } from './creator-follow';

afterEach(() => vi.unstubAllGlobals());

describe('setFollow', () => {
  it('PUTs a follow and DELETEs an unfollow, returning the parsed state', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ following: true, followerCount: 4 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await setFollow('ana', true)).toEqual({ following: true, followerCount: 4 });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/creators/ana/follow', { method: 'PUT' });
    await setFollow('ana', false);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/creators/ana/follow', {
      method: 'DELETE',
    });
  });

  it('returns null on an error status, a network error and a malformed body', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
    expect(await setFollow('ana', true)).toBeNull();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    expect(await setFollow('ana', true)).toBeNull();
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ following: 'x' })));
    expect(await setFollow('ana', true)).toBeNull();
  });
});
