import { z } from 'zod';

/** LOCKED (Monetization Spec v1 §8): earnings stay pending this many days before they can be withdrawn. */
export const EARNINGS_PENDING_DAYS = 14;
/** LOCKED (Monetization Spec v1 §2): minimum withdrawal in IDR, measured before the transfer fee. */
export const PAYOUT_MIN_IDR = 100_000;

/** GET /me/earnings. Integer IDR; computed by the server from the revenue ledger and payouts. */
export const earningsBalanceSchema = z.object({
  pendingIdr: z.int().nonnegative(),
  availableIdr: z.int().nonnegative(),
  /** Requested payouts: reserved, not yet paid. */
  reservedIdr: z.int().nonnegative(),
  paidOutIdr: z.int().nonnegative(),
  /** When the next pending amount matures; null when nothing is pending. */
  nextMaturityAt: z.iso.datetime().nullable(),
  nextMaturityIdr: z.int().nonnegative(),
});
export type EarningsBalance = z.infer<typeof earningsBalanceSchema>;

export const EARNINGS_ACTIVITY_TYPES = ['all', 'subscription', 'unlock', 'tip'] as const;
export type EarningsActivityType = (typeof EARNINGS_ACTIVITY_TYPES)[number];

/** GET /me/earnings/activity?type=&cursor= */
export const earningsActivityQuerySchema = z.object({
  type: z.enum(EARNINGS_ACTIVITY_TYPES).default('all'),
  cursor: z.string().min(1).optional(),
});
export type EarningsActivityQuery = z.infer<typeof earningsActivityQuerySchema>;

/** One creator revenue row. Only the buyer's display name leaves the API: no ids, usernames or Telegram data. */
export const earningsActivityItemSchema = z.object({
  id: z.uuid(),
  type: z.enum(['subscription', 'unlock', 'tip']),
  /** REVERSAL rows (a cancelled scheduled renewal) carry a negative `netIdr`. */
  kind: z.enum(['SALE', 'REVERSAL']),
  occurredAt: z.iso.datetime(),
  buyerName: z.string(),
  /** First line of the post caption for an unlock or a post tip; null otherwise. */
  postCaption: z.string().nullable(),
  grossKoin: z.int().positive(),
  feeBps: z.int().min(0).max(10_000),
  /** The stored creator amount in IDR (not recomputed). */
  netIdr: z.int(),
  status: z.enum(['PENDING', 'AVAILABLE']),
  availableAt: z.iso.datetime(),
});
export type EarningsActivityItem = z.infer<typeof earningsActivityItemSchema>;
export const earningsActivityPageSchema = z.object({
  items: z.array(earningsActivityItemSchema),
  nextCursor: z.string().nullable(),
});
export type EarningsActivityPage = z.infer<typeof earningsActivityPageSchema>;

/** `REQUESTED` reserves earnings; the admin feature adds the transitions to the other statuses. */
export const PAYOUT_STATUSES = ['REQUESTED', 'CANCELED', 'REJECTED', 'PAID_OUT'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** A payout account as shown anywhere: bank and last 4 digits only, never the full number. */
export const payoutDestinationSchema = z.object({
  bankCode: z.string(),
  bankName: z.string(),
  last4: z.string().regex(/^\d{4}$/),
  holderName: z.string(),
});
export type PayoutDestination = z.infer<typeof payoutDestinationSchema>;

export const payoutSchema = z.object({
  id: z.uuid(),
  amountIdr: z.int().positive(),
  feeIdr: z.int().nonnegative(),
  netIdr: z.int().positive(),
  /** True while the transfer fee is a labelled [TBD] example ("Perlu konfirmasi"). */
  feeIsPlaceholder: z.boolean(),
  status: z.enum(PAYOUT_STATUSES),
  /** Snapshot taken when the payout was requested. */
  destination: payoutDestinationSchema,
  requestedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Payout = z.infer<typeof payoutSchema>;
export const payoutPageSchema = z.object({
  items: z.array(payoutSchema),
  nextCursor: z.string().nullable(),
});
export type PayoutPage = z.infer<typeof payoutPageSchema>;

/** At most this many payout accounts per creator; exactly one is active. */
export const PAYOUT_ACCOUNT_MAX = 3;

/**
 * EXAMPLE list from the design. The final bank list is OPEN ("Perlu konfirmasi"), so the UI and the API both read it
 * from here and it can change in one place.
 */
export const PAYOUT_BANKS = [
  { code: 'BCA', name: 'BCA' },
  { code: 'BNI', name: 'BNI' },
  { code: 'BRI', name: 'BRI' },
  { code: 'MANDIRI', name: 'Mandiri' },
  { code: 'JAGO', name: 'Bank Jago' },
  { code: 'PERMATA', name: 'Permata' },
  { code: 'CIMB', name: 'CIMB Niaga' },
] as const;
export const PAYOUT_BANK_CODES = PAYOUT_BANKS.map((b) => b.code) as [
  (typeof PAYOUT_BANKS)[number]['code'],
  ...(typeof PAYOUT_BANKS)[number]['code'][],
];
/** Display name of a bank code; the code itself for one no longer on the list. */
export const payoutBankName = (code: string): string =>
  PAYOUT_BANKS.find((b) => b.code === code)?.name ?? code;

/** Body of POST /me/payout-accounts. The number is write-only: it is never returned. */
export const payoutAccountInputSchema = z.strictObject({
  bankCode: z.enum(PAYOUT_BANK_CODES, 'Pilih bank.'),
  accountNumber: z
    .string()
    .transform((s) => s.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{6,20}$/, 'Nomor rekening harus 6–20 digit angka.')),
  holderName: z
    .string()
    .trim()
    .min(1, 'Nama pemilik rekening wajib diisi.')
    .max(100, 'Nama pemilik maksimal 100 karakter.'),
  /** The first account is always active; later ones become active only when asked. */
  makeActive: z.boolean().default(false),
});
export type PayoutAccountInput = z.output<typeof payoutAccountInputSchema>;

export const payoutAccountSchema = payoutDestinationSchema.extend({
  id: z.uuid(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type PayoutAccount = z.infer<typeof payoutAccountSchema>;
export const payoutAccountListSchema = z.object({ accounts: z.array(payoutAccountSchema) });
export type PayoutAccountList = z.infer<typeof payoutAccountListSchema>;

/** GET /me/payouts/quote?amountIdr= . The minimum is measured before the transfer fee (spec §8, still OPEN). */
export const payoutQuoteQuerySchema = z.object({
  amountIdr: z.coerce.number().int().min(PAYOUT_MIN_IDR, 'Minimal pencairan Rp100.000.'),
});
export type PayoutQuoteQuery = z.infer<typeof payoutQuoteQuerySchema>;

export const payoutQuoteSchema = z.object({
  amountIdr: z.int().positive(),
  /** From server config, never from the client. */
  feeIdr: z.int().nonnegative(),
  netIdr: z.int(),
  /** True while the fee is a labelled [TBD] example ("Perlu konfirmasi"). */
  feeIsPlaceholder: z.boolean(),
  availableIdr: z.int().nonnegative(),
  destination: payoutDestinationSchema,
});
export type PayoutQuote = z.infer<typeof payoutQuoteSchema>;

/**
 * POST /me/payouts (with an `Idempotency-Key`). `expectedFeeIdr` is the fee the creator was shown: the API refuses the
 * request if the configured fee changed in between, so there is never a surprise.
 */
export const createPayoutSchema = z.strictObject({
  amountIdr: z.int().min(PAYOUT_MIN_IDR),
  expectedFeeIdr: z.int().nonnegative(),
});
export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;

/** GET /me/payouts?cursor= (newest first, 20 per page). */
export const payoutListQuerySchema = z.object({ cursor: z.string().min(1).optional() });
export type PayoutListQuery = z.infer<typeof payoutListQuerySchema>;
