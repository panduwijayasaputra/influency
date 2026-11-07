# Technical Plan: US-010 — Creator Profile Header

## Architecture Overview

Agreed with the user (2026-11-07):

- **Web only.** No API, shared-schema or DB change.
- **No stats row.** The "n foto · n video · n pengikut" row is dropped from this story. Bring it back with real counts when home-feed (followers) and a counts API exist.
- `CreatorView` in `apps/web/src/app/(public)/[creatorSlug]/page.tsx` keeps its role: it checks the session, picks the top bar, and streams the feed. The header moves into a new `ProfileHeader` server component. `ProfileHeader` renders the client pieces: `ExpandableText` for the bio and `ProfileActions` for the buttons.
- **Own profile:** only when the viewer has the `CREATOR` role, `CreatorView` calls the existing `getMyCreatorProfile()` and compares `slug`. On a match it shows **Edit Profil** (→ `/studio/profile`) instead of Ikuti / Langganan. Any other viewer skips that call. An error counts as "not owner". The web check is UX only, and the studio guards stay authoritative.
- **Demo subscribed state:** `DEMO_SUBSCRIBED = { slugs: ['creatorb'], daysLeft: 12 }` in `lib/demo.ts`. A signed-in, non-owner viewer on `/creatorb` sees **Berlangganan** with "12 hari lagi (demo)". Delete it when creator subscriptions land (US-026/027).
- `SubscribeCard` (`subscribe-card.tsx`) is replaced by the Langganan button, which opens the same `PurchaseSheet`. The old `influency.com/{slug}` line, the Instagram/TikTok dummy chips and the guest **Masuk** button go. Guests reach login through Ikuti, Langganan and Bagikan, as US-007 requires.

## Dependencies

- None. The pieces used are `PurchaseSheet`, `ShareButton` / `SHARE_BUTTON_CLASS`, `useToast`, `loginHref`, `getMyCreatorProfile`, `initials` and `DEMO_SUBSCRIPTION`.

## Risks

- **An extra `/creators/me` round trip for creator viewers** on every `/{slug}` view. It is limited to the `CREATOR` role and runs inside the existing `Suspense`, so the cached profile is unaffected.
- **Refactoring the PostCard caption onto `ExpandableText`** could change its behaviour. The existing `post-card.test.tsx` caption tests must pass unchanged.

## Tasks

### TASK-095: ExpandableText and the profile header layout

1. **`components/expandable-text.tsx`** (`'use client'`). Move the caption logic out of `PostCard`.
   - Signature: `ExpandableText({ text, href, className }: { text: string; href?: string; className?: string })`.
   - "Long" means `text.length > 120 || text.includes('\n')`. Move `LONG_CAPTION` here and keep the heuristic comment.
   - Paragraph classes: collapsed `line-clamp-2 wrap-break-word whitespace-pre-line`, expanded `wrap-break-word whitespace-pre-line`. Line breaks are kept in both states, and the clamp still cuts at two lines.
   - With `href`, wrap the `<p>` in `<Link href className="block hover:underline">`, as PostCard does today.
   - Show the toggle button only when the text is long. Copy it exactly from PostCard: `aria-expanded`, `Selengkapnya` / `Sembunyikan`, `min-h-11`.
2. **`PostCard`** uses `<ExpandableText text={post.caption} href={postHref} />` inside its existing `px-4 text-sm` wrapper. Drop its local `expanded` / `longCaption` state.
   - Caption change: collapsed captions now also get `whitespace-pre-line`. The existing test asserts `toHaveClass('line-clamp-2')`, which still passes. Keep that test unchanged.
3. **`app/(public)/[creatorSlug]/profile-header.tsx`** (server component).
   - Props: `{ creator: CreatorProfileResponse; actions: ReactNode; editHref?: string }`.
   - Markup, moved from `CreatorView`:
     - Cover: `bannerUrl` image, or the existing gradient.
     - Avatar row (`-mt-10 flex items-end justify-between`): avatar or initials, as today. On the right, an **Edit Profil** link when `editHref` is set: `Button asChild size="sm" variant="outline"`, `<Link href={editHref}>Edit Profil</Link>`.
     - `h1` with the name.
     - A row with `@{slug}` (`text-sm text-muted-foreground`) and then the share slot.
       - Signed in: `ShareButton title={displayName} label="Bagikan profil"`.
       - Guest: `<Link href={login} aria-label="Bagikan" className={SHARE_BUTTON_CLASS}>`.
       - Pass this slot in as a prop, `share: ReactNode`, so the header stays viewer-agnostic.
     - The category chip, unchanged.
     - The bio, through `<ExpandableText text={bio} className="text-sm leading-relaxed" />`.
     - `actions`, after the bio.
   - Remove the `influency.com/` line and the Instagram/TikTok chips.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/expandable-text.tsx` | Two-line clamp + Selengkapnya/Sembunyikan |
| CREATE | `apps/web/src/components/expandable-text.test.tsx` | Unit tests |
| MODIFY | `apps/web/src/components/post-card/post-card.tsx` | Use ExpandableText |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/profile-header.tsx` | Header layout |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` | Render ProfileHeader |

**Testing:**
- `expandable-text.test.tsx`:
  - short single-line text: no button
  - more than 120 characters: shows "Selengkapnya", clamped; click → "Sembunyikan", `aria-expanded=true`, no clamp
  - text with `\n`: has the toggle and keeps the line break (`whitespace-pre-line`)
  - with `href`: the paragraph sits inside a link
- `post-card.test.tsx` passes unchanged.

---

### TASK-096: Ikuti / Langganan / Berlangganan / Edit Profil actions

1. **`lib/demo.ts`**: add
   `/** shortcut: fake "subscribed" state until creator subscriptions exist (US-026/027); read the viewer's subscription from the API then. */ export const DEMO_SUBSCRIBED = { slugs: ['creatorb'], daysLeft: 12 };`
2. **`app/(public)/[creatorSlug]/profile-actions.tsx`** (`'use client'`).
   - Props: `{ creatorName: string; loginHref?: string; subscribedDaysLeft?: number }`.
   - Layout: `grid grid-cols-2 gap-2`, so both buttons are equal width, each `h-12` (≥ 44 px).
   - **Guest** (`loginHref` set): two links, **Ikuti** and **Langganan**, both pointing to `loginHref`.
   - **Ikuti**: `useState(false)`. Click → toggle, then `toast('Segera hadir')`.
     - Label `Ikuti` uses `variant="secondary"` (dark). `Diikuti` uses `variant="outline"`.
     - Add `aria-pressed={following}`.
     - Not saved: it resets on reload.
   - **Langganan**: move the `PurchaseSheet` trigger from `subscribe-card.tsx`: kicker, title, rows, `priceCoins` and `ctaLabel` from `DEMO_SUBSCRIPTION`. The trigger is a primary `Button` labelled `Langganan`, with an `aria-label` `Langganan · {priceCoins} Koin / {days} hari` so the price is announced.
   - **Subscribed** (`subscribedDaysLeft` set): instead of Langganan, an outline button with two lines: **Berlangganan** and, under it, `{n} hari lagi (demo)` in `text-xs text-muted-foreground`. Click → `toast('Segera hadir')`.
3. **`page.tsx` `CreatorView`**:
   ```ts
   const user = await getCurrentUser().catch(() => null);
   const signedIn = user !== null;
   const isOwner =
     user?.roles.includes('CREATOR') === true &&
     (await getMyCreatorProfile().catch(() => null))?.slug === creator.slug;
   ```
   - Owner: `editHref="/studio/profile"`, and `actions` is null.
   - Otherwise: `<ProfileActions creatorName loginHref={signedIn ? undefined : login} subscribedDaysLeft={signedIn && DEMO_SUBSCRIBED.slugs.includes(creator.slug) ? DEMO_SUBSCRIBED.daysLeft : undefined} />`.
   - The guest page still has no `PageHeader` (unchanged). Not-found is unchanged.
4. Delete `subscribe-card.tsx` and remove its import.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/demo.ts` | `DEMO_SUBSCRIBED` |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/profile-actions.tsx` | Ikuti / Langganan / Berlangganan |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/profile-actions.test.tsx` | Unit tests (`wrapper: Toaster`) |
| DELETE | `apps/web/src/app/(public)/[creatorSlug]/subscribe-card.tsx` | Replaced |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` | Owner check, actions wiring |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.test.tsx` | New header expectations |

**Testing:**
- `profile-actions.test.tsx`:
  - Ikuti click → `Diikuti`, `aria-pressed=true`, and the "Segera hadir" toast. A second click goes back to Ikuti.
  - Langganan opens the sheet, with the price and "30 hari".
  - The subscribed case shows "Berlangganan" and "12 hari lagi (demo)", with no Langganan button.
  - Guest: the Ikuti and Langganan links point to `loginHref`.
- `page.test.tsx` (mock `@/lib/api/creator-profile` → `getMyCreatorProfile: vi.fn()`):
  - Signed in: `@claudiandreya`, the "Bagikan profil" button, Ikuti + Langganan, no Edit Profil, no `influency.com/` text.
  - Guest / API outage: no banner. The Ikuti, Langganan and Bagikan links go to `/login?returnTo=%2Fclaudiandreya`. No `Masuk` link, no `Bagikan profil` button.
  - Owner (`roles: ['USER','CREATOR']`, `getMyCreatorProfile` → same slug): an `Edit Profil` link to `/studio/profile`, and no Ikuti or Langganan.
  - A creator viewing someone else's profile (different slug), and a failing `getMyCreatorProfile`: shows Ikuti / Langganan.
  - A `USER` without the role: `getMyCreatorProfile` is not called.
  - `creatorb` signed in: Berlangganan + "12 hari lagi (demo)". As a guest: no Berlangganan.
  - The existing tests still pass: initials/gradient fallback, notFound, metadata.
- Run `pnpm check`.
