import {
  type PayoutAccount,
  type PayoutAccountInput,
  payoutAccountListSchema,
  payoutAccountSchema,
} from '@influency/shared';
import { sendJson } from './errors';

const BASE = '/me/payout-accounts';
/** The schema for an answer without a body (204). */
const NO_CONTENT = { parse: (): void => undefined };

/**
 * The creator's payout accounts (creator-studio US-062): `GET /me/payout-accounts`, active first. Only the bank and the
 * last 4 digits come back: the full number is write-only. Every function rejects with an `ApiError`.
 */
export async function fetchPayoutAccounts(): Promise<PayoutAccount[]> {
  return (await sendJson('GET', BASE, payoutAccountListSchema)).accounts;
}

/** POST /me/payout-accounts. The first account is always active; a 4th is refused (`PAYOUT_ACCOUNT_LIMIT`). */
export async function createPayoutAccount(input: PayoutAccountInput): Promise<PayoutAccount> {
  return sendJson('POST', BASE, payoutAccountSchema, { body: input });
}

/** POST /me/payout-accounts/:id/activate: the only active account afterwards. Returns the whole list. */
export async function activatePayoutAccount(id: string): Promise<PayoutAccount[]> {
  return (
    await sendJson('POST', `${BASE}/${encodeURIComponent(id)}/activate`, payoutAccountListSchema)
  ).accounts;
}

/** DELETE /me/payout-accounts/:id: refused for the active account (`PAYOUT_ACCOUNT_ACTIVE`). */
export async function deletePayoutAccount(id: string): Promise<void> {
  await sendJson('DELETE', `${BASE}/${encodeURIComponent(id)}`, NO_CONTENT);
}
