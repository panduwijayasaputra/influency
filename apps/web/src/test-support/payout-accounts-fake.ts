import {
  ERRORS,
  PAYOUT_ACCOUNT_MAX,
  type PayoutAccount,
  type PayoutAccountInput,
  payoutBankName,
} from '@influency/shared';
import { ApiError } from '@/lib/api/errors';

/**
 * TEST SUPPORT ONLY. An in-memory stand-in for `lib/api/payout-accounts` that follows the rules the API enforces (max
 * 3, the first account is active, activating moves the single active flag, the active one cannot be deleted), so UI
 * tests can run whole flows. The real API is tested in apps/api; this is never imported by application code.
 */
export const SEED_ACCOUNTS: PayoutAccount[] = [
  {
    id: '0190a000-0000-7000-8000-000000000401',
    bankCode: 'BCA',
    bankName: 'BCA',
    last4: '4821',
    holderName: 'Nadia Kirana',
    active: true,
    createdAt: '2026-10-01T03:00:00.000Z',
  },
  {
    id: '0190a000-0000-7000-8000-000000000402',
    bankCode: 'JAGO',
    bankName: 'Bank Jago',
    last4: '4756',
    holderName: 'Nadia Kirana',
    active: false,
    createdAt: '2026-10-15T03:00:00.000Z',
  },
];

type Code = 'PAYOUT_ACCOUNT_LIMIT' | 'PAYOUT_ACCOUNT_ACTIVE' | 'NOT_FOUND';
const fail = (code: Code): never => {
  throw new ApiError(code, ERRORS[code].message);
};

export function createPayoutAccountsFake(seed: PayoutAccount[] = SEED_ACCOUNTS) {
  let accounts: PayoutAccount[] = seed.map((a) => ({ ...a }));
  let nextId = 500;
  /** Active first, then oldest first (the API's order). */
  const sorted = () =>
    [...accounts]
      .sort((a, b) => Number(b.active) - Number(a.active) || a.createdAt.localeCompare(b.createdAt))
      .map((a) => ({ ...a }));

  return {
    /** Back to `list` (default: the seeded accounts). */
    reset(list: PayoutAccount[] = SEED_ACCOUNTS) {
      accounts = list.map((a) => ({ ...a }));
      nextId = 500;
    },
    fetchPayoutAccounts: async (): Promise<PayoutAccount[]> => {
      await Promise.resolve();
      return sorted();
    },
    createPayoutAccount: async (input: PayoutAccountInput): Promise<PayoutAccount> => {
      await Promise.resolve();
      if (accounts.length >= PAYOUT_ACCOUNT_MAX) return fail('PAYOUT_ACCOUNT_LIMIT');
      const active = accounts.length === 0 || input.makeActive;
      if (active) accounts = accounts.map((a) => ({ ...a, active: false }));
      const created: PayoutAccount = {
        id: `0190a000-0000-7000-8000-000000000${nextId++}`,
        bankCode: input.bankCode,
        bankName: payoutBankName(input.bankCode),
        last4: input.accountNumber.slice(-4),
        holderName: input.holderName,
        active,
        createdAt: new Date().toISOString(),
      };
      accounts = [...accounts, created];
      return { ...created };
    },
    activatePayoutAccount: async (id: string): Promise<PayoutAccount[]> => {
      await Promise.resolve();
      if (!accounts.some((a) => a.id === id)) return fail('NOT_FOUND');
      accounts = accounts.map((a) => ({ ...a, active: a.id === id }));
      return sorted();
    },
    deletePayoutAccount: async (id: string): Promise<void> => {
      await Promise.resolve();
      const target = accounts.find((a) => a.id === id);
      if (!target) return fail('NOT_FOUND');
      if (target.active) return fail('PAYOUT_ACCOUNT_ACTIVE');
      accounts = accounts.filter((a) => a.id !== id);
    },
  };
}

export type PayoutAccountsFake = ReturnType<typeof createPayoutAccountsFake>;
