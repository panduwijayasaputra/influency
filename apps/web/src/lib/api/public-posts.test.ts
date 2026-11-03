import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ORIGIN } from './origin';
import { getPublicPosts } from './public-posts';

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
    },
  ],
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getPublicPosts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the encoded slug uncached and without cookies', async () => {
    const fetchMock = stubFetch(Response.json(POSTS));
    expect(await getPublicPosts('a/b?')).toEqual(POSTS);
    expect(fetchMock).toHaveBeenCalledWith(`${API_ORIGIN}/api/v1/creators/a%2Fb%3F/posts`, {
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
