# Technical Plan: US-007 — Guest Access Rules in the Shell

## Architecture Overview

The access rule was revised with the user on 2026-11-07 and replaces the original AC:

- **Guests may open only:** `/login`, a creator page `/{creatorSlug}`, and its posts `/{creatorSlug}/posts/{postId}`.
- On those pages a guest sees **no top bar** (`PageHeader`) and **no bottom nav**.
- Every **action** on them sends the guest to `/login` with `returnTo` set to the current page.
- **Every other page** redirects a guest to `/login?returnTo=<path>`. There are no "Masuk atau daftar" prompts on Profil or Dompet.
- After login, the existing `returnTo` flow brings the user back. `safeReturnTo` keeps the query, and it only accepts same-origin relative paths.

Web-only. No API, DB or shared changes.

1. **Default-deny gate in `apps/web/src/proxy.ts`** (Next 16 Proxy, Node runtime).
   - Requests without the session cookie (`SESSION_COOKIE`) are redirected to `loginHref(pathname + search)`, unless `isGuestPath(pathname)`.
   - New routes are protected automatically.
   - The matcher excludes `/api/*` (rewritten to the API), `_next/*`, and files with an extension.
   - This is a cookie-presence check only, which is enough here because logout clears the cookie and the cookie expires with the session. The one gap is a session revoked server-side (for example, a suspension): that visitor sees placeholder pages until the API rejects their next data request. Home validates the session for real (step 3), and every API call is still authorized server-side.
2. **`isGuestPath`** (`lib/guest-paths.ts`): `/login`, or one or three segments where the first is a creator slug and the next two are `posts/<id>`.
   - "Creator slug" means the lowercased segment matches the shared `SLUG_PATTERN` and is not in `RESERVED_SLUGS`, so `/discover`, `/me`, `/wallet` etc. are never guest paths.
   - An unknown slug still reaches the existing "Kreator tidak ditemukan" page.
3. **Real session checks on the server** (the source of truth for what a guest sees):
   - **Shell:** the root layout mounts `SignedInChrome` (server, inside the existing `Suspense`), which renders `<AppChrome />` only when `getCurrentUser()` returns a user. Guests get no bottom nav and no spacer anywhere.
   - **Home:** `/` reads the user and calls `redirect(loginHref('/'))` when there is none. That covers a revoked-session cookie. Otherwise it renders the top bar with `<AccountDrawer user={user} />`.
     - `AccountEntry` and `GuestBurger` are deleted, and `HomeTopBar`'s `account` prop becomes required, so the top bar and drawer can't render for a guest.
     - `loginHref('/')` is `/login` (`/` is the default return target), which behaves the same as `returnTo=/`.
   - **Creator and post pages:** their user-dependent parts stream in one `Suspense`'d view that receives `signedIn`.
     - Guest: no `PageHeader`. Actions become login links: Bagikan, Langganan, a premium tile goes straight to the post page (whose unlock is already "Masuk untuk membuka"), and Masuk stays as it is.
     - Signed in: exactly as today.
   - **API outage:** treated as a guest, the same as `/login`. There is no redirect loop, because `/login` also treats an outage as a guest.
4. **Post page actions** for guests are already login links (like, comment, unlock, report). Only the header needs gating.

### Supersedes earlier decisions
- US-003 AC "the bottom nav is visible … including a creator profile opened directly from a bio link by a guest" is now: guests never see the nav.
- US-003/US-005 `PageHeader` on creator and post pages is now signed-in only.
- US-005 `AccountEntry`/`GuestBurger` (guest burger → `/login`) is removed, because Home is signed-in only.

## Dependencies

None new. The tools already in the repo are enough: `next/server` (`NextResponse`, `NextRequest`), `SESSION_COOKIE`/`SLUG_PATTERN`/`RESERVED_SLUGS` from `@influency/shared`, `loginHref`, and `getCurrentUser`.

## Risks

- **Revoked session with a live cookie** (see item 1). Accepted. The proxy carries the comment `// shortcut: cookie presence only; a server-revoked session passes until a page validates it (Home does); validate in proxy via /auth/me if that matters.`
- **Bio-link visitors lose the nav and back button.** This was requested. Browser back still works.
- **Uppercase bio links** (`/Ana`): `isGuestPath` lowercases before matching, so they stay open, and the creator page already normalises.
- **Proxy and Server Functions:** the app has none. API mutations go to `/api/v1` and are authorized by the API, so the proxy is not a security boundary, only UX. This follows the Next docs warning.
- **Creator page streaming:** the profile header stays in the cached part, so link previews (metadata) are unchanged. Only the viewer-dependent bits move into the `Suspense`'d view.

---

## Tasks

### TASK-017: Guest proxy, guest path rule and signed-in-only Home

1. **`apps/web/src/lib/guest-paths.ts`**:
   ```ts
   import { RESERVED_SLUGS, SLUG_PATTERN } from '@influency/shared';
   const isCreatorSlug = (segment: string) => {
     const slug = segment.toLowerCase();
     return SLUG_PATTERN.test(slug) && !(RESERVED_SLUGS as readonly string[]).includes(slug);
   };
   /** Pages a guest may open: /login, /{creatorSlug}, /{creatorSlug}/posts/{postId}. Everything else needs login. */
   export function isGuestPath(pathname: string): boolean {
     if (pathname === '/login') return true;
     const segments = pathname.split('/').filter(Boolean);
     if (segments.length === 1) return isCreatorSlug(segments[0]!);
     return segments.length === 3 && segments[1] === 'posts' && isCreatorSlug(segments[0]!);
   }
   ```
   - A trailing slash yields the same segments, so `/ana/` counts as a guest path.
2. **`apps/web/src/proxy.ts`**:
   ```ts
   import { type NextRequest, NextResponse } from 'next/server';
   import { SESSION_COOKIE } from '@influency/shared';
   import { isGuestPath } from '@/lib/guest-paths';
   import { loginHref } from '@/lib/login-href';

   export function proxy(request: NextRequest) {
     const { pathname, search } = request.nextUrl;
     if (request.cookies.has(SESSION_COOKIE) || isGuestPath(pathname)) return NextResponse.next();
     return NextResponse.redirect(new URL(loginHref(pathname + search), request.url));
   }

   export const config = {
     // Not the API proxy (/api/v1 is rewritten to the API and authorizes itself), Next internals or files.
     matcher: ['/((?!api/|_next/|.*\\.[\\w]+$).*)'],
   };
   ```
   - Add the `shortcut:` comment from Risks above `proxy`.
   - Read `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` first, and match its named-export form.
3. **Home** (`app/page.tsx`):
   ```tsx
   export default function HomePage() {
     return <Suspense fallback={null}><Home /></Suspense>;
   }
   // A guest never sees the top bar or drawer: the proxy redirects cookie-less visitors; this catches revoked sessions.
   async function Home() {
     const user = await getCurrentUser().catch(() => null);
     if (!user) redirect(loginHref('/'));
     return <ComingSoon title="Beranda" description="…" header={<HomeTopBar account={<AccountDrawer user={user} />} />} />;
   }
   ```
   - Export `Home` for tests.
4. **`HomeTopBar`**: `account: ReactNode` becomes required, and `{account}` replaces `{account ?? <GuestBurger />}`. Delete `GuestBurger`.
   - Delete `components/account-entry.tsx` and `account-entry.test.tsx`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/guest-paths.ts` (+ test) | the guest allow-list rule |
| CREATE | `apps/web/src/proxy.ts` (+ `proxy.test.ts`) | default-deny redirect for cookie-less visitors |
| MODIFY | `apps/web/src/app/page.tsx` (+ test) | signed-in-only Home, drawer from the same user |
| MODIFY | `apps/web/src/components/home-top-bar.tsx` (+ test) | required `account`, drop `GuestBurger` |
| DELETE | `apps/web/src/components/account-entry.tsx` (+ test) | superseded |

**Testing:**
- `guest-paths.test.ts` (`it.each`):
  - true: `/login`, `/ana`, `/Ana`, `/ana/`, `/ana/posts/0190a000-…`, `/claudiandreya/posts/x`
  - false: `/`, `/discover`, `/me`, `/wallet`, `/wallet/topups/1`, `/library`, `/subscriptions`, `/following`, `/notifications`, `/account/settings`, `/studio`, `/admin`, `/become-creator`, `/login/x`, `/ana/posts`, `/ana/about`, `/ana/posts/1/x`, `/a` (too short for `SLUG_PATTERN`)
- `proxy.test.ts` (`// @vitest-environment node`; build `new NextRequest('http://localhost:3000' + path, { headers })`):
  - A guest on `/discover?tab=x` gets a 307 with `location` ending `/login?returnTo=%2Fdiscover%3Ftab%3Dx`.
  - A guest on `/` → `location` ends `/login`.
  - A guest on `/ana` and on `/login?returnTo=/me` → passes (no `location`; `x-middleware-next` set).
  - With the cookie `influency_session=t` on `/wallet` → passes.
  - The `config.matcher` regex (tested as a plain `RegExp` built from the same string) does not match `/api/v1/auth/me`, `/_next/static/x.js` or `/favicon.ico`, and does match `/`, `/me` and `/ana/posts/1`.
- `app/page.test.tsx`:
  - `Home()` with a user renders h1 "Beranda", Cari and the "Buka menu akun" button.
  - `Home()` with `null`, and with a rejection, throws `redirect:/login` (mock `next/navigation` `redirect` to throw).
- `home-top-bar.test.tsx`: drop the `GuestBurger` case. Render with `account={<button type="button">X</button>}` everywhere, and the link list ends at Notifikasi.

---

### TASK-018: Signed-in-only shell and page headers

1. **`components/signed-in-chrome.tsx`** (server, async):
   ```tsx
   /** Guests get no bottom nav or spacer anywhere (US-007); signed-in users get AppChrome. */
   export async function SignedInChrome() {
     const user = await getCurrentUser().catch(() => null);
     return user ? <AppChrome /> : null;
   }
   ```
   - Root layout: `<Suspense fallback={null}><SignedInChrome /></Suspense>` replaces `<AppChrome />`. Keep the `usePathname` comment, since AppChrome still suspends inside.
2. **`components/if-signed-in.tsx`** (server, async):
   ```tsx
   export async function IfSignedIn({ children }: { children: ReactNode }) {
     const user = await getCurrentUser().catch(() => null);
     return user ? children : null;
   }
   ```
   - Used for headers that only signed-in users see. Callers wrap it in `<Suspense fallback={null}>`.
3. **Post page** (`[creatorSlug]/posts/[postId]/page.tsx`): wrap the `PageHeader` as `<Suspense fallback={null}><IfSignedIn><PageHeader … /></IfSignedIn></Suspense>`. Nothing else changes; its actions are already login links for guests.
4. **AppChrome comment and `frontend.md` "App shell":**
   - The nav shows only for signed-in users (`SignedInChrome`).
   - Guests may open only `isGuestPath` pages, with no header or nav.
   - New pages are login-only by default (the proxy), and a page meant for guests must be added to `isGuestPath`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/signed-in-chrome.tsx` (+ test) | nav for signed-in users only |
| CREATE | `apps/web/src/components/if-signed-in.tsx` (+ test) | signed-in-only fragments |
| MODIFY | `apps/web/src/app/layout.tsx` | mount SignedInChrome |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` (+ test) | header for signed-in only |
| MODIFY | `.agile/guidelines/frontend.md` | shell and guest rules |

**Testing:**
- `signed-in-chrome.test.tsx` (mock `getCurrentUser` and `next/navigation` `usePathname` → `/discover`):
  - user → `navigation` "Navigasi utama"
  - `null` → empty
  - rejected → empty
- `if-signed-in.test.tsx`: renders children for a user, and nothing for `null` or a rejection.
- Post page `page.test.tsx`: the page wraps the header in `IfSignedIn`. `IfSignedIn` has its own tests, so here assert only that a guest render (`getCurrentUser` → `null`, after awaiting) has no "Kembali" link and still shows "Masuk untuk membuka" on a locked post. Adapt the existing direct-visit "Kembali → /ana" assertion so it runs with a signed-in user.

---

### TASK-019: Guest view of the creator page (no header, actions to login)

1. **Creator page** (`[creatorSlug]/page.tsx`): keep the cached `getPublicCreator` profile fetch and `generateMetadata`.
   - Move everything viewer-dependent into one streamed view (`fallback={null}`):
     ```tsx
     export default async function CreatorPage({ params }: Props) {
       const creator = await getPublicCreator((await params).creatorSlug);
       if (!creator) notFound();
       return <Suspense fallback={null}><CreatorView creator={creator} /></Suspense>;
     }
     export async function CreatorView({ creator }: { creator: CreatorProfileResponse }) {
       const user = await getCurrentUser().catch(() => null);
       const signedIn = user !== null;
       const back = `/${creator.slug}`;
       …
     }
     ```
   - The HTML is still server-rendered in the same response (streamed), so bio-link first load and SEO keep working.
   - Inside `CreatorView`, render the existing markup with these guest changes:
     - **Header:** render `PageHeader` only when `signedIn`.
     - **Masuk** (the old `LoginCta`): render inline when `!signedIn`, as `<Button asChild size="sm"><Link href={loginHref(back)}>Masuk</Link></Button>`. Delete `LoginCta` and its separate `Suspense`.
     - **Share:** a signed-in user gets `<ShareButton title=… />`; a guest gets a `Link` to `loginHref(back)` with the same look as the share button and the label "Bagikan". Read `share-button.tsx` and reuse its class string by exporting it as `SHARE_BUTTON_CLASS`.
     - **Subscribe:** `<SubscribeCard creatorName=… loginHref={signedIn ? undefined : loginHref(back)} />`. In `SubscribeCard`, when `loginHref` is set, the CTA is a `Link` with the same classes reading "Masuk untuk berlangganan" instead of the `PurchaseSheet`.
     - **Posts:** `<CreatorPosts slug=… creatorName=… signedIn={signedIn} />` → `PostGrid` → the premium tile. When `!signedIn`, the premium tile renders like a free tile (a `Link` to the post page) instead of opening the `PurchaseSheet`. The post page shows the guest "Masuk untuk membuka".
     - The Instagram/TikTok chips stay as disabled dummies (no action), and the post-type filter buttons stay (they only filter the view).
2. Keep `instant = false` and the soft-404 comment.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` (+ test) | `CreatorView` with `signedIn` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/subscribe-card.tsx` | guest CTA → login |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/share-button.tsx` | export the class |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx`, `post-grid.tsx` (+ tests) | `signedIn` → premium tile links for guests |

**Testing** (creator `page.test.tsx`; render `await CreatorView({ creator })` with mocked `getCurrentUser`):
- **Guest:**
  - no `banner`/"Kembali" header
  - "Masuk" → `/login?returnTo=%2Fclaudiandreya`
  - "Bagikan" is a link to the same URL (no share button)
  - "Masuk untuk berlangganan" → the same URL
  - h1, bio, images and the Konten region are still shown
- **Signed in:**
  - the header shows the display name
  - no "Masuk" link
  - "Bagikan halaman" is a button
  - the "Langganan · … Koin" button opens the sheet, as today
- **API outage** (rejected) renders the guest view.
- `CreatorPage` for an unknown slug is still `notFound`.
- `post-grid` / `creator-posts` tests:
  - With `signedIn={false}`, a premium tile is a link to `/{slug}/posts/{id}`, and no dialog opens on click.
  - With `signedIn`, the current sheet behaviour is unchanged.
- `pnpm check` green, and `pnpm --filter @influency/web build` succeeds. The build must still list `/[creatorSlug]` as partial prerender.
- Manual check, signed out:
  - `/`, `/discover`, `/me`, `/wallet` and `/library` each land on `/login`, and log in returns to the page.
  - `/{slug}` and a post page show no header and no nav, and every action goes to `/login` and comes back.
  - Manual check, signed in: everything as before.
