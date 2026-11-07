import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ORIGIN } from './origin';
import { getPublicPosts } from './public-posts';

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

const POSTS = {
  posts: [
    {
      id: '0190a000-0000-7000-8000-000000000001',
      visibility: 'FREE',
      caption: 'Halo',
      publishedAt: '2026-11-03T00:00:00.000Z',
      imageCount: 1,
      videoCount: 0,
      offer: null,
      previewUrl: null,
      likeCount: 0,
      access: 'full',
      viewer: null,
      commentCount: 0,
      media: [{ kind: 'IMAGE', durationSeconds: null }],
    },
  ],
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getPublicPosts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cookieStore.value = undefined;
  });

  it('fetches the encoded slug uncached, without a cookie when logged out', async () => {
    const fetchMock = stubFetch(Response.json(POSTS));
    expect(await getPublicPosts('a/b?')).toEqual(POSTS);
    expect(fetchMock).toHaveBeenCalledWith(`${API_ORIGIN}/api/v1/creators/a%2Fb%3F/posts`, {
      headers: {},
      cache: 'no-store',
    });
  });

  it('forwards only the session cookie when logged in (the feed is viewer-aware)', async () => {
    cookieStore.value = 'tok';
    const fetchMock = stubFetch(Response.json(POSTS));
    await getPublicPosts('ana');
    expect(fetchMock.mock.calls[0]![1]).toEqual({
      headers: { cookie: 'influency_session=tok' },
      cache: 'no-store',
    });
  });

  it('returns null on 404', async () => {
    stubFetch(new Response(null, { status: 404 }));
    expect(await getPublicPosts('ana')).toBeNull();
  });

  it('throws on other errors and on an unexpected body', async () => {
    stubFetch(new Response(null, { status: 500 }));
    await expect(getPublicPosts('ana')).rejects.toThrow('500');
    stubFetch(Response.json({ posts: [{ id: 'x' }] }));
    await expect(getPublicPosts('ana')).rejects.toThrow();
  });
});
