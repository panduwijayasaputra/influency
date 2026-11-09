# US-061: Unlock, Subscribe & Tip Sheets

**Status:** backlog
**Priority:** medium
**Feature:** mobile-first-ui

## Description

As a viewer, I want clear bottom sheets to unlock a post, subscribe to a creator or send a tip, so that I know exactly what I pay in Koin and what I get.

## Acceptance Criteria

- [ ] **Unlock sheet** ("Buka post ini"):
  - It shows the price in Koin and the user's balance.
  - The button reads "Buka dengan X Koin".
  - It states that the purchase is one-time, does not expire and stays in Koleksi Saya while the post is available.
- [ ] **Subscribe sheet**:
  - It shows the plan: 30 hari · perpanjangan manual · X Koin.
  - It states that the subscription unlocks the creator's eligible premium posts and their comments for 30 days.
  - It states that there is no auto-renewal and that one early renewal can be prepaid and cancelled for a full Koin refund before it starts.
- [ ] **Tip sheet** ("Kirim Tip"):
  - It offers preset amounts plus a custom amount, from 1 to 1.000 Koin, with validation.
  - It states that a tip unlocks nothing and that Influency takes no fee.
  - It opens only where tip eligibility holds (US-056), never for the viewer's own content.
- [ ] **Insufficient balance.** When the balance is too low, every sheet shows "Kamu butuh X Koin lagi" with a **Beli Koin** link to `/wallet` instead of the pay button. Guests see "Masuk untuk …" linking to Login with `returnTo`.
- [ ] **Demo state.** Until purchase, subscription and tip backends exist, the confirm buttons end in a clearly marked Demo message and never show a fake success, debit or unlock. Prices come from server data, or from dummy data that respects the 5–1.000 / 10–5.000 / 1–1.000 bounds.
