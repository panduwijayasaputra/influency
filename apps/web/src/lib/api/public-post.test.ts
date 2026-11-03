import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ORIGIN } from './origin';
import { getPublicPost } from './public-post';

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

const POST = {
  id: '0190a000-0000-7000-8000-000000000001',
  visibility: 'PREMIUM',
  status: 'PUBLISHED',
  caption: 'Halo',
  publishedAt: '2026-11-03T00:00:00.000Z',
  imageCount: 1,
  videoCount: 0,
  offer: { priceCoins: 8 },
  previewUrl: null,
  access: 'locked',
  likeCount: 2,
  viewer: { liked: false, canLike: false, canReport: true },
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getPublicPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cookieStore.value = undefined;
  });

  it('fetches the encoded path uncached, without a cookie when logged out', async () => {
    const fetchMock = stubFetch(Response.json(POST));
    expect(await getPublicPost('a/b?', 'p?')).toEqual(POST);
    expect(fetchMock).toHaveBeenCalledWith(`${API_ORIGIN}/api/v1/creators/a%2Fb%3F/posts/p%3F`, {
      headers: {},
      cache: 'no-store',
    });
  });

  it('forwards only the session cookie when logged in', async () => {
    cookieStore.value = 'tok';
    const fetchMock = stubFetch(Response.json({ ...POST, access: 'full' }));
    expect((await getPublicPost('ana', POST.id))?.access).toBe('full');
    expect(fetchMock.mock.calls[0]![1]).toEqual({
      headers: { cookie: 'influency_session=tok' },
      cache: 'no-store',
    });
  });

  it('returns null on 404', async () => {
    stubFetch(new Response(null, { status: 404 }));
    expect(await getPublicPost('ana', POST.id)).toBeNull();
  });

  it('throws on other errors and on an unexpected body', async () => {
    stubFetch(new Response(null, { status: 500 }));
    await expect(getPublicPost('ana', POST.id)).rejects.toThrow('500');
    stubFetch(Response.json({ ...POST, access: 'hidden' }));
    await expect(getPublicPost('ana', POST.id)).rejects.toThrow();
  });
});
