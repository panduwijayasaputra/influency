# QA Report: TASK-160 — Langganan sheet, subscribed state and renewal controls

**Result:** PASS

## Checked against the acceptance criteria

- **Profile actions:** no plan → no Langganan button (Ikuti takes the full width); guest → login links; active period → "Berlangganan" with "N hari lagi" (`daysLeft`, rounded up, never negative); otherwise the Langganan sheet (price, "30 hari", "Perpanjangan: Manual", balance).
- **Early renewal** (`SubscriptionManageSheet`): shows "Aktif sampai", "Periode berikutnya mulai" = the current end date, and the open item "Harga baru untuk perpanjangan: Perlu konfirmasi" (not presented as policy).
- **Scheduled renewal:** shows its dates and price; "Batalkan perpanjangan" asks inline ("Batalkan dan kembalikan N Koin?"), no `window.confirm`; `RENEWAL_ALREADY_STARTED` shows its message and refreshes.
- **Locked comments sheet:** Langganan CTA uses the creator's plan and is hidden when the plan is unknown (Home feed), so no per-card fetch.
- The profile page and post page read the plan/state from one server function (`getCreatorSubscription`); `DEMO_SUBSCRIPTION` / `DEMO_SUBSCRIBED` are gone.
- Copy is Bahasa Indonesia; buttons are ≥ 44px.

## Tests

`profile-actions.test.tsx` (follow, Langganan sheet, no plan, subscribed, early renewal, scheduled + cancel confirm, guest), `comments-sheet.test.tsx` (plan present / unknown), `page.test.tsx`, `format.test.ts` (`daysLeft`). `pnpm check` green.

## Notes

- The cancel button's confirm → API → Koin-returned toast is covered only up to the confirm prompt; its success path is exercised once US-038 replaces the dummy.
