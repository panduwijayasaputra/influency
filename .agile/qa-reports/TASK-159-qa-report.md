# QA Report: TASK-159 — Purchase sheet states and Unlock flow

**Result:** PASS

## Checked against the acceptance criteria

- **Unlock sheet** shows creator, caption, "Masa akses: Permanen", price, balance and the non-refundable note; the subscribed disclosure renders only when `subscribedToCreator` is set (the field itself arrives with US-037).
- **States:** insufficient balance (local and server-reported) → "Isi Koin · kurang N Koin" linking to `/wallet?returnTo=…`; confirming → disabled, `aria-busy`, spinner; error → Bahasa message, button becomes "Coba lagi", sheet stays open; `OFFER_CHANGED` → new price, asks again with a **new** key; `ALREADY_ENTITLED` is treated as success by `PostUnlockSheet`. Guests keep the existing login links with `returnTo`.
- **Double submit:** a `busy` ref blocks a second call even before React re-renders (test: two clicks → one `onConfirm`).
- **Idempotency-Key:** one per sheet opening, same on retry, new on reopen (tests).
- **Re-render without reload:** `PostCard` keeps a local copy of the post, replaces it with `GET /creators/:slug/posts/:id` after an unlock, and takes a newer server render over its copy (`router.refresh` after a subscribe). A failed refetch falls back to `router.refresh()`.
- **Dompet return:** `?returnTo` is validated with `safeReturnTo` and kept in `sessionStorage` (Midtrans drops our query string); the credited status page offers "Lanjutkan" back to it. Off-site and `//host` values are ignored; storage failures are swallowed.
- Dummy unlock toasts "Demo: …, tidak ada Koin yang terpotong." so nothing reads as a real charge.

## Tests

`purchase-sheet.test.tsx` (balance, shortfall link, disclosure, double click, key reuse, server shortfall, `OFFER_CHANGED`), `post-card.test.tsx` (unlock refetch, newer server post), `topup-status.test.tsx` (Lanjutkan), `return-after-topup.test.ts`. `pnpm check` green.

## Notes for UAT

- In the dummy phase the unlock does not actually unlock: the card refetches the real post and it is still locked. That is intended until US-036.
