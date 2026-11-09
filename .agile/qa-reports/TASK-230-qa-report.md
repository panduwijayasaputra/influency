# QA Report: TASK-230 — Wire event producers

**Story:** US-072
**Result:** PASS
**Tester:** qa-agent

## Code Review

| Event | Where | Transaction | Dedupe key |
|---|---|---|---|
| TOPUP_CREDITED | `TopupCreditService.applyProviderStatus`, SUCCESS branch after ledger credit + order CREDITED | same tx (savepoint) | `topup:{orderId}` |
| POST_UNLOCKED | `PostPurchasesService.purchase`, after `idempotency.complete` on a new purchase only (replays / already-owned return earlier) | same tx | `unlock:{purchaseId}` |
| NEW_SUBSCRIBER | `SubscriptionPeriodsService.subscribeInTx`, new period only | same tx | `subscription:{periodId}` |
| TIP_RECEIVED | `TipsService.tip`, after the tip + revenue rows | same tx | `tip:{tipId}` |
| COMMENT_REPLY | `PostCommentsService.create` after commit, to the author of the comment answered (`input.parentId`, also when that is a reply) | after commit | `reply:{newCommentId}` |
| COMMENT_LIKE | `CommentLikesService.like` after commit, only when the like row was new | after commit | `comment-like:{commentId}:{likerId}` |
| NEW_POST | `PostsService.publish`, first publish (`publishedAt` was null) and only when the post goes live (not `POST_MODERATION_REQUIRED`) | same tx | `new-post:{creator}:{window}` |

- [x] Module wiring: `NotificationsModule` imported by Topups, Purchases, Subscriptions, Engagement and Posts; it depends only on the global CommonModule (no cycles)
- [x] `PostCommentsService.notifyCommentAuthor` checks the recipient's access with `PostAccessService.check` (must be `full`), skips self, and never throws (try/catch + warn)
- [x] Texts are built at read time and never include comment bodies (US-071)

### Financial integrity
- [x] Money paths only gained an outbox insert under a savepoint. A forced notification failure during a real purchase (FK violation via a spy) still commits the purchase, debit and revenue rows (tested).
- [x] Failed purchases (402 `INSUFFICIENT_COINS`) and quarantined top-ups (amount mismatch) create no notification

### Known gaps (as planned)
- **PAYOUT_STATUS has no producer.** Payout status changes are admin actions (later admin/finance feature); a creator's own request/cancel needs no notification. Type, text and API are ready.
- **First publish under `POST_MODERATION_REQUIRED`** creates no notification, and no admin "approve first publish" path exists yet. The code comment in `publish` says the approval must notify.

## Testing

- `notification-events.integration.spec.ts` (12): top-up capture → 10× concurrent settlement = one notification with coins/source/key; quarantined order none; unlock once with buyer/post/creator/price, idempotent replay adds nothing; failed purchase none; purchase survives a notification failure (balance 75, purchase + revenue rows, no notification); NEW_SUBSCRIBER; TIP_RECEIVED; reply to the answered comment's author, none for self, reply-to-reply notifies that author; no reply notification for an author without access to a locked post; like: default off → opted in once per liker across unlike/like, none on own comment; publish notifies followers (not the creator); moderated publish none.
- Existing suites for top-ups, purchases, tips, subscriptions, comments, likes and publish all still pass. Full API suite: 115 files / 1,398 tests.
