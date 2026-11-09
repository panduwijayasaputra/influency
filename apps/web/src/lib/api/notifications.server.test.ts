import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUnreadCount } from './notifications.server';

const cookieGet = vi.fn();
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: cookieGet }) }));
afterEach(() => vi.unstubAllGlobals());

describe('getUnreadCount', () => {
  it('forwards only the session cookie and returns the count', async () => {
    cookieGet.mockReturnValue({ value: 'tok' });
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(Response.json({ count: 4 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await getUnreadCount()).toBe(4);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/v1\/me\/notifications\/unread-count$/);
    expect(init.cache).toBe('no-store');
    expect(init.headers).toEqual({ cookie: 'influency_session=tok' });
  });

  it('returns 0 without a session, on an error status or a failed request', async () => {
    cookieGet.mockReturnValue(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await getUnreadCount()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    cookieGet.mockReturnValue({ value: 'tok' });
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 500 })));
    expect(await getUnreadCount()).toBe(0);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('down')));
    expect(await getUnreadCount()).toBe(0);
  });
});
