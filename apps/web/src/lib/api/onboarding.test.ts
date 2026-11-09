import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeOnboarding, saveMyProfile } from './onboarding';

afterEach(() => vi.unstubAllGlobals());

describe('completeOnboarding', () => {
  it('POSTs /me/onboarding/complete with credentials', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    await completeOnboarding();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/onboarding/complete', {
      method: 'POST',
      credentials: 'include',
    });
  });

  it('throws on an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))),
    );
    await expect(completeOnboarding()).rejects.toThrow('500');
  });
});

const ME = {
  id: 'u1',
  displayName: 'Bima',
  username: null,
  roles: ['USER'],
  bio: null,
  creatorSlug: null,
  onboardingCompleted: false,
};

describe('saveMyProfile', () => {
  it('PATCHes /me/profile as JSON and parses the response', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(ME)));
    vi.stubGlobal('fetch', fetchMock);
    const input = { displayName: 'Bima', bio: '' };
    expect(await saveMyProfile(input)).toEqual(ME);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me/profile',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify(input),
      }),
    );
  });

  it('throws on an error status and on a malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 400 }))),
    );
    await expect(saveMyProfile({ displayName: 'B', bio: '' })).rejects.toThrow('400');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ nope: 1 }))),
    );
    await expect(saveMyProfile({ displayName: 'B', bio: '' })).rejects.toThrow();
  });
});
