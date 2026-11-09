import { afterEach, describe, expect, it, vi } from 'vitest';
import { mySubscriptionSchema } from '@influency/shared';
import { fetchMySubscriptions } from './my-subscriptions';

const SUB = {
  creator: { slug: 'ana', displayName: 'Ana', avatarUrl: null, bannerUrl: null, bio: null },
  endsAt: '2026-12-01T00:00:00.000Z',
  daysLeft: 12,
  hasScheduledRenewal: true,
};
const stubFetch = (res: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(res));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchMySubscriptions', () => {
  it('calls GET /me/subscriptions and parses the list', async () => {
    const fetchMock = stubFetch(Response.json({ subscriptions: [SUB] }));
    expect(await fetchMySubscriptions()).toEqual({ subscriptions: [SUB] });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/subscriptions', { credentials: 'include' });
  });

  it('throws on an error status and on a malformed body', async () => {
    stubFetch(new Response(null, { status: 401 }));
    await expect(fetchMySubscriptions()).rejects.toThrow('401');
    stubFetch(Response.json({ subscriptions: [{ ...SUB, daysLeft: 0 }] }));
    await expect(fetchMySubscriptions()).rejects.toThrow();
  });
});

describe('mySubscriptionSchema', () => {
  it('rejects 0 days left', () => {
    expect(mySubscriptionSchema.safeParse({ ...SUB, daysLeft: 0 }).success).toBe(false);
    expect(mySubscriptionSchema.safeParse({ ...SUB, daysLeft: 1 }).success).toBe(true);
  });
});
