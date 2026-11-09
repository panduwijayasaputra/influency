import { afterEach, describe, expect, it, vi } from 'vitest';
import { payoutPageSchema } from '@influency/shared';
import { cancelPayout, fetchPayouts, quotePayout, requestPayout } from './payouts';

const DESTINATION = { bankCode: 'BCA', bankName: 'BCA', last4: '4821', holderName: 'Nadia Kirana' };
const QUOTE = {
  amountIdr: 120_000,
  feeIdr: 2_500,
  netIdr: 117_500,
  feeIsPlaceholder: true,
  availableIdr: 250_000,
  destination: DESTINATION,
};
const PAYOUT = {
  id: '0190a000-0000-7000-8000-000000000999',
  amountIdr: 120_000,
  feeIdr: 2_500,
  netIdr: 117_500,
  feeIsPlaceholder: true,
  status: 'REQUESTED',
  destination: DESTINATION,
  requestedAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};
const apiError = (status: number, code: string, details: unknown = null) =>
  Response.json({ error: { code, message: 'x', requestId: 'r', details } }, { status });
const stub = (response: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const firstCall = (fetchMock: ReturnType<typeof stub>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe('quotePayout', () => {
  it('GETs the quote for the amount and parses it', async () => {
    const fetchMock = stub(Response.json(QUOTE));
    expect(await quotePayout(120_000)).toEqual(QUOTE);
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/v1/me/payouts/quote?amountIdr=120000');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('rejects a quote that carries a full account number', async () => {
    stub(Response.json({ ...QUOTE, destination: { ...DESTINATION, last4: '1234564821' } }));
    await expect(quotePayout(120_000)).rejects.toThrow();
  });

  it('rejects with the API error code and details', async () => {
    stub(apiError(409, 'PAYOUT_EXCEEDS_AVAILABLE', { availableIdr: 100_000 }));
    await expect(quotePayout(250_000)).rejects.toMatchObject({
      code: 'PAYOUT_EXCEEDS_AVAILABLE',
      details: { availableIdr: 100_000 },
    });
  });
});

describe('requestPayout', () => {
  const input = { amountIdr: 120_000, expectedFeeIdr: 2_500 };

  it('POSTs the amount and the shown fee with the Idempotency-Key and parses the payout', async () => {
    const fetchMock = stub(Response.json(PAYOUT, { status: 201 }));
    expect(await requestPayout(input, 'attempt-0001')).toEqual(PAYOUT);
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/v1/me/payouts');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('attempt-0001');
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('accepts the 200 answer of a replay', async () => {
    stub(Response.json(PAYOUT, { status: 200 }));
    await expect(requestPayout(input, 'attempt-0001')).resolves.toEqual(PAYOUT);
  });

  it.each([
    ['PAYOUT_FEE_CHANGED', 409],
    ['PAYOUT_EXCEEDS_AVAILABLE', 409],
    ['PAYOUT_ACCOUNT_REQUIRED', 409],
    ['DUPLICATE_REQUEST', 409],
    ['RATE_LIMITED', 429],
  ])('rejects with %s', async (code, status) => {
    stub(apiError(status, code));
    await expect(requestPayout(input, 'attempt-0001')).rejects.toMatchObject({ code });
  });
});

describe('fetchPayouts', () => {
  it('GETs the first page and parses it', async () => {
    const fetchMock = stub(Response.json({ items: [PAYOUT], nextCursor: '1762000000000_abc' }));
    const page = payoutPageSchema.parse(await fetchPayouts());
    expect(page.items).toEqual([PAYOUT]);
    expect(page.nextCursor).toBe('1762000000000_abc');
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/v1/me/payouts');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('sends the cursor of the next page, URL-encoded', async () => {
    const fetchMock = stub(Response.json({ items: [], nextCursor: null }));
    await fetchPayouts('1762000000000_0190a000-0000');
    expect(firstCall(fetchMock)[0]).toBe('/api/v1/me/payouts?cursor=1762000000000_0190a000-0000');
  });

  it('rejects a payout that carries a full account number', async () => {
    stub(
      Response.json({
        items: [{ ...PAYOUT, destination: { ...DESTINATION, last4: '1234564821' } }],
        nextCursor: null,
      }),
    );
    await expect(fetchPayouts()).rejects.toThrow();
  });

  it('rejects with the API error code', async () => {
    stub(apiError(400, 'VALIDATION_FAILED'));
    await expect(fetchPayouts('bad')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('cancelPayout', () => {
  it('POSTs the cancel and returns the cancelled payout', async () => {
    const fetchMock = stub(Response.json({ ...PAYOUT, status: 'CANCELED' }));
    expect(await cancelPayout(PAYOUT.id)).toMatchObject({ id: PAYOUT.id, status: 'CANCELED' });
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(`/api/v1/me/payouts/${PAYOUT.id}/cancel`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it.each([
    ['PAYOUT_NOT_CANCELABLE', 409],
    ['NOT_FOUND', 404],
  ])('rejects with %s', async (code, status) => {
    stub(apiError(status, code));
    await expect(cancelPayout(PAYOUT.id)).rejects.toMatchObject({ code });
  });
});
