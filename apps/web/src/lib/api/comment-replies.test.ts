import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMoreReplies } from './comment-replies';

const ID = '0190a000-0000-7000-8000-000000000001';
afterEach(() => vi.unstubAllGlobals());

describe('fetchMoreReplies', () => {
  it('GETs the page after the cursor and returns it parsed', async () => {
    const page = { items: [], nextCursor: null, canComment: true };
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(page)));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchMoreReplies('p1', 'c1', ID)).toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/posts/p1/comments/c1/replies?cursor=${ID}`);
    await fetchMoreReplies('p1', 'c1', undefined);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/posts/p1/comments/c1/replies');
  });

  it('returns null on a 404, a network error and a malformed body', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
    expect(await fetchMoreReplies('p1', 'c1', ID)).toBeNull();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    expect(await fetchMoreReplies('p1', 'c1', ID)).toBeNull();
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ items: 'x' })));
    expect(await fetchMoreReplies('p1', 'c1', ID)).toBeNull();
  });
});
