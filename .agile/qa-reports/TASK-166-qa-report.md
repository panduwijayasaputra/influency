# QA Report: TASK-166 — Paid access, wallet activity and Unlock wiring

**Result:** PASS

## Checked (access control, premium protection)

- **One access rule.** `decidePostAccess` gets a `paid` fact and keeps its order: admin → removed hidden → owner → non-public creator hidden → published (`FREE` or paid → full, else locked) → archived **premium + paid → full** → hidden. A REMOVED post is hidden for everyone but admins, paid or not; an archived FREE post and anything of a non-public creator stay hidden.
- **`PaidAccessService.paidPostIds`** answers for a whole page with one query (purchases only now; US-037 adds subscription and archive grants here). It ignores FREE posts and statuses that can never be paid-open. It is used by `PostAccessService.check` (detail, media access, likes, comments, reports) and by `PublicPostsService` (creator list and Home feed), so every surface agrees.
- **Media:** `GET /posts/:id/media-access` returns 200 for the buyer, 403 for another user and a guest; for an archived post 200 for the buyer and 404 for others; 404 for a removed post. URLs are still minted only after the check.
- **Public pages stay clean:** nothing premium is added to public responses; a locked viewer still gets only the preview.
- **Wallet activity** shows the unlock debit with the creator name and a link to the post (batched lookup, no N+1), and a top-up stays unchanged (`detail`/`href` null). The shared `walletTransactionSchema` gained `href` and the `POST_PURCHASE_DEBIT` type.
- **Web:** `purchasePost` is a real request (`POST /posts/:id/purchase`, `Idempotency-Key`, price the user saw); the Unlock sheet toast is "Post terbuka"; the card refetches the post so it flips to its media. The Dompet row renders "Buka post · {creator}" as a link with a minus amount.

## Tests

- `post-access.spec.ts` truth table (paid/unpaid × status × visibility × viewer × creator visibility).
- `post-purchases.integration.spec.ts` "paid access after a purchase": buyer vs other fan vs guest on detail, list and media access; archived post private to the buyer (others 404, gone from the list); removed post never opens; wallet activity row with detail and link.
- Web: `purchases.test.ts` (request shape, error code and details), `wallet-activity.test.tsx`.
- `pnpm check` green: shared 249, API 929, web 664.

## Notes for UAT

- Top up, then unlock a premium post: the card should open and Dompet should show "Buka post · {creator}". Subscriptions (US-037) are the other way a viewer gets access; they do not exist yet.
