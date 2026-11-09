import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PayoutAccountInput } from '@influency/shared';
import {
  activatePayoutAccount,
  createPayoutAccount,
  deletePayoutAccount,
  fetchPayoutAccounts,
} from './payout-accounts';

const ID = '0190a000-0000-7000-8000-000000000401';
const ACCOUNT = {
  id: ID,
  bankCode: 'BCA',
  bankName: 'BCA',
  last4: '4821',
  holderName: 'Nadia Kirana',
  active: true,
  createdAt: '2026-10-01T03:00:00.000Z',
};
const apiError = (status: number, code: string) =>
  Response.json({ error: { code, message: 'x', requestId: 'r', details: null } }, { status });
const stub = (response: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const firstCall = (fetchMock: ReturnType<typeof stub>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe('fetchPayoutAccounts', () => {
  it('GETs the list and returns the accounts', async () => {
    const fetchMock = stub(Response.json({ accounts: [ACCOUNT] }));
    expect(await fetchPayoutAccounts()).toEqual([ACCOUNT]);
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/v1/me/payout-accounts');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('rejects an answer that carries a full account number in place of the last 4 digits', async () => {
    stub(Response.json({ accounts: [{ ...ACCOUNT, last4: '1234564821' }] }));
    await expect(fetchPayoutAccounts()).rejects.toThrow();
  });

  it('rejects with the API error code', async () => {
    stub(apiError(403, 'CREATOR_NOT_APPROVED'));
    await expect(fetchPayoutAccounts()).rejects.toMatchObject({ code: 'CREATOR_NOT_APPROVED' });
  });
});

describe('createPayoutAccount', () => {
  const input: PayoutAccountInput = {
    bankCode: 'BCA',
    accountNumber: '1234564821',
    holderName: 'Nadia Kirana',
    makeActive: false,
  };

  it('POSTs the input and parses the masked account', async () => {
    const fetchMock = stub(Response.json(ACCOUNT, { status: 201 }));
    const created = await createPayoutAccount(input);
    expect(created).toEqual(ACCOUNT);
    expect(JSON.stringify(created)).not.toContain('1234564821');
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/v1/me/payout-accounts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it.each([
    ['PAYOUT_ACCOUNT_LIMIT', 409],
    ['VALIDATION_FAILED', 400],
  ])('rejects with %s', async (code, status) => {
    stub(apiError(status, code));
    await expect(createPayoutAccount(input)).rejects.toMatchObject({ code });
  });
});

describe('activatePayoutAccount', () => {
  it('POSTs to the account and returns the whole list', async () => {
    const fetchMock = stub(Response.json({ accounts: [ACCOUNT] }));
    expect(await activatePayoutAccount(ID)).toEqual([ACCOUNT]);
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(`/api/v1/me/payout-accounts/${ID}/activate`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('rejects with NOT_FOUND for an account that is not yours', async () => {
    stub(apiError(404, 'NOT_FOUND'));
    await expect(activatePayoutAccount(ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deletePayoutAccount', () => {
  it('DELETEs and accepts the empty 204 answer', async () => {
    const fetchMock = stub(new Response(null, { status: 204 }));
    await expect(deletePayoutAccount(ID)).resolves.toBeUndefined();
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(`/api/v1/me/payout-accounts/${ID}`);
    expect(init.method).toBe('DELETE');
  });

  it('rejects with PAYOUT_ACCOUNT_ACTIVE for the active account', async () => {
    stub(apiError(409, 'PAYOUT_ACCOUNT_ACTIVE'));
    await expect(deletePayoutAccount(ID)).rejects.toMatchObject({ code: 'PAYOUT_ACCOUNT_ACTIVE' });
  });

  it('encodes the id in the path', async () => {
    const fetchMock = stub(new Response(null, { status: 204 }));
    await deletePayoutAccount('a/b');
    expect(firstCall(fetchMock)[0]).toBe('/api/v1/me/payout-accounts/a%2Fb');
  });
});
