# US-033: Unlock & Langganan Sheets UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** purchases

## Description

As a signed-in user, I want clear Unlock and Langganan sheets that show the price, what I get and my balance, and that tell me what happened after I pay, so that I can spend Koin confidently and never pay twice by accident.

## Acceptance Criteria

- [x] **Unlock sheet** (post card, post detail, locked comments sheet, media viewer): shows the creator, caption, "Masa akses: Permanen", price, current balance and the non-refundable note. If the viewer has an active subscription to that creator, it also says the post is already accessible via Langganan and that buying keeps access after the subscription ends.
- [x] **Langganan sheet** (profile header): shows the plan price, "30 hari", "Perpanjangan: Manual" and the balance. When subscribed, the profile button reads "Berlangganan" with "x hari lagi" beneath. The sheet then offers **Perpanjang lebih awal** (showing that the next period starts at the current end date) or, when a renewal is already scheduled, its dates and **Batalkan perpanjangan** with the full-Koin-return note. A creator without a plan shows no Langganan button.
- [x] **States** for both sheets:
  - insufficient balance → "Isi Koin · kurang N Koin", linking to Dompet and returning to the same post or profile
  - confirming → button disabled with a spinner (no double submit)
  - success → the sheet closes, a toast shows, and the post or profile re-renders as unlocked or subscribed without a full reload
  - error → a message in Bahasa Indonesia with retry; the sheet stays open
  - guest → tapping Unlock or Langganan goes to Login with `returnTo`
- [x] Each sheet opening generates one `Idempotency-Key` and reuses it on retry.
- [x] Until US-035 to US-038 land, plans, subscription state and purchase results come from one dummy source (`lib/demo.ts`), and nothing is presented as a real charge ("Demo" toast). Component tests cover each state. Touch targets are ≥ 44px and copy is in Bahasa Indonesia.

## Tasks

### TASK-158: Purchases contract and dummy client
**Status:** done

### TASK-159: Purchase sheet states and Unlock flow
**Status:** done

### TASK-160: Langganan sheet, subscribed state and renewal controls
**Status:** done
