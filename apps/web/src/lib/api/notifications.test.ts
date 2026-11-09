import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNotificationsPage, fetchUnreadCount, markNotificationsRead } from './notifications';

const ID = '0190a000-0000-7000-8000-000000000001';
const item = {
  id: ID,
  type: 'TOPUP_CREDITED',
  actor: null,
  text: 'Top-up berhasil: 50 Koin masuk ke Dompet.',
  href: '/wallet',
  createdAt: '2026-11-09T00:00:00.000Z',
  read: false,
};
const stubFetch = (res: Response) => {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(res));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
afterEach(() => vi.unstubAllGlobals());

describe('notifications client', () => {
  it('fetches a page, with the cursor URL-encoded', async () => {
    const fetchMock = stubFetch(Response.json({ items: [item], nextCursor: null }));
    expect((await fetchNotificationsPage('1_a b')).items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/notifications?cursor=1_a%20b', {
      credentials: 'include',
    });
  });

  it('reads the unread count', async () => {
    stubFetch(Response.json({ count: 2 }));
    expect(await fetchUnreadCount()).toBe(2);
  });

  it('posts the mark-read request as JSON', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await markNotificationsRead(ID);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/me/notifications/read');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ upToId: ID }) });
  });

  it.each([
    ['page', () => fetchNotificationsPage(null)],
    ['count', () => fetchUnreadCount()],
    ['mark read', () => markNotificationsRead(ID)],
  ])('throws on an error status (%s)', async (_label, call) => {
    stubFetch(new Response('x', { status: 500 }));
    await expect(call()).rejects.toThrow('failed: 500');
  });
});
