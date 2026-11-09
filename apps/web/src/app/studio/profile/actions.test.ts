import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { refreshOwnPublicProfile } from './actions';

const cache = vi.hoisted(() => ({ updateTag: vi.fn() }));
vi.mock('next/cache', () => cache);
vi.mock('@/lib/api/creator-profile', () => ({ getMyCreatorProfile: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('refreshOwnPublicProfile', () => {
  it("expires the caller's own profile tag, taken from the session", async () => {
    vi.mocked(getMyCreatorProfile).mockResolvedValue({ slug: 'nadia' } as never);
    await refreshOwnPublicProfile();
    expect(cache.updateTag).toHaveBeenCalledWith('creator:nadia');
  });

  it.each([[null], [new Error('down')]])('does nothing without a profile (%s)', async (result) => {
    if (result instanceof Error) vi.mocked(getMyCreatorProfile).mockRejectedValue(result);
    else vi.mocked(getMyCreatorProfile).mockResolvedValue(result);
    await refreshOwnPublicProfile();
    expect(cache.updateTag).not.toHaveBeenCalled();
  });
});
