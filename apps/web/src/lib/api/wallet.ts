import {
  API_PREFIX,
  type CoinPackage,
  coinPackagesResponseSchema,
  type CreateTopupResponse,
  createTopupResponseSchema,
  errorResponseSchema,
  pendingTopupsResponseSchema,
  type TopupOrder,
  topupOrderSchema,
  type Wallet,
  walletSchema,
  type WalletTransactionsPage,
  walletTransactionsPageSchema,
} from '@influency/shared';
import { ApiError } from './errors';

export { ApiError };

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`/${API_PREFIX}${path}`, { credentials: 'include', ...init });
}

async function getJson(path: string): Promise<unknown> {
  const res = await request(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

/** The signed-in user's Koin balance. */
export async function fetchWallet(): Promise<Wallet> {
  return walletSchema.parse(await getJson('/wallet'));
}

/** Active packages, smallest first. */
export async function fetchCoinPackages(): Promise<CoinPackage[]> {
  return coinPackagesResponseSchema.parse(await getJson('/wallet/packages')).items;
}

/** Wallet activity, newest first. `cursor` is opaque (null = first page). */
export async function fetchWalletTransactions(
  cursor: string | null,
): Promise<WalletTransactionsPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return walletTransactionsPageSchema.parse(await getJson(`/wallet/transactions${query}`));
}

/** Orders waiting for payment. */
export async function fetchPendingTopups(): Promise<TopupOrder[]> {
  return pendingTopupsResponseSchema.parse(await getJson('/wallet/topups')).items;
}

/** One of the viewer's orders, or null when it does not exist (or is someone else's). */
export async function fetchTopup(orderId: string): Promise<TopupOrder | null> {
  const res = await request(`/wallet/topups/${encodeURIComponent(orderId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /wallet/topups/:id failed: ${res.status}`);
  return topupOrderSchema.parse(await res.json());
}

/**
 * Creates a top-up order for a package. `idempotencyKey` is kept across retries of the same attempt; only the
 * package id is sent, the server prices the order. Rejects with an `ApiError` carrying the shared error code.
 */
export async function createTopup(
  packageId: string,
  idempotencyKey: string,
): Promise<CreateTopupResponse> {
  const res = await request('/wallet/topups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ packageId }),
  });
  if (!res.ok) {
    const body = errorResponseSchema.safeParse(await res.json().catch(() => null));
    if (body.success) throw new ApiError(body.data.error.code, body.data.error.message);
    throw new ApiError('INTERNAL_ERROR', 'Gagal membuat pesanan. Coba lagi.');
  }
  return createTopupResponseSchema.parse(await res.json());
}

/** Sends the browser to the payment page (a separate function so tests can mock navigation). */
export function startCheckout(redirectUrl: string): void {
  window.location.assign(redirectUrl);
}
