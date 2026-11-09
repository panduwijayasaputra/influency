import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCreatorSubscription } from './creator-subscription.server';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: 'tok' }) }),
}));

afterEach(() => vi.unstubAllGlobals());

const STATE = {
  plan: { priceCoins: 150, durationDays: 30 },
  viewer: { current: null, scheduled: null, canTip: false },
};

describe('getCreatorSubscription', () => {
  it('forwards the session cookie and returns the parsed state', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(STATE)));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getCreatorSubscription('ana')).toEqual(STATE);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/v1/creators/ana/subscription');
    expect(init.cache).toBe('no-store');
    expect((init.headers as Record<string, string>).cookie).toContain('tok');
  });

  it.each([
    ['an API error', () => Promise.resolve(new Response('', { status: 500 }))],
    ['a malformed body', () => Promise.resolve(Response.json({ nope: 1 }))],
    ['a network failure', () => Promise.reject(new Error('down'))],
  ])('reads %s as no plan', async (_label, impl) => {
    vi.stubGlobal('fetch', vi.fn(impl));
    expect(await getCreatorSubscription('ana')).toEqual({ plan: null, viewer: null });
  });
});
