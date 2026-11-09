# Technical Plan: US-013 — Public Creator Page

## Architecture Overview

Agreed scope (with the user): **profile now, content sections as empty states.** Posts (US-015–019) and creator plans (US-026) do not exist yet; those stories own filling the page ("published posts appear on the creator page" — US-019; "the active plan is shown on the creator's public page" — US-026). Avatar/banner exist since US-012 (`creator_profiles.avatar_key/banner_key`, public `GET /creators/:slug/images/:imageId`). US-013 delivers:

1. A public, unauthenticated `GET /api/v1/creators/:slug` (handoff §11.2) returning the same shape US-012 already uses, `creatorProfileResponseSchema` = `{ slug, displayName, bio, category, avatarUrl, bannerUrl }` (built by the existing `toResponse` in `creator-profile.service.ts`). Visible only when `creator_profiles.status = APPROVED` **and** `users.status = ACTIVE`; every other case (unknown, pending, rejected, suspended) is the same 404 `NOT_FOUND`. The public image endpoint gets the same `user.status = ACTIVE` filter so a suspended creator's images disappear too.
2. An SSR web page `/{creatorSlug}` in the `(public)` route group: banner image (gradient fallback), avatar image (initials fallback), display name, `influency.com/{slug}`, category, bio, "Konten" and "Langganan" sections with labelled empty states. No login required, no redirect to Telegram, no client JS of its own.

AC mapping:

| Acceptance criterion | How |
|---|---|
| Shows avatar, banner, bio, category, free posts, premium previews, subscription price | Profile fields + avatar/banner real; posts/plan sections render empty states (filled by US-019 / US-026) |
| Works without login, no Telegram redirect | Public endpoint (no guard); page fetches without cookies |
| Unknown / unapproved / suspended → not-found | Service query filters `status: APPROVED, user: { status: ACTIVE }`; API 404 → `notFound()` |
| No premium media URLs or tokens in HTML/JSON | Response is the fixed 6-field mapper; avatar/banner are deliberately public profile images (not premium), served by relative URL with no token; exact-keys test |
| Usable at ~375px, loads in IG/TikTok in-app browsers | Mobile-first single column, server-rendered, no third-party scripts |

## Dependencies

- None new. Reuses `CreatorProfileService.toResponse`, `creatorProfileResponseSchema`, `DomainError('NOT_FOUND')`, `API_ORIGIN`, the `/api/v1` rewrite (relative image URLs resolve through the web origin).

## Risks

- **404 status under `cacheComponents`:** `notFound()` after streaming starts gives HTTP 200 + noindex. Fetch the creator in the page body via a `'use cache'` function (no cookies) so `notFound()` runs before the shell streams. Check bundled Next 16 docs (`apps/web/node_modules/next/dist/docs/`) for `params` + `cacheComponents`; record the actual status code observed.
- **Dynamic root segment vs. static routes:** static routes (`/login`, `/studio`, `/admin`, `/become-creator`) win over `[creatorSlug]`; reserved slugs can't be created.
- **Stale profile after edits:** cached for ~1 minute; US-012 edits show up after that. Acceptable for MVP.

## Tasks

### TASK-039: Public creator profile endpoint

**API** — `apps/api/src/modules/creators/` (put it next to the existing public image route; that controller has no class-level guard):

- `creator-profile.service.ts`:

  ```ts
  /** Public profile: APPROVED creator whose user is ACTIVE, else NOT_FOUND (same error for every case). */
  async getPublic(slug: string): Promise<CreatorProfileResponse> {
    const row = await this.prisma.creatorProfile.findFirst({
      where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
    });
    if (!row) throw new DomainError('NOT_FOUND');
    return toResponse(row);
  }
  ```
  with `const PUBLIC_CREATOR = { status: 'APPROVED', user: { status: 'ACTIVE' } } satisfies Prisma.CreatorProfileWhereInput;` and use it in `getPublicImage` too (replacing its `status: 'APPROVED'`).

- `creator-profile.controller.ts`:

  ```ts
  /** Public profile for /{creatorSlug}. */
  @Get(':slug')
  @Header('cache-control', 'public, max-age=60')
  publicProfile(@Param('slug') slug: string): Promise<CreatorProfileResponse> {
    return this.profiles.getPublic(slug);
  }
  ```
  Static `me` route stays first-class (Fastify static beats param; `me` can't be a slug).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/creators/creator-profile.service.ts` | `getPublic(slug)`, `PUBLIC_CREATOR` filter shared with `getPublicImage` |
| MODIFY | `apps/api/src/modules/creators/creator-profile.controller.ts` | public `GET :slug` |
| CREATE | `apps/api/src/modules/creators/public-profile.integration.spec.ts` | tests below |

**Testing** (real Postgres, own fixed user ids, `profileFields()`, cleanup in `afterAll`; boot like `creator-profile.integration.spec.ts` incl. its object-storage override):
- APPROVED + ACTIVE → 200, body keys exactly `slug, displayName, bio, category, avatarUrl, bannerUrl`; `cache-control: public, max-age=60`; no `set-cookie`; works with no cookie.
- Profile with `avatarKey` set → `avatarUrl` = `/api/v1/creators/<slug>/images/<uuid>`.
- Upper-case slug in URL → 200.
- PENDING_REVIEW, REJECTED, APPROVED-but-user-SUSPENDED, unknown → 404 `NOT_FOUND`, identical bodies apart from `requestId`.
- Suspended creator's image URL → 404 (new filter on `getPublicImage`).
- `GET /creators/me` without cookie still 401 (not swallowed by `:slug`).

---

### TASK-040: Public creator page `/{creatorSlug}`

**Data** — `apps/web/src/lib/api/public-creator.ts`:

```ts
/** Server only. Public creator profile, or null on 404. Sends no cookies, so it's cacheable. */
export async function getPublicCreator(slug: string): Promise<CreatorProfileResponse | null>
```
- `fetch(`${API_ORIGIN}/${API_PREFIX}/creators/${encodeURIComponent(slug)}`)`; 404 → null; other non-OK → throw; parse with `creatorProfileResponseSchema`.
- `'use cache'` + `cacheLife('minutes')` per Next 16 docs.

**Page** — `apps/web/src/app/(public)/[creatorSlug]/page.tsx` (server component):
- Await `params`; `getPublicCreator` → null ⇒ `notFound()`.
- `generateMetadata`: title `displayName`, description = bio (≤160 chars) or `"{displayName} di Influency"`.
- Layout (mobile-first, `mx-auto w-full max-w-2xl`, `px-4`):
  - Banner: `<img>` (`object-cover`, `h-32 sm:h-48`, `alt=""`) when `bannerUrl`, else gradient `div`; `aria-hidden` decoration.
  - Avatar: round `<img alt="">` overlapping the banner when `avatarUrl`, else initials (first letters of first two words). Use plain `<img>` with the same `eslint-disable` comment as `studio/profile/profile-image-input.tsx`.
  - `<h1>` display name; `influency.com/{slug}` muted; category badge if set; bio `whitespace-pre-line` if set.
  - `<section aria-labelledby>` "Konten": "Belum ada konten yang dipublikasikan."
  - `<section aria-labelledby>` "Langganan": "Kreator ini belum membuka langganan."
  - Login: the site header already shows "Masuk"; only add a page CTA if the header's link doesn't carry `returnTo` to the current path (check `site-header.tsx`).
- `not-found.tsx` in the same folder: "Kreator tidak ditemukan." + link to `/`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/public-creator.ts` | `getPublicCreator(slug)` |
| CREATE | `apps/web/src/lib/api/public-creator.test.ts` | 200 parse, 404 → null, 500 throws, slug encoded, no cookie header |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` | SSR page + `generateMetadata` |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/not-found.tsx` | not-found UI |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/page.test.tsx` | render tests |

**Testing:**
- Renders `<h1>`, slug line, category, bio; both empty states.
- With images → `<img>` srcs are the relative `/api/v1/creators/...` URLs; without → initials + gradient, no `<img>`.
- Null bio/category → absent, no "null".
- null profile → `notFound()`.
- Manual: `pnpm dev`, `/claudiandreya` at 375px, `/subscriberb` and `/doesnotexist` → not-found, `/login` unaffected; `curl -i` unknown slug, record status.
