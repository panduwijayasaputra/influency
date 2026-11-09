# Technical Plan: US-027 — Dompet Page UI

## Architecture Overview

UI-first with dummy data. One shared contract in `packages/shared/src/wallet.ts` describes every wallet/top-up shape the backend (US-029 to US-032) will return. `apps/web/src/lib/api/wallet.ts` is the **only** place that knows where wallet data comes from. In this story it returns dummy data with that exact shape; US-029 and US-030 swap the bodies for real `fetch` calls without touching components.

Dompet (`/wallet`) is a server page (`PageHeader` + client `WalletView`) that fetches in the browser like `HomeFeed` does, so skeleton / error / retry live in one client component. The drawer's Koin card and (in US-029) the purchase sheet read the balance through one `useWalletBalance()` hook.

## Dependencies

None new.

## Risks

- **Dummy data looking real:** every dummy function carries `// shortcut: dummy until US-029/US-030` and the dummy activity uses obviously fake titles. No Koin moves; "Beli" is a stub toast until US-028.
- **IDR/Koin numbers:** the contract uses `z.int()` (JS number). Koin and IDR values are far below 2^53; the API converts BigInt with a safe check (US-029).

## Tasks

### TASK-145: Shared wallet contract and interim wallet data source

**Shared** — new `packages/shared/src/wallet.ts`, exported from `index.ts`, with tests in `wallet.test.ts`:

```ts
export const KOIN_TO_IDR = 1000; // LOCKED (Monetization Spec §2): display only, never used to price an order
export const coinPackageSchema = z.object({ id: z.uuid(), coins: z.int().positive(), priceIdr: z.int().positive() });
export const coinPackagesResponseSchema = z.object({ items: z.array(coinPackageSchema) });
export const walletSchema = z.object({ balanceCoins: z.int().nonnegative() });
export const walletEntryTypeSchema = z.enum(['TOPUP_CREDIT']); // purchases adds POST_UNLOCK_DEBIT, SUBSCRIPTION_DEBIT, TIP_DEBIT, …
export const walletTransactionSchema = z.object({
  id: z.uuid(),
  type: walletEntryTypeSchema,
  amountCoins: z.int(),           // signed: + credit, − debit
  createdAt: z.iso.datetime(),
  topupOrderId: z.uuid().nullable(),
  detail: z.string().nullable(),  // e.g. creator name for purchases; null for top-ups
});
export const walletTransactionsPageSchema = z.object({ items: z.array(walletTransactionSchema), nextCursor: z.string().nullable() });
export const topupStatusSchema = z.enum(['PENDING', 'UNDER_REVIEW', 'CREDITED', 'FAILED', 'EXPIRED', 'CANCELED']);
export const topupOrderSchema = z.object({
  id: z.uuid(), status: topupStatusSchema, coins: z.int().positive(), priceIdr: z.int().positive(),
  feeIdr: z.int().nonnegative(), totalIdr: z.int().positive(), createdAt: z.iso.datetime(),
  creditedAt: z.iso.datetime().nullable(),
  balanceCoins: z.int().nonnegative().nullable(), // owner's balance, only when CREDITED
  redirectUrl: z.url().nullable(),                // "Lanjutkan pembayaran" while PENDING
});
export const pendingTopupsResponseSchema = z.object({ items: z.array(topupOrderSchema) });
export const createTopupRequestSchema = z.object({ packageId: z.uuid() });
export const createTopupResponseSchema = z.object({ orderId: z.uuid(), redirectUrl: z.string() });
```

Tests: each schema accepts a valid sample and rejects a float Koin, a negative balance and an unknown status.

**Web** — new `apps/web/src/lib/api/wallet.ts` (client-side fetchers; same signatures the real API will back):
- `fetchWallet(): Promise<Wallet>`
- `fetchWalletTransactions(cursor: string | null): Promise<WalletTransactionsPage>` (pages of 10)
- `fetchCoinPackages(): Promise<CoinPackage[]>`
- `fetchPendingTopups(): Promise<TopupOrder[]>`
Each body is `// shortcut: dummy until US-029 (US-030 for topups); swap for fetch(`/${API_PREFIX}/wallet…`, { credentials: 'include' })`. Dummy data lives in the same file: balance 120 Koin, the five LOCKED packages (10/25/50/100/250 at Rp1.000 per Koin, fixed fake UUIDs), 13 TOPUP_CREDIT entries (so a second page exists), one pending top-up. Each dummy call awaits a short delay so skeletons are visible. Results are parsed with the shared schemas.

New `apps/web/src/lib/format.ts` (if no formatter exists): `formatRupiah(n) → "Rp25.000"` via `Intl.NumberFormat('id-ID')` (no decimals), `formatKoin(n) → "1.250 Koin"`, `formatJakartaDate(iso) → "3 Nov 2026"` (`timeZone: 'Asia/Jakarta'`). Unit tests for each.

New `apps/web/src/lib/use-wallet-balance.ts` (client hook): `useWalletBalance(enabled = true) → { balance: number | null; error: boolean; reload(): void }`, calls `fetchWallet()` on mount/when enabled. Test with a mocked `fetchWallet`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/wallet.ts` (+ `.test.ts`) | Wallet / package / top-up contract |
| MODIFY | `packages/shared/src/index.ts` | export |
| CREATE | `apps/web/src/lib/api/wallet.ts` (+ `.test.ts`) | Interim swappable data source |
| CREATE | `apps/web/src/lib/format.ts` (+ `.test.ts`) | Rupiah / Koin / Jakarta date |
| CREATE | `apps/web/src/lib/use-wallet-balance.ts` (+ `.test.ts`) | Balance hook |

**Testing:** schema tests; formatter tests (`25000 → "Rp25.000"`, Jakarta date across UTC midnight); hook loading / error / reload.

---

### TASK-146: Dompet page and drawer Koin card

**Page** `apps/web/src/app/(public)/wallet/page.tsx`: replace `ComingSoon` with `PageHeader` (title "Dompet", `asHeading`) + `<WalletView />`. Login-only already via `src/proxy.ts` (not in `isGuestPath`); keep `metadata.title = 'Dompet'`.

**Components** in new `apps/web/src/components/wallet/`:
- `wallet-view.tsx` (`"use client"`): loads `fetchWallet`, `fetchCoinPackages`, `fetchPendingTopups` and the first activity page in parallel. One skeleton while loading; if the wallet or packages call fails, an inline alert "Gagal memuat dompet." + "Coba lagi". Renders, in order:
  - `BalanceCard` — koin surface (`bg-koin-soft`/`text-koin-foreground` tokens; check `globals.css` names), `KoinIcon`, "Saldo Koin", balance in 36px/800, "≈ {formatRupiah(balance × KOIN_TO_IDR)} · 1 Koin = Rp1.000".
  - Pending top-ups (only if any): "Menunggu pembayaran" rows linking to `/wallet/topups/{id}` (the route arrives in US-028; a 404 until then is fine).
  - `PackagePicker` — `<section aria-labelledby>` "Beli Koin"; 5 tiles as `<button aria-pressed>` in a 3-column grid (2 rows), coral selection ring per artboard; the 25 Koin package is preselected; primary `Button` "Beli {coins} Koin · {formatRupiah(priceIdr)}" (52px). Click → `onBuy(pkg)` prop; in this story `WalletView` passes a handler that shows toast "Segera hadir". Under the button: "Kamu bisa isi ulang lebih dari sekali." and a muted note "Kebijakan masa berlaku & pengembalian Koin: Perlu konfirmasi."
  - `WalletActivity` — "Aktivitas"; rows: title by type (`TOPUP_CREDIT` → "Isi ulang · {n} Koin"), `formatJakartaDate(createdAt)`, amount `+{n}` in success colour / `−{n}` in text colour; "Belum ada aktivitas." when empty; "Muat lagi" button while `nextCursor` (loading + inline retry on failure, keeping loaded rows).
- Tiles and buttons ≥ 44px; works at 360px.

**Drawer** `apps/web/src/components/account-drawer.tsx`: replace `DEMO_KOIN_BALANCE` with `useWalletBalance(open)` — show the balance, "—" while loading or on error. The card and "Beli Koin" link go to `/wallet` (already). Remove the `shortcut:` comment there. Keep `DEMO_KOIN_BALANCE` in `lib/demo.ts` (purchase sheet still uses it until TASK-151).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/wallet/page.tsx` | Dompet page |
| CREATE | `apps/web/src/components/wallet/wallet-view.tsx` (+ test) | Loading / error / sections |
| CREATE | `apps/web/src/components/wallet/balance-card.tsx` | Saldo Koin |
| CREATE | `apps/web/src/components/wallet/package-picker.tsx` (+ test) | Beli Koin tiles |
| CREATE | `apps/web/src/components/wallet/wallet-activity.tsx` (+ test) | Aktivitas list |
| MODIFY | `apps/web/src/components/account-drawer.tsx` (+ test) | Real balance hook |

**Testing (Vitest + Testing Library, `fetch…` functions mocked):** skeleton then content; wallet failure → "Coba lagi" reloads; empty activity text; "Muat lagi" appends page 2 and a failed page keeps page 1; package selection toggles `aria-pressed` and updates the button label; keyboard activation of a tile; drawer shows mocked balance and "—" on error.
