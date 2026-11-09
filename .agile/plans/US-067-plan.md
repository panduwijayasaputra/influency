# Technical Plan: US-067 — Notifikasi Page UI

## Architecture Overview

- **Contract first:** the shared notification schemas are final from day one. The API builds the display text and the link; the web app renders `text` and `href` as given and holds no per-type wording.
- **Data source:** `lib/api/notifications.ts` is the one swappable source (dummy until US-071).
- **Page:** `/notifications` uses `usePagedList` and `PageHeader`, like the other user-area lists. Opening it marks everything up to the newest loaded item as read.
- **Bell:** Beranda (`app/page.tsx`, server) streams the unread count inside `Suspense` and passes `hasUnread` to `HomeTopBar`, which already renders the dot and the accessible label.

## Dependencies

- Existing: `usePagedList`, `PageHeader`, `formatRelativeTime` (`lib/relative-time.ts`), `HomeTopBar` `hasUnread`, `CONFIRM_PILL` style used for "Perlu konfirmasi" pills (find it in `components/profile/profile-summary.tsx` and reuse it).

## Risks

- **Relative time wording.** The story's format ("2j", "Kemarin", "2 Nov") must come from the existing `formatRelativeTime`. If it formats differently, keep the existing helper (consistency with comments) and note it in QA.
- **Server-side unread fetch on Beranda.** It needs the session cookie forwarded. Follow the existing `*.server.ts` pattern (e.g. `creator-follow.server.ts`). Any error → `hasUnread=false`; it must never break Home.

## Tasks

### TASK-221: Notifications contract + dummy source

- `packages/shared/src/notifications.ts` (export from `index.ts`):
  ```ts
  export const NOTIFICATION_TYPES = ['NEW_POST','COMMENT_REPLY','COMMENT_LIKE','TOPUP_CREDITED','SUBSCRIPTION_ENDING',
    'NEW_SUBSCRIBER','POST_UNLOCKED','TIP_RECEIVED','PAYOUT_STATUS'] as const;
  export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
  export const NOTIFICATIONS_PAGE_SIZE = 20;
  export const notificationItemSchema = z.object({
    id: z.uuid(), type: z.enum(NOTIFICATION_TYPES),
    actor: z.object({ displayName: z.string(), avatarUrl: z.string().nullable() }).nullable(),
    text: z.string(),          // shown after the bold actor name, or alone when actor is null
    href: z.string(),          // same-origin relative path
    createdAt: z.string(), read: z.boolean(),
  });
  export const notificationsPageSchema = z.object({ items: z.array(notificationItemSchema), nextCursor: z.string().nullable() });
  export const unreadCountSchema = z.object({ count: z.number().int().min(0) });
  export const markNotificationsReadSchema = z.object({ upToId: z.uuid() }).strict();
  ```
- `apps/web/src/lib/api/notifications.ts`: `fetchNotificationsPage(cursor)`, `fetchUnreadCount()` (client), `markNotificationsRead(upToId)`. Bodies: `// shortcut: dummy notifications until US-071 swaps these to /me/notifications.` Use 4 dummy items modelled on the artboard `NOTIFS`, in Bahasa Indonesia (e.g. actor "Nadia Kirana", text "memposting konten baru.", `href: '/nadia'`), 2 unread; `markNotificationsRead` flips them in module state.
- `apps/web/src/lib/api/notifications.server.ts`: `getUnreadCount(): Promise<number>` for server components. It returns the dummy count now; US-071 makes it call `GET /me/notifications/unread-count` with the forwarded cookie, and any error → 0.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/notifications.ts` (+ `.test.ts`) | Contract |
| MODIFY | `packages/shared/src/index.ts` | Export |
| CREATE | `apps/web/src/lib/api/notifications.ts` | Client source (dummy) |
| CREATE | `apps/web/src/lib/api/notifications.server.ts` | Server unread count (dummy) |

**Testing:** schema accepts a valid page and rejects an unknown type.

---

### TASK-222: Notifikasi page + bell dot

- `apps/web/src/app/(public)/notifications/page.tsx`: replace `ComingSoon` with `PageHeader` (title "Notifikasi", `asHeading`) + `<NotificationList />`. Login-only is already enforced by the proxy (not in `isGuestPath`).
- `apps/web/src/components/notifications/notification-list.tsx` (`'use client'`):
  - A "Perlu konfirmasi" pill + "Daftar notifikasi belum final." at the top.
  - `usePagedList(fetchNotificationsPage, 'notifications')`. Rows are `Link`s to `item.href`: avatar (or initials; a bell icon when `actor` is null), `<b>{actor.displayName}</b> {text}`, `formatRelativeTime(createdAt, now)`. Unread rows get the tinted background `bg-[#FFF8F6]` (add it as a theme token if the palette has one; check `globals.css`) plus visually hidden text "Belum dibaca".
  - After the first page loads with items, call `markNotificationsRead(items[0].id)` once (fire-and-forget; failure is ignored). Rows keep their unread styling for this visit (the user sees what is new).
  - Empty: `Belum ada notifikasi.`; error: `Gagal memuat notifikasi.` + "Coba lagi"; load-more through the sentinel.
- `apps/web/src/app/page.tsx` (Beranda): pass `hasUnread` to `HomeTopBar` from a streamed child: `<Suspense fallback={<HomeTopBar … hasUnread={false} />}>` + an async server component that awaits `getUnreadCount()`. If restructuring `HomeTopBar` into Suspense is awkward, mount a small client `UnreadDot` hook (`useUnreadCount()` with `fetchUnreadCount`) inside `HomeTopBar` instead. Pick whichever keeps the existing tests simplest; both satisfy the AC.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/notifications/page.tsx` | Real page |
| CREATE | `apps/web/src/components/notifications/notification-list.tsx` | List |
| CREATE | `apps/web/src/components/notifications/notification-list.test.tsx` | Tests |
| MODIFY | `apps/web/src/app/page.tsx` (+ `page.test.tsx`) | Bell unread dot |

**Testing:**
- Rows render actor name, text, relative time and link to `href`; unread rows have the tint + "Belum dibaca".
- `markNotificationsRead` is called once with the first item's id; not called when the list is empty.
- Empty, error/retry and load-more states; the "Perlu konfirmasi" pill is shown.
- Beranda passes `hasUnread` true when the count > 0, false on 0 or error.
