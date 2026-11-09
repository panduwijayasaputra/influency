import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRecommendedCreators } from './recommended-creators';

const creator = {
  slug: 'nadia',
  displayName: 'Nadia',
  avatarUrl: null,
  bannerUrl: null,
  followerCount: 3,
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchRecommendedCreators', () => {
  it('parses the list from the API with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ creators: [creator] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchRecommendedCreators()).toEqual([creator]);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/creators/recommended', {
      credentials: 'include',
    });
  });

  it('throws on an error response so the block hides', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 401 })));
    await expect(fetchRecommendedCreators()).rejects.toThrow('failed: 401');
  });
});
