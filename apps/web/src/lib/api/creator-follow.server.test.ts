import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFollowState } from './creator-follow.server';

const cookieGet = vi.fn();
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: cookieGet }) }));
afterEach(() => vi.unstubAllGlobals());

describe('getFollowState', () => {
  it('forwards only the session cookie and parses the state', async () => {
    cookieGet.mockReturnValue({ value: 'tok' });
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(Response.json({ following: true, followerCount: 2 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await getFollowState('ana')).toEqual({ following: true, followerCount: 2 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/v1\/creators\/ana\/follow$/);
    expect(init.cache).toBe('no-store');
    expect(init.headers).toEqual({ cookie: 'influency_session=tok' });
  });

  it('returns null on an error status or a failed request', async () => {
    cookieGet.mockReturnValue(undefined);
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 500 })));
    expect(await getFollowState('ana')).toBeNull();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('down')));
    expect(await getFollowState('ana')).toBeNull();
  });
});
