# Feature: Koin Wallet

**Slug:** koin-wallet
**Handoff phase:** Phase 4 (coin wallet: packages, ledger, lots, idempotency) and Phase 5 (Midtrans Snap Sandbox top-up). Spending Koin (unlock, subscribe, tip) is Phase 4 too, but belongs to feature #6 `purchases`. Feature #5 in [roadmap.md](../../roadmap.md).

## Overview

This feature turns the Dompet placeholder into a working wallet:

- a **Dompet page** with the Koin balance, the five **Beli Koin** packages and the wallet activity
- **Beli Koin checkout** through Midtrans Snap **Sandbox**, with a top-up status page
- the backend: packages, an append-only **Koin ledger** with **Koin lots**, top-up orders, a verified **Midtrans notification** that credits Koin exactly once, and **reconciliation** of pending orders

Per the roadmap, the UI stories (US-027, US-028) come first with dummy data from one swappable source. The backend stories (US-029 to US-032) then replace that data and wire their part into the UI.

## Sources

- [INFLUENCY_MONETIZATION_MVP_SPEC_v1.md](../../.docs/INFLUENCY_MONETIZATION_MVP_SPEC_v1.md) §2 (LOCKED values), §3 (top-up flow, wallet invariants), §11 (data model).
- [INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md](../../.docs/INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md) §7 (ledger), §8 (Midtrans lifecycle, invariants, status machine), §11.3 (API), §15.2 (payment tests).
- [design/HANDOFF.md](../../../design/HANDOFF.md): koin token, business rules. Artboard (reference only): the Wallet state in [Home.dc.html](../../../design/artboards/Home.dc.html) / [S13-Wallet.dc.html](../../../design/artboards/S13-Wallet.dc.html), and the drawer Koin card.

## Decisions

- **Packages are LOCKED:** 10 / 25 / 50 / 100 / 250 Koin at Rp10.000 / 25.000 / 50.000 / 100.000 / 250.000, no bonus Koin. They are seeded DB rows. No admin package editor in this feature (the values are locked; an editor can come with admin operations).
- **1 Koin = Rp1.000** for display ("≈ Rp…").
- **Channel fee:** none in MVP. Total due = package price. The fee field exists on the order and stays 0 (QRIS MDR may never be passed on; other fees are OPEN).
- **Credit only from the server:** a verified Midtrans notification or a status-API reconciliation. A Snap browser callback or redirect only sends the user to the status page.
- **Top-up is not creator revenue.** No revenue ledger entries here.
- **No Koin spending here.** Unlock, subscribe and tip debits (and lot spend allocations) are feature #6 `purchases`.
- **Sandbox only.** `MIDTRANS_IS_PRODUCTION=true` makes the API refuse to start.
- **Reconciliation runs in the API process** (no worker app exists yet), following the existing in-process sweeper pattern.

## Open points (rendered as "Perlu konfirmasi" where they reach the UI)

- Whether unused Koin expires (recommended: no expiry). The wallet shows no expiry and a "Perlu konfirmasi" note on the policy text.
- Refund of unused top-up Koin (Controlled Refund): request flow comes with admin/finance operations.
- Channel fees other than 0, and multiple packages in one checkout.
- Midtrans sandbox credentials and a public HTTPS tunnel for notifications are needed for the manual sandbox check; automated tests use a fake gateway and need neither.

## Stories

| ID | Title | Priority |
|---|---|---|
| US-027 | Dompet Page UI | high |
| US-028 | Beli Koin Checkout & Top-Up Status UI | high |
| US-029 | Koin Packages & Wallet Ledger API | high |
| US-030 | Create Top-Up Order (Midtrans Snap Sandbox) | high |
| US-031 | Credit Koin from Verified Midtrans Notification | high |
| US-032 | Reconcile Pending Top-Ups | high |
