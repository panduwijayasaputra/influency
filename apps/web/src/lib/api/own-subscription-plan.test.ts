import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveOwnPlan } from './own-subscription-plan';

afterEach(() => vi.unstubAllGlobals());

describe('saveOwnPlan', () => {
  it('PUTs the price and active flag and parses the plan', async () => {
    const plan = {
      version: 3,
      priceCoins: 200,
      durationDays: 30,
      active: true,
      updatedAt: '2026-11-09T00:00:00.000Z',
    };
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ plan })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await saveOwnPlan({ priceCoins: 200, active: true })).toEqual({ plan });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/creators/me/subscription-plan');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ priceCoins: 200, active: true });
  });

  it('rejects with the API error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { error: { code: 'VALIDATION_FAILED', message: 'x', requestId: 'r', details: null } },
            { status: 400 },
          ),
        ),
      ),
    );
    await expect(saveOwnPlan({ priceCoins: 1, active: true })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
