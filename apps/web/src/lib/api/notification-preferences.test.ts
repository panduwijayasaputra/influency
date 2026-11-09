import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectTelegram,
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from './notification-preferences';

const PREFS = {
  newPost: true,
  commentReply: true,
  commentLike: false,
  subscriptionReminder: true,
  earnings: null,
  telegram: { status: 'unavailable', allowed: false },
};
const stubFetch = (res: Response) => {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(res));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
afterEach(() => vi.unstubAllGlobals());

describe('notification preferences client', () => {
  it('reads my preferences', async () => {
    const fetchMock = stubFetch(Response.json(PREFS));
    expect(await fetchNotificationPreferences()).toEqual(PREFS);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/notification-preferences', {
      credentials: 'include',
    });
  });

  it('PUTs a patch as JSON and returns the new state', async () => {
    const fetchMock = stubFetch(Response.json({ ...PREFS, commentLike: true }));
    expect((await updateNotificationPreferences({ commentLike: true })).commentLike).toBe(true);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({ method: 'PUT', body: '{"commentLike":true}' });
  });

  it('throws on an error status so the toggle can roll back', async () => {
    stubFetch(new Response('x', { status: 403 }));
    await expect(updateNotificationPreferences({ earnings: false })).rejects.toThrow('403');
  });

  it('asks for a Telegram link', async () => {
    const link = {
      url: 'https://t.me/InfluencyBot?start=abc',
      expiresAt: '2026-11-09T10:00:00.000Z',
    };
    const fetchMock = stubFetch(Response.json(link));
    expect(await connectTelegram()).toEqual(link);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/me/telegram/link');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
  });

  it('rejects a non-https link', async () => {
    stubFetch(Response.json({ url: 'http://evil.example', expiresAt: 'x' }));
    await expect(connectTelegram()).rejects.toThrow();
  });
});
