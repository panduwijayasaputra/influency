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

- Reserved top-level segments must be real routes or blocked, and the API rejects them as slugs: `login, wallet, studio, admin, auth, api, discover, subscriptions, library, terms, privacy, help`. Keep this list in `packages/shared` and use it in both apps.
- `studio/` and `admin/` layouts check the session server-side and redirect/404 for unauthorized users. The API still enforces authorization — UI guards are convenience only.

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
- Mutations go from the browser to same-origin `/api/v1` (the browser sends `Origin`). A Next server-side call that mutates with the forwarded session cookie must also send `Origin: WEB_ORIGIN`, or the API returns 403 (CSRF guard).
- Detect Instagram/TikTok in-app browsers and offer an "Open in browser" fallback when login fails.

## Purchase and paywall UX (handoff §3.4)

- Before unlock/subscribe, show price in Koin, duration, estimated expiry (Asia/Jakarta), and whether an active creator subscription already covers the post.
- Before top-up, show IDR price, Koin amount, and refund/validity policy text (placeholder until policy is decided).
- Generate an `Idempotency-Key` (UUID) per purchase attempt, keep it across retries of the same attempt, and send it as a header. Disable the button while pending.
- Handle `INSUFFICIENT_COINS` (link to wallet with required amount), `OFFER_CHANGED` (show new price, ask to confirm), `ALREADY_ENTITLED` (open the content).
- Midtrans Snap: load Snap JS with the **client key** only; the Snap token comes from `POST /wallet/topups`. After Snap closes, go to `/wallet/topups/[orderId]` and show the status from the API.
- Premium media is fetched from `GET /posts/:id/media-access` on demand in a client component; refetch when the short-lived URL expires.

## Styling and UX

- Tailwind + shadcn/ui components; mobile-first layouts designed at ~375px width first.
- Format dates/times in `Asia/Jakarta`; amounts as integers (`5 Koin`, `Rp25.000` via `Intl.NumberFormat('id-ID')`).
- User-facing copy in Bahasa Indonesia.
- Accessible: labeled controls, focus states, sufficient contrast.

## Testing

- Component/unit tests with Vitest + Testing Library for non-trivial client components.
- Playwright e2e for user journeys (handoff §15.4) using the fake OIDC adapter and fake/sandbox top-up in CI. Include a check that logged-out pages contain no premium media URLs.
