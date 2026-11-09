# Technical Plan: US-028 — Beli Koin Checkout & Top-Up Status UI

## Architecture Overview

`PackagePicker`'s button opens `TopupSheet` (BottomSheet) with the order summary. "Lanjut ke pembayaran" calls `createTopup(packageId, idempotencyKey)` in `lib/api/wallet.ts` and then `startCheckout(redirectUrl)`.

**Checkout mode (agreed): Snap redirect.** The API returns Midtrans Snap's `redirect_url`; the browser navigates there (works in Instagram/TikTok in-app browsers, needs no Snap JS or client key in the web app). Snap's finish callback URL points back to `/wallet/topups/{orderId}`. In this story the dummy `createTopup` returns `redirectUrl = /wallet/topups/{dummyId}`.

The status page `/wallet/topups/[orderId]` is a server page (`PageHeader`, `fallbackHref="/wallet"`) around a client `TopupStatus` that polls `fetchTopup(orderId)`. Only the API's `status` decides what is shown; query params from Midtrans (`?transaction_status=…`) are ignored.

## Dependencies

None.

## Risks

- **Double submit:** one idempotency key (`crypto.randomUUID()`) per sheet opening, reused on retry; button disabled while pending.
- **Polling forever:** poll every 3 s while `PENDING`, back off to 10 s after 1 min, stop after 15 min with a "Muat ulang" button.

## Tasks

### TASK-147: Top-up confirmation sheet and checkout adapter

**`apps/web/src/lib/api/wallet.ts`** — add:
- `createTopup(packageId: string, idempotencyKey: string): Promise<CreateTopupResponse>` — `// shortcut: dummy until US-030`, returns `{ orderId: <fixed dummy pending id>, redirectUrl: '/wallet/topups/<id>' }` after a delay.
- `startCheckout(redirectUrl: string): void` — `window.location.assign(redirectUrl)` (separate function so tests can mock navigation).

**`apps/web/src/components/wallet/topup-sheet.tsx`** (`"use client"`), props `{ pkg: CoinPackage | null; onClose(): void }`, renders `BottomSheet` titled "Beli Koin":
- Badge "Mode Sandbox — tidak ada uang sungguhan" (koin-soft surface).
- Rows: "Paket" `{coins} Koin`, "Harga" `formatRupiah(priceIdr)`, "Biaya layanan" `Rp0`, divider, "Total bayar" (bold) `formatRupiah(priceIdr)` (fee is 0 by decision; the real total comes from the order on the status page).
- Note: "Koin masuk setelah pembayaran dikonfirmasi oleh sistem." and "Kebijakan pengembalian: Perlu konfirmasi."
- Primary "Lanjut ke pembayaran": `useRef` idempotency key created when the sheet opens for a package; on click set pending (button disabled, label "Memproses…"), call `createTopup`, then `startCheckout(res.redirectUrl)`. On error: inline alert with the API message (parse the shared error shape; fallback "Gagal membuat pesanan. Coba lagi.") and re-enable; retry reuses the same key.
- `WalletView`/`PackagePicker`: "Beli …" now opens the sheet for the selected package (replace the "Segera hadir" toast).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/wallet.ts` | `createTopup`, `startCheckout` |
| CREATE | `apps/web/src/components/wallet/topup-sheet.tsx` (+ test) | Confirmation sheet |
| MODIFY | `apps/web/src/components/wallet/wallet-view.tsx` | Open the sheet |

**Testing:** summary shows package, Rp0 fee and total; sandbox badge present; double click calls `createTopup` once; error shows message and retry sends the **same** idempotency key; success calls `startCheckout` with the returned URL.

---

### TASK-148: Top-up status page

**`apps/web/src/lib/api/wallet.ts`** — add `fetchTopup(orderId): Promise<TopupOrder | null>` (null = 404) — `// shortcut: dummy until US-030`: fixed dummy ids for each status (pending, under review, credited with balance, failed, expired, canceled); unknown id → null. The dummy pending order flips to CREDITED after ~3 polls so the transition is visible.

**Route** `apps/web/src/app/(public)/wallet/topups/[orderId]/page.tsx`: `PageHeader` "Status Isi Ulang" with `fallbackHref="/wallet"`, renders `<TopupStatus orderId={…} />`. Login-only by the proxy default. Validate `orderId` is a UUID before calling; otherwise render not-found state.

**`apps/web/src/components/wallet/topup-status.tsx`** (`"use client"`): polls as described above (stops on any terminal status or unmount; pauses when `document.hidden`). States:
- loading skeleton;
- `PENDING` — "Menunggu pembayaran", `{coins} Koin · {formatRupiah(totalIdr)}`, spinner, "Lanjutkan pembayaran" (link to `redirectUrl`) when present, and "Status diperbarui otomatis.";
- `UNDER_REVIEW` — "Pembayaran sedang ditinjau" + "Koin akan masuk setelah pemeriksaan selesai." (stop polling);
- `CREDITED` — success surface, "Berhasil! +{coins} Koin", "Saldo sekarang {balanceCoins} Koin", button "Kembali ke Dompet";
- `FAILED` / `EXPIRED` / `CANCELED` — "Pembayaran gagal" / "Pembayaran kedaluwarsa" / "Pembayaran dibatalkan", "Tidak ada Koin yang ditagih ke saldo.", button "Beli Koin lagi" → `/wallet`;
- null → "Pesanan tidak ditemukan." + link to Dompet;
- fetch error → keep the last known state, show a small "Gagal memperbarui. Mencoba lagi…" and keep polling.
`aria-live="polite"` on the status region.

`WalletView` pending rows (TASK-146) already link here.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/wallet.ts` | `fetchTopup` |
| CREATE | `apps/web/src/app/(public)/wallet/topups/[orderId]/page.tsx` | Route |
| CREATE | `apps/web/src/components/wallet/topup-status.tsx` (+ test) | Polling status view |

**Testing (fake timers):** each status renders its copy; PENDING → CREDITED transition stops polling; terminal states don't poll; null → not found; a fetch error keeps the last state; a `?transaction_status=settlement` search param does not change the rendered state.
