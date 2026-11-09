# Feature: Purchases

**Slug:** purchases
**Handoff phase:** Phase 4 (spending Koin: atomic unlock, creator subscription, tips, revenue ledger) and the paid part of Phase 3 entitlements (handoff §6.4, archived-access rules). Feature #6 in [roadmap.md](../../roadmap.md).

## Overview

This feature lets a signed-in user spend Koin:

- **Unlock** a premium post (permanent access while the content is lawfully available)
- **Langganan** (subscribe to) a creator for 30 days, including one prepaid **early renewal** that can be cancelled before it starts
- **Kirim Tip** to a creator they already pay

Each spend is one DB transaction: wallet debit, lot spend allocation, the purchase record, the entitlement or subscription period, and the creator/platform split in a new **revenue ledger**. The post access rule then honours these paid sources.

Per the roadmap, the UI stories (US-033, US-034) come first and use dummy data from one swappable source (today `apps/web/src/lib/demo.ts`). The backend stories (US-035 to US-039) replace that data and wire their part into the UI.

## Sources

- [INFLUENCY_MONETIZATION_MVP_SPEC_v1.md](../../.docs/INFLUENCY_MONETIZATION_MVP_SPEC_v1.md) §2 (LOCKED values), §4 + §4.1 (premium, archive), §5 (subscription), §6 (tips), §7 (commission arithmetic), §11 (safeguards), §15 (acceptance tests).
- [INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md](../../.docs/INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md) §6.4 (entitlement check), §7 (ledger), §11.3 (API).
- [design/HANDOFF.md](../../../design/HANDOFF.md) business rules. Artboards (reference only): unlock / subscribe / tip sheets in [Home.dc.html](../../../design/artboards/Home.dc.html), [S14-Unlock-Insufficient.dc.html](../../../design/artboards/S14-Unlock-Insufficient.dc.html), [PostCard.dc.html](../../../design/artboards/PostCard.dc.html).

## Decisions

- **LOCKED values:** unlock 5–1,000 Koin, 20% fee, no expiry. Subscription: one plan per creator, 10–5,000 Koin, exactly 30×24h, 15% fee, manual renewal, at most one scheduled future period. Tips 1–1,000 Koin, 0% fee, no entitlement.
- **Arithmetic:** gross IDR = Koin × 1,000; platform = half-up(gross × feeBps / 10,000); creator = gross − platform. Integers only; fee bps and price are snapshotted on every transaction.
- **Revenue ledger only.** Creator earnings appear as ledger rows (pending). Maturity (14 days), the Penghasilan page and payouts are feature #9 `creator-studio`.
- **Subscription plans:** seeded for demo creators and readable publicly. The creator-facing plan editor UI is feature #9 (and the onboarding creator path, #8). This feature adds the plan model and the owner's set-price API so the rules live in one place.
- **Koleksi Saya → Dibeli** and the **Langganan** list page are feature #7 `user-area`. This feature only shows the purchased and subscribed states where the sheets open (post card, profile header).
- **Lots are spent FIFO** (oldest top-up first); each spend records its allocations.
- **No refunds of spends** except the LOCKED cancel-scheduled-renewal return. Other Controlled Refund cases come with admin/finance operations.

## Open points (rendered as "Perlu konfirmasi" where they reach the UI)

- The tip sheet layout is a design proposal ("tip sheet needs confirmation").
- Whether a new subscription price applies to existing subscribers' renewals. The spec says plan edits change future purchases only; the design still marks it as needing confirmation.
- A subscriber may also buy a post permanently, with a disclosure that they already have access via Langganan.
- Plan deactivation or creator suspension after a scheduled renewal was bought (recommended: cancel and return Koin) is deferred to admin operations.
- Tip eligibility after a refunded or taken-down purchase (recommended: no) is not reachable yet, because no spend refunds exist.

## Stories

| ID | Title | Priority |
|---|---|---|
| US-033 | Unlock & Langganan Sheets UI | high |
| US-034 | Kirim Tip Sheet UI | medium |
| US-035 | Creator Subscription Plan API | high |
| US-036 | Unlock Premium Post (Atomic Purchase & Revenue Ledger) | high |
| US-037 | Subscribe & Early Renewal | high |
| US-038 | Cancel Scheduled Renewal | medium |
| US-039 | Send Tip | medium |
