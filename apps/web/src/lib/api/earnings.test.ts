import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEarnings, fetchEarningsActivity } from './earnings';

afterEach(() => vi.unstubAllGlobals());

const apiError = (status: number, code: string) =>
  Response.json({ error: { code, message: 'x', requestId: 'r', details: null } }, { status });
const stub = (response: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const firstCall = (fetchMock: ReturnType<typeof stub>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

describe('fetchEarnings', () => {
  const BALANCE = {
    pendingIdr: 63_750,
    availableIdr: 248_500,
    reservedIdr: 150_000,
    paidOutIdr: 0,
    nextMaturityAt: '2026-11-14T05:00:00.000Z',
    nextMaturityIdr: 40_000,
  };

  it('GETs the balance and parses it with the shared contract', async () => {
    const fetchMock = stub(Response.json(BALANCE));
    expect(await fetchEarnings()).toEqual(BALANCE);
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/v1/me/earnings');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('rejects an answer that breaks the contract (a fractional amount)', async () => {
    stub(Response.json({ ...BALANCE, availableIdr: 10.5 }));
    await expect(fetchEarnings()).rejects.toThrow();
  });

  it('rejects with the API error code', async () => {
    stub(apiError(403, 'CREATOR_NOT_APPROVED'));
    await expect(fetchEarnings()).rejects.toMatchObject({ code: 'CREATOR_NOT_APPROVED' });
  });
});

describe('fetchEarningsActivity', () => {
  const ITEM = {
    id: '0190a000-0000-7000-8000-000000000201',
    type: 'unlock',
    kind: 'SALE',
    occurredAt: '2026-11-03T05:00:00.000Z',
    buyerName: 'Tari',
    postCaption: null,
    grossKoin: 25,
    feeBps: 2000,
    netIdr: 20_000,
    status: 'PENDING',
    availableAt: '2026-11-17T05:00:00.000Z',
  };

  it('GETs a page for a type and parses it', async () => {
    const fetchMock = stub(Response.json({ items: [ITEM], nextCursor: '1762000000000_abc' }));
    const page = await fetchEarningsActivity({ type: 'unlock' });
    expect(page.items).toEqual([ITEM]);
    expect(page.nextCursor).toBe('1762000000000_abc');
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/v1/me/earnings/activity?type=unlock');
    expect(init.method).toBe('GET');
  });

  it('sends the cursor of the next page, URL-encoded, and omits it on the first page', async () => {
    const fetchMock = stub(Response.json({ items: [], nextCursor: null }));
    await fetchEarningsActivity({ type: 'all', cursor: '1762000000000_0190a000-0000' });
    expect(firstCall(fetchMock)[0]).toBe(
      '/api/v1/me/earnings/activity?type=all&cursor=1762000000000_0190a000-0000',
    );
    const second = stub(Response.json({ items: [], nextCursor: null }));
    await fetchEarningsActivity({ type: 'tip' });
    expect(firstCall(second)[0]).not.toContain('cursor');
  });

  it('rejects an answer that breaks the contract (an unknown type)', async () => {
    stub(Response.json({ items: [{ ...ITEM, type: 'refund' }], nextCursor: null }));
    await expect(fetchEarningsActivity({ type: 'all' })).rejects.toThrow();
  });

  it('rejects with the API error code', async () => {
    stub(apiError(400, 'VALIDATION_FAILED'));
    await expect(fetchEarningsActivity({ type: 'all', cursor: 'bad' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
