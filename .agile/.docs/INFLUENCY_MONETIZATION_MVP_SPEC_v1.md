# INFLUENCY — MONETIZATION & FINANCIAL SAFEGUARDS MVP

**Version:** 1.0 (decision consolidation)  
**Date:** 2026-11-03  
**Scope:** Creator monetization, Koin wallet, purchases, subscriptions, tips, refunds, chargebacks, earnings, payouts, and related entitlement controls.  
**Status legend:** **LOCKED** = decided by product owner; **RECOMMENDED** = implementation/operational recommendation, not yet product-approved; **OPEN** = requires decision or verification; **GO-LIVE BLOCKER** = must be resolved before real-money production.

> This spec supplements the Influency product and video-infrastructure documents. It is not a legal opinion, an approved gateway contract, or a full implementation. Do not silently interpret RECOMMENDED or OPEN as LOCKED.

## 1. Product positioning and architectural boundaries

- **LOCKED:** Influency is a standalone **web-first** platform with creator profile URLs and public discovery/free previews. User authentication is required for paid interactions.
- **LOCKED:** Telegram is for login (official OIDC/PKCE) and opt-in notifications via the single Influency bot; neither Telegram Mini App nor Telegram Stars is the primary checkout or monetization rail.
- **LOCKED:** Subscribers buy prepaid Koin through an external payment gateway on the Influency website, then spend Koin on premium-post unlocks, creator subscriptions, and eligible tips.
- **LOCKED:** Influency receives consumer payments. Creators do not receive top-up payments directly; creator payable and bank withdrawal are separate flows.
- **RECOMMENDED:** TypeScript, Next.js, NestJS, PostgreSQL/Prisma, Redis/BullMQ, gateway abstraction, and media-provider abstraction. Payment gateway sandbox candidate: Midtrans; final contractual/provider production approval remains OPEN.

## 2. Full locked product decision matrix

| Area | Rule | Status |
|---|---|---|
| Koin reference value | 1 Koin = Rp1,000; whole-number Koin for charges | LOCKED |
| Top-up packages | 10 / 25 / 50 / 100 / 250 Koin, charged Rp10,000 / Rp25,000 / Rp50,000 / Rp100,000 / Rp250,000 before any lawful channel fee | LOCKED |
| Top-up bonus | No bonus Koin in MVP | LOCKED |
| Gateway fee | Separately charged to the buyer **only where permitted by law and the specific payment rail/provider**. Otherwise Influency bears it | LOCKED |
| Content formats | Images and videos | LOCKED |
| Content classes | Free and premium | LOCKED |
| Premium unlock | Price per post, from 5 to 1,000 Koin inclusive; individually purchased access has no time expiry while content lawfully available | LOCKED |
| Premium commission | Influency 20%; creator 80% | LOCKED |
| Subscription package | Exactly one offered package per creator; creator controls price | LOCKED |
| Subscription price | 10–5,000 Koin inclusive | LOCKED |
| Subscription duration | Exactly 30 days, not calendar-month semantics | LOCKED |
| Subscription benefit | Access to all eligible premium posts of that creator while the period is active, including newly published premium posts | LOCKED |
| Subscription commission | Influency 15%; creator 85% | LOCKED |
| Renewal | Manual; never automatic Koin debit/auto top-up | LOCKED |
| Early renewal | Allowed anytime while currently active; prepaid next period begins when prior period ends, no overlap | LOCKED |
| Scheduled renewal count | Maximum one scheduled future period per user–creator pair | LOCKED |
| Tips | 1–1,000 Koin per tip transaction; Influency fee 0%, creator share 100% | LOCKED |
| Tips eligibility | For that creator: active subscription OR valid individual premium-post purchase. Profile tip offered if eligible; post tip offered on eligible premium content the user can access | LOCKED |
| Tips entitlement | Tips do not grant or extend premium/subscription access | LOCKED |
| Engagement | Likes and comments for posts; detailed visibility/permission rules remain OPEN | LOCKED for feature existence |
| Archiving purchased content | Archived posts leave public listings and new sales; prior individual buyers keep indefinite access from My Purchases, subject to lawful takedown | LOCKED |
| Archived content for subscribers | Only subscribers ACTIVE at the moment of archival retain access until end of the subscription period then active; new subscribers and later renewals do not inherit this archived grant | LOCKED |
| Controlled Refund | Transaction errors/service failures eligible; scheduled renewal canceled before beginning => full Koin return; unspent top-up may be requested for IDR refund subject to review | LOCKED |
| Creator earnings currency | IDR, not transferable subscriber Koin | LOCKED |
| Earnings pending | 14 days; for prepaid scheduled renewal, start 14-day clock when future period starts (and after relevant settlement checks) | LOCKED |
| Minimum withdrawal | Rp100,000 in available earnings | LOCKED |
| Payout | Creator-initiated, admin-verified manual process on Fridays that are business days; when Friday is a holiday, next business day; bank receipt timing not guaranteed | LOCKED |
| Payout transfer fee | Actual bank/disbursement cost borne by creator, displayed before confirmation, no markup | LOCKED |
| Chargeback liability | Risk-based: Influency bears payment fraud not attributable to creator; creator liable for substantiated creator-caused service failure, proven fraud/collusion, etc. | LOCKED |
| Corrections after prior payout | Maintain outstanding adjustment; never directly debit creator bank account | LOCKED |
| Final future earnings recovery | Offset up to 100% of **newly matured eligible** earnings toward finally established creator-responsible outstanding balance, until repaid | LOCKED |
| Appeal | Creator has 7 calendar days from notice to appeal; disputed liability not final until expiry of appeal window or review resolution; creator notified with case details | LOCKED |

## 3. User wallet and top-up

### 3.1 Top-up flow

1. Authenticated user selects exactly one of five locked packages.
2. Server generates a payment order with stable `orderId`, `coins`, `baseIdr`, eligible channel fee, total due, and payment method; do not trust client price.
3. Gateway returns checkout session. UI shows price, permitted fees, and total due before payment.
4. Backend verifies gateway-signed callback and/or official gateway status. A paid/settled event is mapped to a unique payment transaction. Duplicate events or racing requests cannot double-credit.
5. An atomic database transaction creates coin-lot, coin-ledger credit, wallet balance update, and payment state change. A failed transaction leaves no partial coin credit.
6. Reconciliation worker retries unknown gateway statuses and records discrepancies for finance review.

**Payment-rail rule:** For QRIS, BI states merchant MDR must be borne by merchant and not passed to the consumer. Other channel fees must be permitted by the provider, acquirer and regulations; they are not assumed universally surchargeable. The actual merchant category and MDR must be verified before go-live.

### 3.2 Wallet invariants

- Integers only for Koin and IDR; no floating-point money.
- Never allow negative spendable wallet balance.
- `coin_wallet` is a projection of append-only `coin_ledger`; every visible coin originates in a supported credit/reversal entry.
- Track `coin_lots` per top-up and `coin_spend_allocations` per purchase to trace chargebacks and partial refunds.
- Consumer Koin is not freely transferable to other users and is not freely cash-outable; legally required refunds are separate.
- **OPEN:** Whether unused Koin has no expiry. Recommended: no arbitrary expiry at MVP; obtain regulatory review.
- **OPEN:** Exact account closure/abandoned balance treatment.
- **OPEN:** Whether multiple top-ups can be paid in one cart. Existing 250-Koin maximum means a 5,000-Koin subscription would otherwise need twenty purchases (see audit).

## 4. Premium post and entitlement rules

- Premium price bounds `5 <= priceCoins <= 1000`; fee 20%; price snapshot saved at purchase.
- A successful individual premium purchase atomically debits Koin, creates `post_purchase` and non-expiring `content_entitlement`, and posts creator/platform ledger shares.
- Repeated clicks or duplicate purchase requests do not charge twice; server returns existing entitlement.
- Active subscriber can access eligible premium post without an individual purchase. A subscriber may also purchase permanent access separately, with clear UI disclosure before payment.
- Purchase remains valid after subscription expires and after creator archives the post.
- Archive is not a hard delete: no new sales/public discovery, but previously purchased media remains privately available through the buyer library.
- Legal/policy takedown can supersede entitlements; handling of associated refund/compensation must follow Controlled Refund and legal obligations.
- **RECOMMENDED:** One price per post unlocks every media item in it; detailed media-per-post limits and comment visibility are still OPEN.
- **RECOMMENDED:** Existing paid post media should not be materially replaced silently after sale; media versioning/notifications or an explicit editing constraint should be chosen.

### 4.1 Archived access edge cases

For each archive episode at timestamp `archivedAt`:
- Individual buyer's access is based on non-expiring purchase entitlement.
- Subscription archival grant applies if `subscriptionPeriod.startsAt <= archivedAt < subscriptionPeriod.endsAt`, and the grant expires at that exact `endsAt`.
- Scheduled (future) renewal does NOT qualify merely because it was already paid.
- Subscription periods bought later never extend grant.
- User subscribing after archive sees no archived post.
- If creator republishes post, normal current subscription access resumes; if creator rearchives, create a fresh archive episode and re-evaluate eligible periods.
- This can be implemented via immutable archive event + indexed temporal entitlement check, or durable snapshot grants. Avoid a giant synchronous write in the request if creator has many subscribers; correctness must still hold immediately.
- A user with an individual purchase keeps access even when an overlapping subscription expires.

## 5. Creator subscription

- Exactly one active plan row per creator; price integer 10–5,000 Koin, term 30×24h.
- At signup, debit Koin and create an active `subscription_period` with `[startsAt, endsAt)` UTC interval.
- At early renewal, debit Koin at confirmation and create one future `SCHEDULED` period whose `startsAt` is the previous period's `endsAt`. A second schedule is forbidden while one already exists.
- If a renewal is purchased after expiry, create an active period starting at paid confirmation, subject to race-safe locking.
- Creator plan edits change only future purchases; snapshot `priceCoins`, `durationDays=30`, `feeBps=1500` and creator ID per paid period.
- Future renewal start should be derived from stored period boundaries; no repeat payment or auto-debit occurs at activation.
- Scheduled renewal may be canceled BEFORE `startsAt`, returning 100% of its spent Koin exactly once and canceling its unstarted period. Current active period remains unchanged.
- Reserve/prepaid-future-service accounting is separate from creator earnings maturity. For scheduled renewal, 14-day pending clock starts at `startsAt`, not purchase time.
- **RECOMMENDED:** At the activation instant, either a scheduled job or on-demand effective-state calculation activates scheduled period; timestamps, not a possibly stale `status` cache, govern entitlement. The cancellation and activation race must be serialized.
- **OPEN:** Treatment if creator suspends account/terminates offering after queued renewal was bought; recommended to cancel unstarted obligation and return Koin, with legal and risk exceptions.

## 6. Tips

- Allowed only when user is entitled to support a particular creator, defined by active subscription to that creator OR at least one valid individual paid premium post purchase from that creator.
- On creator profile, tip control visible to eligible users. On a premium post, control requires access to that premium post; tips not shown on free posts per latest intent.
- Server repeats eligibility check at payment commit time; disabled UI is never security control.
- Price integer 1–1,000 Koin per tip; no new entitlement or subscription extension.
- Exact creator earnings = `tipsCoins * 1000` IDR; platform commission = 0. Gateway/payout actual costs remain separately accounted.
- **RECOMMENDED:** Block self-tipping, obvious controlled-account tipping, rapid repeated microtransactions, and suspicious structured tipping, with manual review controls.
- **OPEN:** Whether paid eligibility persists when the purchase was fully refunded or taken down: recommended `no` when no other valid entitlement remains.

## 7. Commission and money arithmetic

Use integer IDR and basis points (`premium=2000`, `subscription=1500`, `tips=0`):

```
transactionGrossIdr = paidCoins * 1000
platformCommissionIdr = deterministicRound(transactionGrossIdr * feeBps / 10000)
creatorEarningIdr = transactionGrossIdr - platformCommissionIdr
```

Given full-Koin minimums and Rp1,000 nominal value, these agreed percentages ordinarily yield integer rupiah. Still specify deterministic rounding (e.g. half-up) before changing Koin denomination or fee rates. Persist the actual integer amounts and fee snapshots on each transaction. `creatorEarningIdr + platformCommissionIdr == transactionGrossIdr` always.

Examples:
- 25-Koin premium: gross Rp25,000; fee Rp5,000; creator Rp20,000.
- 75-Koin subscription: gross Rp75,000; fee Rp11,250; creator Rp63,750.
- 20-Koin tip: gross Rp20,000; fee Rp0; creator Rp20,000.

**Important:** Top-up is receipt against prepaid-user-balance obligation, NOT automatically realized platform commission/revenue. Future subscription periods require separate unfulfilled-obligation treatment; recognition of platform and creator revenue over a 30-day service period should be validated with a qualified accountant. `pending/available` payout status is not necessarily the same as statutory financial statement revenue recognition.

## 8. Creator earnings maturity and payouts

- Creator shares are recorded in IDR, with raw posting event, period, amount, source Koin allocations, and a maturing eligibility date.
- Pending period: 14 days from successful premium purchase/tip, or subscription period start, contingent on relevant gateway settlement and risk holds.
- Stages: `PENDING`, `AVAILABLE`, `RESERVED_FOR_PAYOUT`, `PAID_OUT` (with compensating adjustment entries and separate dispute holds as needed).
- At maturity, resolve any finalized creator-responsible outstanding adjustments up to 100% of newly matured eligible funds, then transfer remaining net amount to `AVAILABLE`.
- Creator can request withdrawal when available >= Rp100,000; reserve amount atomically at request time. Display actual provider/bank transfer cost and net receive amount before confirmation.
- Admin verifies identity/bank/risks and processes on Friday business days (or next business day after Friday holiday); mark `PAID_OUT` only once success confirmed through bank/provider reconciliation.
- Failed/pending transfer must be safely retried/reconciled before release of funds; prevent double-disbursement.
- No direct creator bank-account debits for adjustments.
- **RECOMMENDED:** For a large manual adjustment or payout, enforce maker/checker roles and audit logs. Threshold remains OPEN.
- **OPEN:** Accounting treatment of transfer-fee taxes and whether min withdrawal is measured before or after transfer cost; recommended threshold is amount debited from available earnings before transfer cost.

## 9. Refund policy (Controlled Refund)

**LOCKED:**
- Transaction error, unauthorized operation, platform/service failure: eligible for refund/remedy review.
- A future scheduled renewal can be canceled before its period begins; full purchase Koin returned exactly once, scheduled period canceled; no change to current subscription.
- Unused top-up Koin may be submitted for IDR refund review (not an unconditional instant cash-out).
- A consumed/partially consumed top-up cannot be reflexively refunded in full.
- Ordinary successful premium purchase, active subscription, or completed tips do not receive automatic change-of-mind refunds, subject to legal rights.
- Archive retaining legitimate buyer access does not itself trigger refund.

**Implementation:**
- Distinguish user-wallet Koin refunds from gateway IDR refunds; do not grant both unless case expressly and correctly resolves both.
- Cancel/reverse entitlements only if no other valid access path independently exists.
- Use immutable original transaction + linked compensating entries; cases have unique adjustment keys, status machine, and audit trail.
- Refund top-ups only against unspent/non-disputed lot amounts, after verification; if complex spent allocations exist, route to special finance review.
- **OPEN:** Detailed refund SLA, user evidence policy, handling partial failures, taxes and gateway refund fees.

## 10. Chargeback, liability, appeals, and offset

- Chargeback/dispute on a top-up may involve coins spent across multiple creators. Trace `coin_lots -> coin_spend_allocations -> monetization_transactions -> creator earnings`.
- On reported dispute, flag source lot, investigate, freeze only affected wallet funds and apply proportional temporary holds to affected unsettled earnings; no presumption creator guilt.
- Risk-based final classification: platform absorbs ordinary unauthorized payment fraud when creator was not responsible; creator is liable only for substantiated creator-caused failure/fraud/collusion as contractually defined and legally allowed.
- Creator receives a decision notice (case reference, evidence summary, applicable rule, proposed amount) and **7 calendar days** to appeal. If timely appeal, complete fair review before any final recovery offset. Avoid using the same operator as sole investigator/reviewer where feasible.
- Following final creator-responsible liability and settlement conditions, append an adjustment. If earnings already paid out, represent unrecovered amount as outstanding recovery, never by silently editing historic payout or debiting creator's bank.
- Apply up to **100% of future matured eligible** earnings to final outstanding balance until zero, with separate offset ledger entries. Never recover more than outstanding or duplicate recoveries through payment refund, internal holds, bank clawback, etc.
- If final decision overturned, reverse pending adjustments and restore amounts recovered (with audit entries).
- **OPEN:** Exact clock start/end semantics for appeal notices delivered across time zones and how delivery failure is handled; recommended timestamped delivery + 7×24h, with consumer/creator notice transparency and applicable law taking priority.

## 11. Financial and transactional security safeguards

1. Gateway webhook HTTPS, signature check, amount matching, source idempotency, status verification, and async reconciliation. Never credit Koin based on browser redirect success alone.
2. Every Koin debit and its entitlement/period/tip record and earnings ledger posting are atomic in PostgreSQL.
3. Unique `(userId, postId)` effective purchase or unique entitlement key prevents duplicate premium charges. No negative spendable wallet.
4. Lock wallet and scheduled renewal count under concurrency (DB row-lock/advisory lock/serializable transaction with retries as appropriate).
5. Every money event has immutable transaction ID, logical idempotency key, lineage to source payment / coin lot, actor, createdAt UTC, and old/new state when mutable state changes.
6. No finance operator manually edits balances directly. All changes are authorized journal entries with reason, case ID and audit log.
7. Role-scoped finance permissions; separate creator payout submission from administrator approval.
8. Reconcile daily: gateway receipts and settled cash; coin-lot issuance/spending/refunds; wallet ledger totals; revenue creator/platform splits; payout reserve vs bank settlement. Alert on exceptions and halt affected payments, not entire unrelated platform unless necessary.
9. Retain data in accordance with privacy, financial record, consumer protection and tax rules; exact periods are OPEN pending counsel.
10. Rate limiting, anti-fraud checks, suspicious high-volume tips, high-value plans, rapid top-up/refund patterns, velocity of payouts, device/account risk review, and secure credential management.

## 12. Suggested minimal schema (conceptual, not final Prisma)

| Entity | Important keys/fields |
|---|---|
| `users` / `creator_profiles` | userId, creatorId, verified status |
| `coin_packages` | packageId, coins, baseIdr, active |
| `payment_transactions` | paymentId, orderId unique, userId, packageId, method, baseIdr, channelFeeIdr, totalIdr, providerStatus, settledAt |
| `coin_wallets` | userId unique, availableCoins, rowVersion |
| `coin_lots` | lotId, originalPaymentId unique, issuedCoins, unspentCoins, refundStatus |
| `coin_ledger` | entryId, userId, type, deltaCoins, referenceId, idempotencyKey unique |
| `coin_spend_allocations` | transactionId, lotId, allocatedCoins |
| `posts` | postId, creatorId, accessType, priceCoins, publicationStatus |
| `media_assets` | assetId, postId or independent media library mapping, processing state, visibility |
| `post_purchases` | purchaseId, buyerId, postId, priceSnapshotCoins, unique buyer/post effective purchase |
| `content_entitlements` | buyerId, postId, sourcePurchaseId, expiresAt null for individual unlock |
| `creator_subscription_plans` | creatorId unique, priceCoins, durationDays=30, active |
| `subscription_periods` | periodId, buyerId, creatorId, planSnapshot, start/end UTC, purchasedAt, periodStatus, sourceTransactionId |
| `post_archive_events` | postId, archiveEpisodeId, archivedAt, restoredAt |
| `archived_access_grants` | episodeId, periodId, buyerId, postId, expiresAt (if using materialized design) |
| `tips` | tipId, userId, creatorId, postId nullable, amountCoins, transactionId |
| `monetization_transactions` | txId, type, payer, payee, grossCoins, grossIdr, feeBps, platformIdr, creatorIdr |
| `revenue_ledger` | entryId, creatorId nullable, amountIdr signed, account, sourceTxId, adjustmentCaseId |
| `creator_earnings_projections` | creatorId, pendingIdr, availableIdr, reservedIdr, recoveryOutstandingIdr |
| `creator_payouts` | payoutId, creatorId, requestedIdr, transferFeeIdr, status, providerReference, approvalActor |
| `refund_cases` | caseId, userId, sourceTxId, reason, outcome, refundType, adjustmentIds |
| `payment_disputes` | disputeId, paymentId, status, evidence, liabilityDecision |
| `creator_appeals` | appealId, caseId, notifiedAt, submittedAt, outcome, reviewedBy |
| `financial_adjustments` | adjustmentId, sourceCaseId, creatorId, amountIdr, kind, recoveredIdr |
| `financial_audit_logs` | actorId, action, entityRef, immutable event payload, time |

Keep journal/ledger canonical. Projection tables can be rebuilt. A high-integrity double-entry ledger for IDR is **RECOMMENDED** beyond simple separate per-feature tables.

## 13. Backend module/API outline

```
AuthModule
CreatorModule
PostModule
MediaModule
CoinWalletModule
PaymentGatewayModule (provider adapter, verify webhook)
MonetizationModule (purchase/tips)
SubscriptionModule (plan, period, cancel schedule)
EntitlementModule (premium access + archive episode)
RevenueLedgerModule
CreatorPayoutModule
RefundModule
DisputeAndAppealsModule
FinancialReconciliationModule
FinancialAdminModule
```

Candidate routes (names still **RECOMMENDED**):
- `GET /v1/coin-packages`, `POST /v1/topups`, `GET /v1/wallet`
- `POST /v1/gateway/midtrans/webhook` (provider-signed, idempotent)
- `POST /v1/posts/:id/purchase`, `GET /v1/me/purchases`
- `GET/PUT /v1/creators/:id/subscription-plan`, `POST /v1/creators/:id/subscribe`, `POST /v1/subscription-periods/:id/cancel-scheduled`
- `POST /v1/creators/:id/tips`, `POST /v1/posts/:id/tips`
- `GET /v1/me/earnings`, `POST /v1/me/payouts`, `GET /v1/me/payouts`
- `POST /v1/refund-cases`, `POST /v1/creator-appeals`
- `GET /v1/admin/finance/reconciliation`, finance approval/adjustment routes with role checks

Always compute price and entitlement server-side; include stable idempotency keys for chargeable endpoints.

## 14. Consistency audit — findings and disposition

| Audit item | Finding | Action | Status |
|---|---|---|---|
| One subscription package vs prior three | Prior decision superseded; only one 30-day creator plan remains | No multiple plan/tier implementation | RESOLVED |
| Scheduled period billing vs earnings hold | Early payment doesn't mean service has begun | Deferred period obligation + 14-day clock at period start | RESOLVED |
| Archive + early renewal | New period must not inherit archived access grant from old period | Anchor to archivedAt and periodId; renewal not carried over | RESOLVED |
| Permanent unlock + archive | Need private buyer library even after public removal | Keep media and entitlement; legal takedown exception | RESOLVED |
| Tips 0% + gateway costs | Gross tip goes creator; platform may bear cost for QRIS | Account for merchant fee and operational losses separately | RESOLVED / MONITOR |
| Payment fraud + innocent creators | Across multiple creators one top-up reversal shouldn't automatically penalize all | Risk-based liability; proportional holds and source tracing | RESOLVED |
| 7-day appeal + final offset | Cannot offset while timely appeal pending | Wait for appeal expiry/final determination; offset matured earnings only | RESOLVED |
| Top-up max 250 vs subscription max 5,000 | User may require 20 top-ups with repeated checkout/fees | Allow accumulating balances, but resolve UX/risk before launch | OPEN PRODUCT GAP |
| Coin lot refund vs partly spent funds | Partly spent topup can't auto-refund full IDR | Trace lots; review special cases; avoid double return | RESOLVED policy / DETAILS OPEN |
| Large paid-post edit | Buying a post and later changing file can undermine original purchase | Version or constrain material edits | OPEN |
| Subscription plan deactivation after scheduled purchase | Paid future service may become unavailable | Propose cancel+Koin refund or guarantee service | OPEN |
| Engagement rights | Likes/comments exist but viewer rules not locked | Clarify free/premium comments, moderation, visibility | OPEN |
| Coin expiry/account shutdown | No-expiry not explicitly locked | Set fair ledger/closure approach | OPEN |
| Tax & regulatory approvals | Prepaid Koin + pass-through marketplace + creator payout may require structured compliance | Counsel/PSP written sign-off before live payments | GO-LIVE BLOCKER |
| Creator UGC content category | Provider may restrict certain content | Obtain written acceptable-use confirmation from PSP/media provider | GO-LIVE BLOCKER |
| Operational payout timing | Manual Friday payout may miss holidays or bank delays | Define calendar and SLA disclosure | RECOMMENDED |

## 15. High-priority acceptance tests

### Payment and wallet
- [ ] Duplicate webhook credits exactly once.
- [ ] Forged/altered callback credits zero Koin.
- [ ] Gateway paid but app webhook delayed is reconciled safely.
- [ ] Two simultaneous purchases cannot overspend wallet.
- [ ] One source top-up's refunded lot cannot be spent again.
- [ ] QRIS checkout does not surcharge consumer with merchant MDR.
- [ ] User sees total charge and legal channel fee before confirming.

### Premium and archive
- [ ] Premium price 4 rejected, 5 accepted, 1,000 accepted, 1,001 rejected.
- [ ] Paid entitlement persists beyond subscription expiration and creator archive.
- [ ] Duplicate post purchase doesn't debit again.
- [ ] New subscribers do not access already archived post.
- [ ] Subscriber active at archive retains access only until original period end.
- [ ] Early renewal does not extend archive grant; scheduled renewal does not qualify for already archived post.
- [ ] Archived content returns to subscriber visibility when republished.
- [ ] Legal takedown defeats media access even with old purchase, and creates case workflow.

### Subscription and tips
- [ ] Only one creator plan; duration always 30 days; price 9 rejected, 10 accepted, 5,000 accepted, 5,001 rejected.
- [ ] Early renewal starts exactly when previous period ends; no overlap.
- [ ] A second scheduled renewal is rejected even under simultaneous requests.
- [ ] Cancel scheduled renewal before start returns full Koin exactly once; at/after start cancellation route rejects.
- [ ] Plan price changed after purchase does not change paid future period.
- [ ] Non-paying user cannot tip; active subscriber and valid purchaser can tip the same creator.
- [ ] Tip 0 rejected, 1 accepted, 1,000 accepted, 1,001 rejected; platform tip fee always zero.
- [ ] Tips do not create/extend entitlements.

### Earnings, refunds, disputes, payouts
- [ ] Fee splits are exact: premium 20%, subscription 15%, tips 0%.
- [ ] Scheduled future period earnings don't mature before 14 days from start and settlement checks.
- [ ] Creator withdrawal below Rp100,000 rejected; simultaneous withdrawals cannot double-reserve.
- [ ] Failed payout cannot be marked paid; reconciled success is one-time.
- [ ] Topup dispute tracing identifies all affected coin lots and spending allocations.
- [ ] Platform-owned payment fraud does not cause innocent creator recovery.
- [ ] Timely appeal stops final offset until reviewed.
- [ ] After final decision, offset consumes at most remaining outstanding and at most eligible matured earnings; exactly-once posting.
- [ ] 100% offset recovers debt until zero; no automatic debit to creator bank.
- [ ] Reversal on overturned decision restores corrected earnings with ledger trace.
- [ ] Daily financial reconciliation reports any imbalance, not silent balance edits.

## 16. Engineering priorities

**P0 — Financial correctness:** verified top-up, coin-lot tracing, transactional debits, immutable ledger, entitlement, period state/races, fees, dispute holds, adjustment, payout reservation and reconciliation.

**P1 — Creator/user workflow:** wallet UI, creator pricing screen, manual renewal queue, scheduled cancellation, purchase library, tips, finance dashboard and notifications.

**P2 — Risk quality:** device/velocity anomaly detection, detailed loss reports, maker/checker, advanced credit risk policy, refined legal/tax reporting.

## 17. Open decisions and GO-LIVE approvals

**OPEN—Product:** whether top-ups >250 Koin should be offered; media-per-post and paid-post editing; free/premium comment rules; treatment of plan closure with prepaid renewal; coin expiry/closure; exact tip-restriction handling after entitlement refund; support/refund SLA; whether payout minimum applies to gross withdrawal (recommended) and exact tax handling.

**OPEN—Ops:** maker/checker threshold; recipient bank validation; appeal notice delivery protocol; disputes hold duration; transaction spending velocity; reconciliation cutoffs.

**GO-LIVE BLOCKER—Legal/provider:** validate closed-loop Koin classification under prevailing Indonesian payment regulation; gateway merchant approval for multi-creator marketplace and hosted content; refund and transfer-fee terms; QRIS anti-surcharge compliance; KYC/tax/consumer protection; provider UGC acceptable use; personal-data and financial record retention.

## 18. Source links / verification references

- Bank Indonesia, PBI 10/2025 (effective 31 Mar 2026): https://www.bi.go.id/id/publikasi/peraturan/Pages/PBI_102025.aspx
- Bank Indonesia, QRIS MDR borne by merchant, not consumers; updated 2026 merchant thresholds: https://www.bi.go.id/id/publikasi/ruang-media/cerita-bi/Pages/mdr-QRIS.aspx
- Midtrans, notification HTTPS/idempotency: https://docs.midtrans.com/docs/https-notification-webhooks
- Midtrans, signature verification: https://docs.midtrans.com/reference/handle-notifications

**Status:** Product financial decisions are consolidated, but real-money launch remains gated by legal, gateway, operational and remaining OPEN decisions. No provider production approval is implied.
