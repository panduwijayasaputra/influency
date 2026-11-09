import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDiscoverVideosPage, searchCreators } from './discover';

const item = {
  id: 'a',
  visibility: 'FREE',
  caption: '',
  publishedAt: '2026-11-01T00:00:00.000Z',
  imageCount: 0,
  videoCount: 1,
  offer: null,
  previewUrl: null,
  likeCount: 0,
  access: 'full',
  viewer: null,
  commentCount: 0,
  media: [{ kind: 'VIDEO', durationSeconds: 15 }],
  creator: { slug: 'nadia', displayName: 'Nadia', avatarUrl: null },
  follow: { following: true, followerCount: 3 },
};

const stubFetch = (res: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(res));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchDiscoverVideosPage', () => {
  it('asks for the first page without a cursor and parses the page', async () => {
    const fetchMock = stubFetch(Response.json({ items: [item], nextCursor: 'c1' }));
    const page = await fetchDiscoverVideosPage(null);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/discover/videos', { credentials: 'include' });
    expect(page.items[0]!.follow.following).toBe(true);
    expect(page.nextCursor).toBe('c1');
  });

  it('sends the cursor, URL-encoded', async () => {
    const fetchMock = stubFetch(Response.json({ items: [], nextCursor: null }));
    await fetchDiscoverVideosPage('12_a b');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/discover/videos?cursor=12_a%20b', {
      credentials: 'include',
    });
  });

  it.each([400, 500])('throws on a %i', async (status) => {
    stubFetch(new Response('x', { status }));
    await expect(fetchDiscoverVideosPage(null)).rejects.toThrow(`failed: ${status}`);
  });

  it('throws on a page that does not match the contract', async () => {
    stubFetch(Response.json({ items: [{ id: 'a' }], nextCursor: null }));
    await expect(fetchDiscoverVideosPage(null)).rejects.toThrow();
  });
});

describe('searchCreators', () => {
  it('sends the query URL-encoded and returns the creators', async () => {
    const creator = { slug: 'nadia', displayName: 'Nadia', avatarUrl: null };
    const fetchMock = stubFetch(Response.json({ creators: [creator] }));
    expect(await searchCreators('na dia&x')).toEqual([creator]);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/discover/creators?q=na%20dia%26x', {
      credentials: 'include',
    });
  });

  it.each([400, 429, 500])('throws on a %i', async (status) => {
    stubFetch(new Response('x', { status }));
    await expect(searchCreators('na')).rejects.toThrow(`failed: ${status}`);
  });
});
