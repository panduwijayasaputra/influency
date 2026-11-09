import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelScheduledRenewal,
  fetchPublicPost,
  purchasePost,
  sendTip,
  subscribeCreator,
} from './purchases';

afterEach(() => vi.unstubAllGlobals());

describe('purchases client (dummy phase)', () => {
  it('sendTip posts a profile tip to the creator slug with the key', async () => {
    const tipId = '0198a3c0-0000-7000-8000-0000000000dd';
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ tipId, amountCoins: 10, balanceCoins: 90 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await sendTip({ creatorSlug: 'ana' }, 10, 'key-12345678');
    expect(out).toEqual({ tipId, amountCoins: 10, balanceCoins: 90 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/creators/ana/tips');
    expect(init.body).toBe('{"amountCoins":10}');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('key-12345678');
  });

  it('sendTip posts a post tip to the post', async () => {
    const id = '0198a3c0-0000-7000-8000-0000000000ee';
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ tipId: id, amountCoins: 5, balanceCoins: 95 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await sendTip({ postId: id }, 5, 'key-12345678');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`/api/v1/posts/${id}/tips`);
  });

  it('sendTip surfaces INSUFFICIENT_COINS with the shortfall details', async () => {
    const error = {
      code: 'INSUFFICIENT_COINS',
      message: 'm',
      requestId: 'r',
      details: { required: 10, available: 4 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error }, { status: 402 }))),
    );
    await expect(sendTip({ creatorSlug: 'ana' }, 10, 'key-12345678')).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
      details: { required: 10, available: 4 },
    });
  });

  it('purchasePost posts the confirmed price with the Idempotency-Key', async () => {
    const id = '0198a3c0-0000-7000-8000-0000000000aa';
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          purchaseId: id,
          postId: id,
          priceCoins: 25,
          balanceCoins: 75,
          alreadyOwned: false,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await purchasePost(id, 25, 'key-12345678');
    expect(out).toMatchObject({ priceCoins: 25, balanceCoins: 75, alreadyOwned: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/posts/${id}/purchase`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"expectedPriceCoins":25}');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('key-12345678');
  });

  it('purchasePost surfaces the shared error code and details', async () => {
    const error = {
      code: 'OFFER_CHANGED',
      message: 'm',
      requestId: 'r',
      details: { priceCoins: 40 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error }, { status: 409 }))),
    );
    await expect(purchasePost('p', 25, 'key-12345678')).rejects.toMatchObject({
      code: 'OFFER_CHANGED',
      details: { priceCoins: 40 },
    });
  });

  it('subscribeCreator posts the confirmed price to the creator slug with the key', async () => {
    const periodId = '0198a3c0-0000-7000-8000-0000000000bb';
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          periodId,
          startsAt: '2026-11-09T00:00:00.000Z',
          endsAt: '2026-12-09T00:00:00.000Z',
          priceCoins: 75,
          scheduled: false,
          balanceCoins: 425,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await subscribeCreator('ana', 75, 'key-12345678');
    expect(out).toMatchObject({ periodId, scheduled: false, balanceCoins: 425 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/creators/ana/subscribe');
    expect(init.body).toBe('{"expectedPriceCoins":75}');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('key-12345678');
  });

  it('subscribeCreator surfaces RENEWAL_ALREADY_SCHEDULED', async () => {
    const error = {
      code: 'RENEWAL_ALREADY_SCHEDULED',
      message: 'm',
      requestId: 'r',
      details: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error }, { status: 409 }))),
    );
    await expect(subscribeCreator('ana', 75, 'key-12345678')).rejects.toMatchObject({
      code: 'RENEWAL_ALREADY_SCHEDULED',
    });
  });

  it('cancelScheduledRenewal posts to the period without a body or content type', async () => {
    const periodId = '0198a3c0-0000-7000-8000-0000000000cc';
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ periodId, refundedCoins: 75, balanceCoins: 425 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await cancelScheduledRenewal(periodId)).toEqual({
      periodId,
      refundedCoins: 75,
      balanceCoins: 425,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/subscription-periods/${periodId}/cancel-scheduled`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('cancelScheduledRenewal surfaces RENEWAL_ALREADY_STARTED', async () => {
    const error = { code: 'RENEWAL_ALREADY_STARTED', message: 'm', requestId: 'r', details: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error }, { status: 409 }))),
    );
    await expect(cancelScheduledRenewal('p')).rejects.toMatchObject({
      code: 'RENEWAL_ALREADY_STARTED',
    });
  });

  it('fetchPublicPost fails on a non-OK answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    );
    await expect(fetchPublicPost('a', 'b')).rejects.toThrow('404');
  });
});
