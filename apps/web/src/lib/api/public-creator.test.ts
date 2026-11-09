import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ORIGIN } from './origin';
import { getPublicCreator } from './public-creator';

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const CREATOR = {
  slug: 'ana',
  displayName: 'Ana',
  bio: null,
  category: null,
  avatarUrl: null,
  bannerUrl: null,
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getPublicCreator', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the encoded slug without cookies and parses the profile', async () => {
    const fetchMock = stubFetch(Response.json(CREATOR));
    expect(await getPublicCreator('a/b?')).toEqual(CREATOR);
    expect(fetchMock).toHaveBeenCalledWith(`${API_ORIGIN}/api/v1/creators/a%2Fb%3F`);
  });

  it('returns null on 404', async () => {
    stubFetch(new Response(null, { status: 404 }));
    expect(await getPublicCreator('ana')).toBeNull();
  });

  it('throws on other errors and on an unexpected body', async () => {
    stubFetch(new Response(null, { status: 500 }));
    await expect(getPublicCreator('ana')).rejects.toThrow('500');
    stubFetch(Response.json({ slug: 'ana' }));
    await expect(getPublicCreator('ana')).rejects.toThrow();
  });
});
