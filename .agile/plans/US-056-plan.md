# Technical Plan: US-056 — Penghasilan Page UI

## Architecture Overview

Same pattern as the user area: the contract lives in `packages/shared/src/payouts.ts`, the page renders from data functions in `lib/api/earnings.ts` and `lib/api/payouts.ts`, and those functions return dummy data shaped exactly like the final responses. US-060, US-061 and US-064 swap the bodies without touching components.

`/studio/earnings` (already linked from the drawer "Penghasilan") replaces `ComingSoon` with `EarningsView` (client): a balance card, the payout account card, Riwayat (chips + infinite list), and the Pencairan list. The "Ajukan pencairan" button opens the US-058 sheet. Until US-058 lands, it opens nothing and shows the toast "Segera hadir".

## Dependencies

- Reuse `usePagedList` (`lib/use-paged-list.ts`), `ListSkeleton` / `ListEmpty` / `ListError` (`components/user-area/`), `formatIdr` (`lib/format.ts`, added in US-054 if missing), and a chip style (copy the design: dark selected chip).

## Risks

- **Contract drift between UI and API.** Mitigation: define every schema here in shared and parse the dummy data with it in the tests, so US-060/061/064 must satisfy the same schema.

## Tasks

### TASK-202: Earnings & payout contract + dummy data functions

**`packages/shared/src/payouts.ts`** (export it from `index.ts`):
- `EARNINGS_PENDING_DAYS = 14` (LOCKED, spec §8) and `PAYOUT_MIN_IDR = 100_000` (LOCKED).
- `earningsBalanceSchema = z.object({ pendingIdr, availableIdr, reservedIdr, paidOutIdr: z.number().int().nonnegative(), nextMaturityAt: z.string().datetime().nullable(), nextMaturityIdr: z.number().int().nonnegative() })` → `EarningsBalance`.
- `EARNINGS_ACTIVITY_TYPES = ['all', 'subscription', 'unlock', 'tip'] as const`; `earningsActivityQuerySchema = z.object({ type: z.enum(EARNINGS_ACTIVITY_TYPES).default('all'), cursor: z.string().optional() })`.
- `earningsActivityItemSchema = z.object({ id: z.string().uuid(), type: z.enum(['subscription', 'unlock', 'tip']), kind: z.enum(['SALE', 'REVERSAL']), occurredAt: z.string().datetime(), buyerName: z.string(), postCaption: z.string().nullable(), grossKoin: z.number().int(), feeBps: z.number().int(), netIdr: z.number().int(), status: z.enum(['PENDING', 'AVAILABLE']), availableAt: z.string().datetime() })`.
- `earningsActivityPageSchema = z.object({ items: z.array(item), nextCursor: z.string().nullable() })`.
- `PAYOUT_STATUSES = ['REQUESTED', 'CANCELED', 'REJECTED', 'PAID_OUT'] as const`.
- `payoutDestinationSchema = z.object({ bankCode: z.string(), bankName: z.string(), last4: z.string().regex(/^\d{4}$/), holderName: z.string() })`.
- `payoutSchema = z.object({ id, amountIdr, feeIdr, netIdr, feeIsPlaceholder: z.boolean(), status: z.enum(PAYOUT_STATUSES), destination: payoutDestinationSchema, requestedAt, updatedAt })`; `payoutPageSchema = { items: payoutSchema[], nextCursor }`.
- Unit tests in `payouts.test.ts` (schema accept/reject basics).

**Web data functions** (client, same-origin):
- `lib/api/earnings.ts`: `fetchEarnings(): Promise<EarningsBalance>` and `fetchEarningsActivity(query): Promise<EarningsActivityPage>`.
- `lib/api/payouts.ts`: `fetchPayouts(cursor?): Promise<PayoutPage>`.
- Bodies return dummy fixtures:
  - balance: available Rp248.500, pending Rp63.750 maturing in 5 days, reserved 0;
  - ~12 activity items of all three types, incl. one REVERSAL;
  - 2 payouts (one REQUESTED, one PAID_OUT).
  - Each body is marked `// dummy until US-060` (and US-061, US-064).
  - Activity filters by `type` and pages 5 at a time with a fake cursor, so paging can be exercised.
- `fetchActivePayoutAccount()` is planned in US-057; until then the earnings view reads it from a local dummy in `lib/api/payout-accounts.ts` (create the file with just `fetchPayoutAccounts()` returning one active BCA account; US-057 extends it).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/payouts.ts` (+ `payouts.test.ts`) | Contract + LOCKED constants |
| MODIFY | `packages/shared/src/index.ts` | Export |
| CREATE | `apps/web/src/lib/api/earnings.ts` (+ test) | Dummy balance + activity |
| CREATE | `apps/web/src/lib/api/payouts.ts` (+ test) | Dummy payout list |
| CREATE | `apps/web/src/lib/api/payout-accounts.ts` | Dummy list (extended in US-057) |

**Testing:** the dummies parse with their shared schemas; the activity filter and paging work.

---

### TASK-203: Penghasilan page (`EarningsView`)

- **`apps/web/src/app/studio/earnings/page.tsx`:** metadata "Penghasilan"; `<h1>` "Penghasilan"; renders `<EarningsView />`.
- **`apps/web/src/app/studio/earnings/earnings-view.tsx` (`'use client'`):**
  - **Balance card:**
    - "Saldo tersedia" + `formatIdr(availableIdr)` (large).
    - A row "Tertunda {formatIdr(pendingIdr)}" + "Tersedia mulai {date Asia/Jakarta, e.g. 14 Nov}" when `nextMaturityAt`.
    - A row "Dalam pencairan {reservedIdr}" only when > 0.
    - The note "Penghasilan tertunda selama 14 hari sebelum bisa dicairkan." (built from `EARNINGS_PENDING_DAYS`).
    - The primary button "Ajukan pencairan": disabled when `availableIdr < PAYOUT_MIN_IDR` (hint "Minimal pencairan Rp100.000.") or when there is no active account (hint "Tambahkan rekening pencairan dulu."). On click it calls `onRequestPayout` (TASK-206 wires the sheet; until then toast "Segera hadir").
  - **Payout account card:** "Rekening pencairan", badge "Aktif", "{bankName} •••• {last4}", "a.n. {holderName}", link "Kelola" → `/studio/payout-accounts?from=earnings`. With no account: "Belum ada rekening" + "Tambah rekening" link.
  - **Riwayat:**
    - Chips Semua / Langganan / Unlock / Tip (`aria-pressed`) → `usePagedList(load, type)` with infinite scroll (`sentinelRef`).
    - Row icon per type, title "{buyerName} berlangganan" / "{buyerName} membuka post" / "{buyerName} mengirim tip" (REVERSAL: "Langganan dibatalkan · {buyerName}").
    - Meta "{date} · {grossKoin} Koin · biaya {feeBps/100}%" or "tanpa biaya", plus `postCaption` excerpt when present.
    - Right side: "+{formatIdr(netIdr)}" (negative for reversals) and a badge Tertunda/Tersedia.
    - Empty "Belum ada penghasilan."; error with "Coba lagi".
  - **Pencairan section:** list from `fetchPayouts()`: amount, status label (REQUESTED "Diajukan", CANCELED "Dibatalkan", REJECTED "Ditolak", PAID_OUT "Dibayar"), date. Empty "Belum ada pencairan." TASK-206 adds Batalkan here.
  - **Footer:** "Jumlah ditampilkan setelah biaya platform: 15% langganan, 20% unlock, 0% tip. 1 Koin = Rp1.000."
- Balance and account load with a skeleton; a balance error shows "Penghasilan belum bisa dimuat." + "Coba lagi".
- Format dates in `Asia/Jakarta`; all numbers are integers.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/studio/earnings/page.tsx` | Replace ComingSoon |
| CREATE | `apps/web/src/app/studio/earnings/earnings-view.tsx` (+ `.test.tsx`) | Page UI |

**Testing** (mock the lib functions):
- Balance figures, maturity date, reserved row hidden at 0.
- Ajukan disabled under Rp100.000 / without an account, with the matching hint; enabled at exactly 100.000.
- Chip switch reloads with the type; reversal row rendering; badges.
- Empty and error states for the balance, activity and payouts.
