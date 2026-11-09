# QA Report: TASK-222 — Notifikasi page + bell dot

**Story:** US-067
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `/notifications` page follows the Library pattern: `Suspense` → server check → `redirect(loginHref('/notifications'))`, `PageHeader` (`asHeading`, `fallbackHref="/"`)
- [x] `NotificationList` (client) uses `usePagedList`, the existing `formatRelativeTime` and the `initials` helper; a "Perlu konfirmasi" pill + "Daftar notifikasi belum final."
- [x] Beranda fetches the unread count next to the session check (`Promise.all`) and passes `hasUnread` to `HomeTopBar`, which already renders the dot + accessible label. A failure → 0, so Home never breaks.

### Security
- [x] Rows render the API's `text`/`href` as text and a same-origin `Link` (the schema enforces a leading `/`); no media or comment bodies are displayed

### Accessibility
- [x] Rows are links inside a list; unread rows carry sr-only "Belum dibaca:" plus a tint (`bg-accent/40`, close to the artboard `#FFF8F6`); `<time dateTime>`; loading `role="status"`, errors `role="alert"`

### Code Quality
- [x] Marks read once, up to the newest loaded item (ref guard); a failure is ignored. Rows keep their unread look for this visit (as planned).
- [x] Empty "Belum ada notifikasi.", error + "Coba lagi" (first page and load-more), load-more sentinel

## Acceptance Criteria (US-067)

| AC | Result |
|---|---|
| Login-only page with avatar, bold actor + text, relative time, unread tint | PASS. Time format comes from the existing helper ("2 jam yang lalu", date after a week), not the story's "2j"; kept for consistency with comments (as planned) |
| Row opens its target; no premium media / locked comment text | PASS (API-built `href`/`text`) |
| Bell dot + "Notifikasi, ada aktivitas baru"; opening the page marks read | PASS |
| "Perlu konfirmasi" label, empty state, loading, load-more, retry | PASS |
| Swappable source + component tests | PASS |

## Testing

- `components/notifications/notification-list.test.tsx` (4): row content/link/time/unread styling + read row; mark-read called once with the newest id; empty state marks nothing; retry.
- `app/(public)/notifications/page.test.tsx` (2): signed-in render, guest redirect.
- `app/page.test.tsx` (+2): dot and label for 3 unread, none for 0.
- Full web suite: 122 files / 924 tests pass. ESLint + Prettier clean; `tsc` clean apart from the other session's `studio/earnings/earnings-view.tsx`.

## Notes

- One earlier full run showed `post-media-viewer.test.tsx` failing with "IntersectionObserver is not defined". It passes alone and in the next full run. That file is untouched here (likely flaky under load); worth watching.
