import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from './current-user';
import { API_ORIGIN } from './origin';

const cookieStore = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'influency_session' && cookieStore.value
          ? { value: cookieStore.value }
          : undefined,
    }),
}));

const USER = { id: 'u1', displayName: 'Ana', username: 'ana', roles: ['USER', 'CREATOR'] };

function stubFetch(response: Response) {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getCurrentUser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cookieStore.value = undefined;
  });

  it('returns null without calling the API when there is no session cookie', async () => {
    const fetchMock = stubFetch(Response.json(USER));
    expect(await getCurrentUser()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only the session cookie, uncached, and returns the parsed user', async () => {
    cookieStore.value = 'tok123';
    const fetchMock = stubFetch(Response.json(USER));
    expect(await getCurrentUser()).toEqual(USER);
    expect(fetchMock).toHaveBeenCalledWith(`${API_ORIGIN}/api/v1/auth/me`, {
      headers: { cookie: 'influency_session=tok123' },
      cache: 'no-store',
    });
  });

  it('returns null on 401', async () => {
    cookieStore.value = 'expired';
    stubFetch(Response.json({ error: { code: 'AUTH_REQUIRED' } }, { status: 401 }));
    expect(await getCurrentUser()).toBeNull();
  });

  it('throws on other API errors', async () => {
    cookieStore.value = 'tok';
    stubFetch(new Response('boom', { status: 500 }));
    await expect(getCurrentUser()).rejects.toThrow('GET /auth/me failed: 500');
  });

  it('throws on a malformed body', async () => {
    cookieStore.value = 'tok';
    stubFetch(Response.json({ ...USER, roles: ['SUPERUSER'] }));
    await expect(getCurrentUser()).rejects.toThrow();
  });
});
