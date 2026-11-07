# Frontend Guidelines — Next.js App Router

Applies to `apps/web`. The web app is presentation + SSR only: it never holds secrets, decides prices, or decides access.

Next.js 16 changed many APIs and conventions. Before using an unfamiliar Next.js API, read the bundled docs in `apps/web/node_modules/next/dist/docs/` (see `apps/web/AGENTS.md`, which `next dev` regenerates). The app runs with `cacheComponents` and `partialPrefetching` enabled.

## Routing

Route groups under `apps/web/src/app/` (handoff §3.1):

```text
(public)/
  page.tsx                          # / (discover)
  [creatorSlug]/page.tsx            # public creator page
  [creatorSlug]/posts/[postId]/     # post detail / paywall
(auth)/login/
(subscriber)/wallet/, wallet/topups/[orderId]/, subscriptions/, library/, become-creator/
studio/ (posts, plans, earnings, payouts)
admin/
```

- Reserved top-level segments must be real routes or blocked, and the API rejects them as slugs: `login, wallet, studio, admin, auth, api, discover, subscriptions, library, terms, privacy, help, become-creator, account, me, notifications, following`. Keep this list in `packages/shared` and use it in both apps.
- `studio/` and `admin/` layouts check the session server-side and redirect/404 for unauthorized users. The API still enforces authorization — UI guards are convenience only.

## App shell

- Guest access (US-007): guests may open only `isGuestPath` pages (`lib/guest-paths.ts`: `/login`, `/{creatorSlug}`, `/{creatorSlug}/posts/{postId}`). `src/proxy.ts` redirects cookie-less visitors everywhere else to `/login?returnTo=…`, so **new pages are login-only by default**; add a page to `isGuestPath` only if guests must see it. Pages that render user data still validate the session server-side (`getCurrentUser`), as Home does.
- Guests never see the shell: `SignedInChrome` (root layout, inside `Suspense`) mounts `AppChrome` (bottom nav + spacer) only for a signed-in user, and headers on guest pages are wrapped in `IfSignedIn`. Every action a guest can trigger on a guest page links to `loginHref(currentPath)`.
- `AppChrome` owns the bottom nav and the bottom spacer. Pages never mount `BottomNav` or add bottom padding for it.
- Routes without the nav are listed in `STANDALONE_PREFIXES` (`components/app-chrome.tsx`); add new standalone routes (e.g. onboarding) there.
- Every non-Home page starts with `PageHeader` (`components/page-header.tsx`). Pass `asHeading` only when the page has no other `<h1>`, and `fallbackHref` when a direct visit should still offer a back link.
- Home is the only page with `HomeTopBar` (`components/home-top-bar.tsx`) instead of `PageHeader`; until the feed lands it is passed as `ComingSoon`'s `header`.
- The account entry is `AccountDrawer` (right drawer), opened from the Home top bar burger via `AccountEntry` (server, streams the user in `Suspense`). Don't add a header account menu elsewhere.
- Placeholder pages use `ComingSoon`.

## Server vs client components

- Server components by default. Use `"use client"` only for interactivity (purchase buttons, Snap checkout, upload, forms).
- Public creator pages are SSR for fast first load from Instagram/TikTok in-app browsers and for link previews.
- Public pages render only public data: profile, free posts, premium **previews** and prices. Never put premium originals, media tokens or signed URLs in SSR HTML, props, or metadata.

## Data fetching and API access

- Call the NestJS API (`/api/v1`) through one typed client in `src/lib/api/` using request/response schemas from `packages/shared`.
- Server components forward the session cookie when calling the API; client components call same-origin routes with `credentials: 'include'`.
- Parse API errors into the shared error shape and branch on `error.code`, not on message text.
- Payment status pages poll the API; the browser's Midtrans result is only a UI hint.

## Auth

- "Login with Telegram" goes to `GET /auth/telegram/start?returnTo=<current relative path>`; after the callback the user lands back on the same creator page/post.
- Never read or store tokens in JS; the session is an HttpOnly cookie.
- `/login` redirects a signed-in visitor server-side to `safeReturnTo(returnTo)` (`RedirectIfSignedIn`); an API outage counts as a guest. The `telegram` colour token is only for the "Masuk dengan Telegram" button.
- Mutations go from the browser to same-origin `/api/v1` (the browser sends `Origin`). A Next server-side call that mutates with the forwarded session cookie must also send `Origin: WEB_ORIGIN`, or the API returns 403 (CSRF guard).
- Detect Instagram/TikTok in-app browsers and offer an "Open in browser" fallback when login fails.

## Purchase and paywall UX (handoff §3.4)

- Before unlock/subscribe, show price in Koin, duration, estimated expiry (Asia/Jakarta), and whether an active creator subscription already covers the post.
- Before top-up, show IDR price, Koin amount, and refund/validity policy text (placeholder until policy is decided).
- Generate an `Idempotency-Key` (UUID) per purchase attempt, keep it across retries of the same attempt, and send it as a header. Disable the button while pending.
- Handle `INSUFFICIENT_COINS` (link to wallet with required amount), `OFFER_CHANGED` (show new price, ask to confirm), `ALREADY_ENTITLED` (open the content).
- Midtrans Snap: load Snap JS with the **client key** only; the Snap token comes from `POST /wallet/topups`. After Snap closes, go to `/wallet/topups/[orderId]` and show the status from the API.
- Premium media is fetched from `GET /posts/:id/media-access` on demand in a client component; refetch when the short-lived URL expires.
- Feed cards (`PostCard`) load media lazily through `useMediaAccess(postId, enabled)` once the card nears the viewport, never in SSR. Locked cards (`post.access === 'locked'`) never call media-access and show only `previewUrl`. Reuse `MediaItemView` to render media items.
- Video always plays through `PostVideo` (via `MediaItemView`): HLS or a file in `<video>`, never an iframe. The source is attached on the first play only (poster before that). Muted autoplay follows spec §6.3: one video at a time (`claimPlayback` in `lib/video-playback.ts`), only the active carousel slide (`active`), at least `AUTOPLAY_VISIBLE_RATIO` visible, and the tab visible. Any overlay that should pause media calls `pauseAllVideos()`. `BottomSheet` and `MediaViewer` already do. `MediaViewer` (`components/media-viewer/`, full-screen, US-013) opens from an accessible image slide, a video's "Layar penuh" button, or an accessible Grid tile; locked media never opens it.

## Styling and UX

- Tailwind + shadcn/ui components; mobile-first layouts designed at ~375px width first.
- Format dates/times in `Asia/Jakarta`; amounts as integers (`5 Koin`, `Rp25.000` via `Intl.NumberFormat('id-ID')`).
- User-facing copy in Bahasa Indonesia.
- Accessible: labeled controls, focus states, sufficient contrast.
- Sheets and dialogs on user-facing pages use `BottomSheet` (`components/ui/bottom-sheet.tsx`); short confirmations use `useToast()` (`components/ui/toast.tsx`, `Toaster` is mounted in the root layout, so component tests render with `{ wrapper: Toaster }`). Never use `window.confirm`/`alert` outside `/admin`.

## Testing

- Component/unit tests with Vitest + Testing Library for non-trivial client components.
- Playwright e2e for user journeys (handoff §15.4) using the fake OIDC adapter and fake/sandbox top-up in CI. Include a check that logged-out pages contain no premium media URLs.
