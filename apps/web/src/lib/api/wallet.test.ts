import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createTopup,
  fetchCoinPackages,
  fetchPendingTopups,
  fetchTopup,
  fetchWallet,
  fetchWalletTransactions,
} from './wallet';

const id = '0198a3c0-0000-7000-8000-000000000001';
const ORDER = {
  id,
  status: 'PENDING',
  coins: 25,
  priceIdr: 25000,
  feeIdr: 0,
  totalIdr: 25000,
  createdAt: '2026-11-07T03:00:00.000Z',
  creditedAt: null,
  balanceCoins: null,
  redirectUrl: 'https://pay.example/x',
};
const stubFetch = (res: Response) => {
  // A Response body can be read once, so every call gets a copy.
  const fetchMock = vi.fn(() => Promise.resolve(res.clone()));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe('wallet API client', () => {
  it('reads the balance with the session cookie', async () => {
    const fetchMock = stubFetch(Response.json({ balanceCoins: 42 }));
    expect(await fetchWallet()).toEqual({ balanceCoins: 42 });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/wallet', { credentials: 'include' });
  });

  it('unwraps the package list', async () => {
    stubFetch(Response.json({ items: [{ id, coins: 10, priceIdr: 10000 }] }));
    expect(await fetchCoinPackages()).toEqual([{ id, coins: 10, priceIdr: 10000 }]);
  });

  it('sends the cursor, URL-encoded, and parses the page', async () => {
    const fetchMock = stubFetch(Response.json({ items: [], nextCursor: null }));
    await fetchWalletTransactions('12_a b');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/wallet/transactions?cursor=12_a%20b', {
      credentials: 'include',
    });
    await fetchWalletTransactions(null);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/wallet/transactions', {
      credentials: 'include',
    });
  });

  it('rejects on a non-OK response and on a body that breaks the contract', async () => {
    stubFetch(new Response('', { status: 401 }));
    await expect(fetchWallet()).rejects.toThrow('401');
    stubFetch(Response.json({ balanceCoins: -1 }));
    await expect(fetchWallet()).rejects.toThrow();
  });

  it('lists pending top-ups and reads one order, null on 404', async () => {
    stubFetch(Response.json({ items: [ORDER] }));
    expect((await fetchPendingTopups())[0]!.id).toBe(id);
    const fetchMock = stubFetch(Response.json(ORDER));
    expect((await fetchTopup(id))?.status).toBe('PENDING');
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/wallet/topups/${id}`, {
      credentials: 'include',
    });
    stubFetch(new Response('{}', { status: 404 }));
    expect(await fetchTopup(id)).toBeNull();
    stubFetch(new Response('', { status: 500 }));
    await expect(fetchTopup(id)).rejects.toThrow('500');
  });
});

describe('createTopup', () => {
  it('sends only the package id with the Idempotency-Key and parses 201', async () => {
    const fetchMock = stubFetch(
      Response.json({ orderId: id, redirectUrl: 'https://pay.example/x' }, { status: 201 }),
    );
    expect(await createTopup('pkg-1', 'key-12345678')).toEqual({
      orderId: id,
      redirectUrl: 'https://pay.example/x',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/wallet/topups');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'key-12345678' });
    expect(JSON.parse(init.body as string)).toEqual({ packageId: 'pkg-1' });
  });

  it('throws an ApiError carrying the shared code', async () => {
    stubFetch(
      Response.json(
        {
          error: {
            code: 'REQUEST_IN_PROGRESS',
            message: 'Masih diproses.',
            requestId: 'r',
            details: null,
          },
        },
        { status: 409 },
      ),
    );
    const error = await createTopup('p', 'key-12345678').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'REQUEST_IN_PROGRESS', message: 'Masih diproses.' });
  });

  it('falls back to a generic ApiError for an unreadable error body', async () => {
    stubFetch(new Response('<html>', { status: 502 }));
    await expect(createTopup('p', 'key-12345678')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
