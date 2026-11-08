import { z } from 'zod';

/** LOCKED (Monetization Spec v1 §2): 1 Koin = Rp1.000. For display only; an order's price always comes from the DB package. */
export const KOIN_TO_IDR = 1000;

export const coinPackageSchema = z.object({
  id: z.uuid(),
  coins: z.int().positive(),
  priceIdr: z.int().positive(),
});
export type CoinPackage = z.infer<typeof coinPackageSchema>;
export const coinPackagesResponseSchema = z.object({ items: z.array(coinPackageSchema) });

export const walletSchema = z.object({ balanceCoins: z.int().nonnegative() });
export type Wallet = z.infer<typeof walletSchema>;

/** Purchases (feature 6) adds the debit types. */
export const walletEntryTypeSchema = z.enum(['TOPUP_CREDIT']);
export const walletTransactionSchema = z.object({
  id: z.uuid(),
  type: walletEntryTypeSchema,
  /** Signed: + credit, − debit. */
  amountCoins: z.int(),
  createdAt: z.iso.datetime(),
  topupOrderId: z.uuid().nullable(),
  /** E.g. a creator name for purchases; null for top-ups. */
  detail: z.string().nullable(),
});
export type WalletTransaction = z.infer<typeof walletTransactionSchema>;
export const walletTransactionsPageSchema = z.object({
  items: z.array(walletTransactionSchema),
  nextCursor: z.string().nullable(),
});
export type WalletTransactionsPage = z.infer<typeof walletTransactionsPageSchema>;

export const topupStatusSchema = z.enum([
  'PENDING',
  'UNDER_REVIEW',
  'CREDITED',
  'FAILED',
  'EXPIRED',
  'CANCELED',
]);
export type TopupStatus = z.infer<typeof topupStatusSchema>;
export const topupOrderSchema = z.object({
  id: z.uuid(),
  status: topupStatusSchema,
  coins: z.int().positive(),
  priceIdr: z.int().positive(),
  feeIdr: z.int().nonnegative(),
  totalIdr: z.int().positive(),
  createdAt: z.iso.datetime(),
  creditedAt: z.iso.datetime().nullable(),
  /** The owner's balance, only once CREDITED. */
  balanceCoins: z.int().nonnegative().nullable(),
  /** "Lanjutkan pembayaran" target while PENDING. */
  redirectUrl: z.string().nullable(),
});
export type TopupOrder = z.infer<typeof topupOrderSchema>;
export const pendingTopupsResponseSchema = z.object({ items: z.array(topupOrderSchema) });

export const createTopupRequestSchema = z.object({ packageId: z.uuid() });
export type CreateTopupRequest = z.infer<typeof createTopupRequestSchema>;
export const createTopupResponseSchema = z.object({ orderId: z.uuid(), redirectUrl: z.string() });
export type CreateTopupResponse = z.infer<typeof createTopupResponseSchema>;
