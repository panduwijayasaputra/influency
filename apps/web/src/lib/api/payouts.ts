import {
  type CreatePayoutInput,
  type Payout,
  type PayoutPage,
  type PayoutQuote,
  payoutPageSchema,
  payoutQuoteSchema,
  payoutSchema,
} from '@influency/shared';
import { sendJson } from './errors';

/**
 * The creator's payouts (creator-studio US-063, US-064). Every function rejects with an `ApiError`. Nothing here pays
 * anything out: a payout is requested and reserved, and an admin decides it later.
 */

/**
 * GET /me/payouts/quote?amountIdr=: the fee (from server config), the net amount and the masked destination for a
 * payout of `amountIdr`. A preview, never a promise: the request checks everything again.
 * `PAYOUT_EXCEEDS_AVAILABLE` carries `details.availableIdr`.
 */
export async function quotePayout(amountIdr: number): Promise<PayoutQuote> {
  return sendJson('GET', `/me/payouts/quote?amountIdr=${amountIdr}`, payoutQuoteSchema);
}

/**
 * POST /me/payouts: requests a payout and reserves the amount. `idempotencyKey` is kept across retries of the same
 * attempt (the same key and payload returns the same payout) and renewed for a new one. `input.expectedFeeIdr` is the
 * fee that was shown; a changed fee is refused with `PAYOUT_FEE_CHANGED`.
 */
export async function requestPayout(
  input: CreatePayoutInput,
  idempotencyKey: string,
): Promise<Payout> {
  return sendJson('POST', '/me/payouts', payoutSchema, { body: input, idempotencyKey });
}

/** GET /me/payouts?cursor=: my payouts, newest first, 20 per page. Pass the previous page's `nextCursor`. */
export async function fetchPayouts(cursor?: string): Promise<PayoutPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return sendJson('GET', `/me/payouts${query}`, payoutPageSchema);
}

/**
 * POST /me/payouts/:id/cancel: only while the payout is REQUESTED; the reservation is released. Another creator's or an
 * unknown payout is NOT_FOUND; a decided one is `PAYOUT_NOT_CANCELABLE`.
 */
export async function cancelPayout(id: string): Promise<Payout> {
  return sendJson('POST', `/me/payouts/${encodeURIComponent(id)}/cancel`, payoutSchema);
}
