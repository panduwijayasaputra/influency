import {
  type EarningsActivityPage,
  type EarningsActivityQuery,
  type EarningsBalance,
  earningsActivityPageSchema,
  earningsBalanceSchema,
} from '@influency/shared';
import { sendJson } from './errors';

/**
 * GET /me/earnings: the balance the server computes from the revenue ledger and the payouts (creator-studio US-060).
 * Rejects with an `ApiError`.
 */
export async function fetchEarnings(): Promise<EarningsBalance> {
  return sendJson('GET', '/me/earnings', earningsBalanceSchema);
}

/**
 * GET /me/earnings/activity?type=&cursor=: the creator's unlocks, subscriptions and tips, newest first, with the fee and
 * the creator share of each (creator-studio US-061). Rejects with an `ApiError`.
 */
export async function fetchEarningsActivity(
  query: Pick<EarningsActivityQuery, 'type'> & { cursor?: string },
): Promise<EarningsActivityPage> {
  const params = new URLSearchParams({ type: query.type });
  if (query.cursor) params.set('cursor', query.cursor);
  return sendJson('GET', `/me/earnings/activity?${params}`, earningsActivityPageSchema);
}
