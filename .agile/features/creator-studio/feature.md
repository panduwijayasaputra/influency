# Feature: Creator Studio

**Slug:** creator-studio
**Handoff phase:** Phase 3 (creator posts: draft/edit/publish, pricing) for the post form and Edit Profil, and Phase 6 (creator earnings dashboard, manual payout request) for Penghasilan and Rekening Pencairan. Feature #9 in [roadmap.md](../../roadmap.md).

## Overview

The tools only an approved creator sees:

1. **Post Baru / Edit post:** one screen with media (max 5, ordered, the first is the cover), caption, Gratis/Premium and price. It opens from "Post Baru" on the creator's own profile and from "Edit" in a post's menu.
2. **Edit Profil:** cover, avatar, name, bio and subscription price. The `influency.com/{slug}` address is read-only.
3. **Penghasilan:** pending, available and reserved earnings, payout account, activity history (Semua/Langganan/Unlock/Tip) and payout history.
4. **Rekening Pencairan:** up to 3 bank accounts, exactly one active.
5. **Ajukan pencairan:** a creator requests a payout from available earnings. The transfer fee and the net amount are shown before confirming.

Per the roadmap, UI stories (US-054 to US-058) come first. The post form and Edit Profil already have APIs. Penghasilan, Rekening Pencairan and Ajukan pencairan use one swappable dummy data source. The backend stories (US-059 to US-064) replace it.

## Sources

- Artboard (reference only): [Home.dc.html](../../../design/artboards/Home.dc.html), states `editor` (New/Edit post), `profEd` (Edit profile), `earnings` and `accounts`.
- Design handoff business rules: max 5 media per post; premium price 5–1,000 Koin; subscription 10–5,000 Koin per 30 days; payout accounts max 3, exactly one active, the active one can't be deleted.
- Monetization spec §8 (LOCKED): earnings in IDR; 14 days pending from the purchase/tip, or from a subscription period's start; stages `PENDING → AVAILABLE → RESERVED_FOR_PAYOUT → PAID_OUT`; minimum withdrawal Rp100,000; reservation is atomic at request time; actual transfer cost is borne by the creator and shown before confirmation; manual processing on Fridays that are business days. Fees: 20% unlock, 15% subscription, 0% tips.
- Existing APIs reused: `creators/me/posts` (+ media, cover, offer, publish, archive), `PATCH /creators/me`, `PUT /creators/me/:kind`, `GET/PUT /creators/me/subscription-plan`, `revenue_ledger_entries` (US-036, with `accruesAt`).

## Decisions

- **Payouts stop at the creator side.** A creator can request and cancel a payout. Admin approval, rejection, marking a payout paid with a transfer reference, and reconciliation belong to the later admin/finance feature. Requested payouts stay `REQUESTED` until then.
- **The slug is read-only in Edit Profil.** It is shown with a copy button, so links already in bios keep working.
- **No account verification flow in this feature.** Spec §8 has the admin verify the bank details when processing a payout. Changing the active account is free; a payout snapshots its destination account at request time.
- **The full account number is write-only.** After saving, APIs and UI only show the bank and the last 4 digits.
- **The minimum withdrawal is measured before the transfer fee** (spec §8 recommendation; still OPEN).
- **Outstanding-adjustment offsets and dispute holds are out of scope.** There are no adjustments yet; the balance model leaves room for them (admin/finance feature).
- Live posts keep the existing editing rules (`isPostEditable`): an offer price change applies to future purchases only.
- Design copy is English; the UI uses Bahasa Indonesia.

## Open points (rendered as "Perlu konfirmasi")

- The actual transfer fee amount. It is a configurable placeholder value labelled "Perlu konfirmasi", never presented as final.
- The payout SLA and holiday calendar (the UI states "diproses manual setiap Jumat hari kerja").
- Bank list beyond the design's examples (configurable list).

## Stories

| ID | Title | Priority |
|---|---|---|
| US-054 | Post Baru / Edit Post Form UI | high |
| US-055 | Edit Profil UI | high |
| US-056 | Penghasilan Page UI | high |
| US-057 | Rekening Pencairan Page UI | medium |
| US-058 | Ajukan Pencairan Sheet UI | medium |
| US-059 | Post Media Order & 5-Item Limit API | medium |
| US-060 | Earnings Balance API | high |
| US-061 | Earnings Activity API | high |
| US-062 | Payout Accounts API | high |
| US-063 | Request Payout (Quote & Atomic Reservation) | high |
| US-064 | Payout History & Cancel Request | medium |
