# QA Report: TASK-228 — Inbox endpoints + web wiring

**Story:** US-071
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] New `notifications` module (`NotificationsController` under `SessionGuard`, `NotificationsService`, exported for US-072); registered in `AppModule`
- [x] Endpoints: `GET /me/notifications?cursor=` (reuses the wallet keyset codec `ledgerCursorSchema`/`encodeLedgerCursor`/`ledgerCursorWhere`), `GET /me/notifications/unread-count`, `POST /me/notifications/read` (Zod strict body, 204; CSRF via the global guard); all `no-store`
- [x] Pure `renderNotification` (`notification-text.ts`) builds Bahasa Indonesia text + same-origin link per type; US-074 reuses it for Telegram
- [x] Web `lib/api/notifications.ts` and `notifications.server.ts` (cookie forwarded, no cookie → 0 without a request, any error → 0) call the API; dummy data removed

### Security / Isolation
- [x] Every query filters by the session's `userId`; marking with another user's id → 404 and nothing changes (tested)
- [x] Text never contains captions, comment bodies or media: the renderer only receives type, coins and a creator name (the caption marker is asserted absent)
- [x] Fallback when a target can't be opened (post not PUBLISHED/ARCHIVED, creator not public): text "Notifikasi ini tidak lagi tersedia.", link `/notifications`, no actor
- [x] Actor avatar only from an APPROVED creator profile; no ids or Telegram data in items

### Code Quality
- [x] Retention filter on both list and count (DB rows are kept; a cleanup sweep is a `shortcut` for later, as planned)
- [x] Links go to the post page without `?comment=` (the post page doesn't read that parameter; noted in the plan)

## Acceptance Criteria (US-071)

| AC | Result |
|---|---|
| Table with recipient, type, actor, target, UNIQUE dedupe, readAt, createdAt; written only by producers | PASS (no client write endpoint) |
| List newest first, cursor, server-built text, neutral fallback | PASS |
| Unread count; mark read up to an id; other users' ids 404 / no effect | PASS |
| Configurable retention (example 90 days) | PASS |
| Web uses the endpoints; integration tests | PASS |

## Testing

- `notification-text.spec.ts` (11): every type's text and link, every type gives a same-origin link, null when the post or creator is gone.
- `notifications-inbox.integration.spec.ts` (8): 401 without a session; 25 rows → pages of 20 + 5, newest first, no duplicates, no-store; bad cursor 400; unread count + mark-read up to an id (only the caller's); foreign id 404 without changes; bad body 400; retention cut-off; post notification with actor/link, no caption leak, fallback after the post is REMOVED.
- Web: `notifications.test.ts` (6), `notifications.server.test.ts` (2).
- Full suites: API 111 files / 1,369 tests, web 128 files / 956 tests. ESLint + `tsc` clean in both apps.
