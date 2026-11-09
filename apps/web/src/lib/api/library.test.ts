import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryQuery } from '@influency/shared';
import { fetchLibraryPage } from './library';

const q = (over: Partial<LibraryQuery> = {}): LibraryQuery => ({
  relation: 'all',
  media: 'all',
  sort: 'recent',
  ...over,
});
const EMPTY = { items: [], nextCursor: null, creators: [] };
const stubFetch = (res: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(res));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchLibraryPage', () => {
  it('asks for the default collection without a query string and parses the page', async () => {
    const fetchMock = stubFetch(Response.json(EMPTY));
    expect(await fetchLibraryPage(q())).toEqual(EMPTY);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/library', { credentials: 'include' });
  });

  it('sends every non-default filter, the creator and the cursor', async () => {
    const fetchMock = stubFetch(Response.json(EMPTY));
    await fetchLibraryPage(
      q({ relation: 'purchased', media: 'video', sort: 'oldest', creator: 'ana', cursor: '5_x' }),
    );
    const url = new URL(`http://x${(fetchMock.mock.calls[0] as unknown as [string])[0]}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      relation: 'purchased',
      media: 'video',
      sort: 'oldest',
      creator: 'ana',
      cursor: '5_x',
    });
  });

  it('throws on an error status and on a malformed body', async () => {
    stubFetch(new Response(null, { status: 401 }));
    await expect(fetchLibraryPage(q())).rejects.toThrow('401');
    stubFetch(Response.json({ items: 'nope' }));
    await expect(fetchLibraryPage(q())).rejects.toThrow();
  });
});
