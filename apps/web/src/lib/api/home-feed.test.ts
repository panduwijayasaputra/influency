import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHomeFeedPage } from './home-feed';

const item = {
  id: 'a',
  visibility: 'FREE',
  caption: '',
  publishedAt: '2026-11-01T00:00:00.000Z',
  imageCount: 1,
  videoCount: 0,
  offer: null,
  previewUrl: null,
  likeCount: 0,
  access: 'full',
  viewer: null,
  commentCount: 0,
  media: [],
  creator: { slug: 'nadia', displayName: 'Nadia', avatarUrl: null },
};

const stubFetch = (res: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(res));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchHomeFeedPage', () => {
  it('asks for the first page without a cursor and parses the page', async () => {
    const fetchMock = stubFetch(Response.json({ items: [item], nextCursor: 'c1' }));
    const page = await fetchHomeFeedPage(null);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/feed', { credentials: 'include' });
    expect(page.items[0]!.creator.slug).toBe('nadia');
    expect(page.nextCursor).toBe('c1');
  });

  it('sends the cursor, URL-encoded', async () => {
    const fetchMock = stubFetch(Response.json({ items: [], nextCursor: null }));
    await fetchHomeFeedPage('12_a b');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/feed?cursor=12_a%20b', {
      credentials: 'include',
    });
  });

  it.each([401, 500])('throws on a %i', async (status) => {
    stubFetch(new Response('x', { status }));
    await expect(fetchHomeFeedPage(null)).rejects.toThrow(`failed: ${status}`);
  });

  it('throws on a page that does not match the contract', async () => {
    stubFetch(Response.json({ items: [{ id: 'a' }], nextCursor: null }));
    await expect(fetchHomeFeedPage(null)).rejects.toThrow();
  });
});
