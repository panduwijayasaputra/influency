import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMyOwnPlan } from './own-subscription-plan.server';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: 'tok' }) }),
}));
afterEach(() => vi.unstubAllGlobals());

describe('getMyOwnPlan', () => {
  it('forwards the session cookie and returns the plan', async () => {
    const plan = {
      version: 1,
      priceCoins: 150,
      durationDays: 30,
      active: true,
      updatedAt: '2026-11-09T00:00:00.000Z',
    };
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ plan })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getMyOwnPlan()).toEqual(plan);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/v1/creators/me/subscription-plan');
    expect(init.cache).toBe('no-store');
    expect((init.headers as Record<string, string>).cookie).toContain('tok');
  });

  it('returns null when the creator never set a plan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ plan: null }))),
    );
    expect(await getMyOwnPlan()).toBeNull();
  });

  it('throws instead of reading a failure as "no plan"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );
    await expect(getMyOwnPlan()).rejects.toThrow('failed: 500');
  });
});
