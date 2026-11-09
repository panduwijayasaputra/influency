import { afterEach, describe, expect, it, vi } from 'vitest';
import { followingPageSchema } from '@influency/shared';
import { fetchFollowingPage } from './following';

const EMPTY = { creators: [], total: 0, nextCursor: null };
const stubFetch = (res: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(res));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchFollowingPage', () => {
  it('asks for the default sort without a query string and parses the page', async () => {
    const fetchMock = stubFetch(Response.json(EMPTY));
    expect(await fetchFollowingPage({ sort: 'recent' })).toEqual(EMPTY);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/following', { credentials: 'include' });
  });

  it('sends the name sort and the cursor', async () => {
    const fetchMock = stubFetch(Response.json(EMPTY));
    await fetchFollowingPage({ sort: 'name', cursor: 'n_YWE_x' });
    const url = new URL(`http://x${(fetchMock.mock.calls[0] as unknown as [string])[0]}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ sort: 'name', cursor: 'n_YWE_x' });
  });

  it('throws on an error status and on a malformed body', async () => {
    stubFetch(new Response(null, { status: 401 }));
    await expect(fetchFollowingPage({ sort: 'recent' })).rejects.toThrow('401');
    stubFetch(Response.json({ creators: [] }));
    await expect(fetchFollowingPage({ sort: 'recent' })).rejects.toThrow();
  });
});

describe('followingPageSchema', () => {
  it('requires the total', () => {
    expect(followingPageSchema.safeParse({ creators: [], nextCursor: null }).success).toBe(false);
  });
});
