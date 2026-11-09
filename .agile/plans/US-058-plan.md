# Technical Plan: US-058 — Ajukan Pencairan Sheet UI

## Architecture Overview

A `PayoutRequestSheet` (`BottomSheet`) opened from the Penghasilan "Ajukan pencairan" button, plus a "Batalkan" action on REQUESTED rows in the Pencairan list. Data goes through `lib/api/payouts.ts` (`quotePayout`, `requestPayout`, `cancelPayout`), with dummy bodies until US-063/US-064. The idempotency handling copies `PurchaseSheet`: one `Idempotency-Key` (`crypto.randomUUID()`) per sheet opening, reused on retry, double-submit guarded.

## Dependencies

- TASK-202 contract (`payoutSchema`, `PAYOUT_MIN_IDR`), `postJson` with `Idempotency-Key` in `lib/api/errors.ts`, `BottomSheet`, `useToast`.

## Risks

- **A fee shown differs from the fee charged** (config change between quote and request). Mitigation: the request sends `expectedFeeIdr`. The API rejects `PAYOUT_FEE_CHANGED`; the sheet then refetches the quote and asks again.

## Tasks

### TASK-206: Payout request sheet + cancel

**Shared (`payouts.ts`):**
- `payoutQuoteQuerySchema = z.object({ amountIdr: z.coerce.number().int().min(PAYOUT_MIN_IDR) })`.
- `payoutQuoteSchema = z.object({ amountIdr, feeIdr, netIdr: int, feeIsPlaceholder: z.boolean(), availableIdr: int, destination: payoutDestinationSchema })`.
- `createPayoutSchema = z.object({ amountIdr: z.number().int().min(PAYOUT_MIN_IDR), expectedFeeIdr: z.number().int().nonnegative() }).strict()`.
- **Errors in `errors.ts`:**
  - `PAYOUT_EXCEEDS_AVAILABLE` (409, "Jumlah melebihi saldo tersedia.")
  - `PAYOUT_FEE_CHANGED` (409, "Biaya transfer berubah. Periksa lagi sebelum mengajukan.")
  - `PAYOUT_ACCOUNT_REQUIRED` (409, "Tambahkan rekening pencairan aktif dulu.")
  - `PAYOUT_NOT_CANCELABLE` (409, "Pencairan ini sudah tidak bisa dibatalkan.")

**`lib/api/payouts.ts`** (`// dummy until US-063` / `US-064`):
- `quotePayout(amountIdr)` → fee 2.500 (flagged placeholder), net = amount − fee, the active dummy account, availableIdr from the earnings dummy.
- `requestPayout(input, idempotencyKey)` → creates a REQUESTED payout in the module dummy list and lowers the dummy available balance (shares state with `earnings.ts`; expose a small shared dummy store module `lib/api/studio-dummy-store.ts` deleted by US-064).
- `cancelPayout(id)` → CANCELED and restores the balance; throws `PAYOUT_NOT_CANCELABLE` when not REQUESTED.

**`apps/web/src/app/studio/earnings/payout-request-sheet.tsx` (`'use client'`):**
- **Props:** `{ open, onOpenChange, availableIdr, onRequested(payout) }`.
- **Amount input:** rupiah, numeric only, shown with thousands separators. Default = `availableIdr`, with a "Semua" chip.
- **Local validation:**
  - < `PAYOUT_MIN_IDR` → "Minimal pencairan Rp100.000."
  - > available → "Melebihi saldo tersedia {formatIdr(available)}."
- **Quote:** a valid amount debounced 300 ms → `quotePayout`. Show rows "Biaya transfer {formatIdr(fee)}" (+ a "Perlu konfirmasi" pill when `feeIsPlaceholder`), "Kamu terima {formatIdr(net)}" (bold), and "Ke {bankName} •••• {last4} · a.n. {holder}". If net ≤ 0, block with "Jumlah terlalu kecil setelah biaya transfer."
- **Note:** "Diproses manual setiap Jumat hari kerja. Waktu masuk ke rekening tidak dijamin."
- **"Ajukan pencairan" button:** disabled while invalid, quoting or pending. It calls `requestPayout({ amountIdr, expectedFeeIdr: quote.feeIdr }, key)`, where `key` is created on open and kept across retries.
  - Success → close, toast "Pencairan diajukan", `onRequested`.
  - `PAYOUT_FEE_CHANGED` / `PAYOUT_EXCEEDS_AVAILABLE` → show the message, refetch the quote, and generate a **new** key (the payload changes).
  - Other errors → inline message, sheet stays open.
- **`earnings-view.tsx`:**
  - Wire the button to open the sheet. `onRequested` reloads the balance and payouts.
  - In the Pencairan list, REQUESTED rows get a "Batalkan" button → a confirm `BottomSheet` "Batalkan pencairan?" with the text "Saldo {amount} kembali tersedia." and buttons "Ya, batalkan" / "Tidak". On confirm → `cancelPayout` → toast "Pencairan dibatalkan", then reload the balance and list. `PAYOUT_NOT_CANCELABLE` → toast + reload.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/payouts.ts` (+ test), `errors.ts` | Quote/create schemas, error codes |
| MODIFY | `apps/web/src/lib/api/payouts.ts` (+ test), `earnings.ts` | Dummy quote/request/cancel sharing one store |
| CREATE | `apps/web/src/lib/api/studio-dummy-store.ts` | Shared dummy balance/payout state (removed in US-064) |
| CREATE | `apps/web/src/app/studio/earnings/payout-request-sheet.tsx` (+ `.test.tsx`) | Sheet |
| MODIFY | `apps/web/src/app/studio/earnings/earnings-view.tsx` (+ test) | Open sheet, cancel action |

**Testing:**
- Defaults to the full balance; "Semua" resets it.
- Min/over-balance errors block the button; the quote rows render with the placeholder pill.
- Double click sends one request; a retry after a network error reuses the same key; `PAYOUT_FEE_CHANGED` refetches and uses a new key.
- Success closes and toasts.
- Cancel: the confirm sheet, the call, the toast; Tidak doesn't call.
