# QA Report: TASK-221 — Notifications contract + dummy source

**Story:** US-067
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `packages/shared/src/notifications.ts`: `NOTIFICATION_TYPES`, `NOTIFICATIONS_PAGE_SIZE`, `notificationItemSchema`, `notificationsPageSchema`, `unreadCountSchema`, `markNotificationsReadSchema` (strict); exported from `index.ts`
- [x] One swappable web source `lib/api/notifications.ts` (`fetchNotificationsPage`, `fetchUnreadCount`, `markNotificationsRead`) plus `notifications.server.ts` (`getUnreadCount`, any error → 0), each with a `// shortcut:` note naming US-071

### Security
- [x] `href` must start with `/` in the schema, so a bad API answer can't produce an off-site link (open-redirect guard at the contract)
- [x] The item has no fields for comment text or media; the API builds `text` (US-071)

### Code Quality
- [x] The dummy follows the artboard `NOTIFICATIONS` (Bahasa Indonesia); mark-read flips items in module state, so the bell dot clears after a visit even with dummy data

## Testing

- `packages/shared/src/notifications.test.ts` (3): valid page; unknown type and absolute href rejected; `upToId` must be a uuid with no extra keys.
- ESLint + Prettier clean.
