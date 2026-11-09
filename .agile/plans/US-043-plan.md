# Technical Plan: US-043 — Profil Saya Page UI

## Architecture Overview

Two product decisions (confirmed) widen this story beyond a pure UI:

1. **Bio:** add a nullable `bio` column on `User` and return it from `GET /auth/me`. Nothing can edit it yet (Edit Profil is a "Perlu konfirmasi" placeholder), so it is empty for everyone for now.
2. **Creators:** `GET /auth/me` also returns `creatorSlug` (the slug of the user's **APPROVED** creator profile, else `null`). `/me` redirects such a user to `/{creatorSlug}`, where the existing owner view (with Edit Profil to the studio) already exists. A pending or rejected applicant is not redirected and sees the normal user profile.

Guests: the story's guest state is unreachable. `src/proxy.ts` is default-deny, so a cookie-less visitor to `/me` is redirected to `/login?returnTo=/me`, and the artboard's "Profilmu ada di sini" screen is not built. The story is edited accordingly (TASK-179).

The Profil tab is active on `/me` via `isTabActive`; after the redirect to a creator's own slug the tab is not active (accepted, noted in the story).

## Dependencies

- Prisma migration (nullable column, no data change).

## Risks

- `meResponseSchema` gains two required nullable fields; every fixture building a `MeResponse` fails typecheck. Mitigation: grep `MeResponse` and `roles: \['USER'` in `apps/web` and `apps/api` and update them (account-drawer tests, current-user tests, admin/studio gate tests).
- A redirect loop if the creator slug page redirected back to `/me`. It does not; no change there.

## Tasks

### TASK-178: `users.bio` column and `GET /auth/me` bio + creatorSlug

- `apps/api/prisma/schema.prisma`: `User` gets `bio String? @map("bio")`. Add a migration `<timestamp>_user_bio` adding `ALTER TABLE users ADD COLUMN bio text` and `CHECK (bio IS NULL OR char_length(bio) <= 500)` (same cap as the creator bio, `creators.ts` line 53). Run `pnpm db:migrate`, then `pnpm --filter @influency/api generate`.
- `packages/shared/src/auth.ts`: `meResponseSchema` adds `bio: z.string().nullable()` and `creatorSlug: z.string().nullable()`.
- `apps/api/src/modules/auth/auth.service.ts` `me()`: select `bio` and `creatorProfile: { select: { status: true, slug: true } }`; return `bio: user.bio` and `creatorSlug: user.creatorProfile?.status === 'APPROVED' ? user.creatorProfile.slug : null`.
- Update every fixture and existing assertion that builds or deep-equals a `MeResponse`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `User.bio` (+ migration) |
| CREATE | `apps/api/prisma/migrations/<ts>_user_bio/migration.sql` | column + CHECK |
| MODIFY | `packages/shared/src/auth.ts` | `bio`, `creatorSlug` |
| MODIFY | `apps/api/src/modules/auth/auth.service.ts` | `me()` |
| MODIFY | existing auth integration specs, web fixtures (grep `MeResponse`) | new fields |
| MODIFY | `.agile/guidelines/codebase-map.md` | `/auth/me` shape, `users.bio` |

**Testing (integration):** a plain user → `bio: null`, `creatorSlug: null`; an APPROVED creator → `creatorSlug` is their slug; a PENDING_REVIEW applicant → `creatorSlug: null`; the CHECK rejects a 501-char bio (direct SQL); the schema-conventions spec still passes.

---

### TASK-179: `/me` page, `ProfileSummary` and "Perlu konfirmasi" notices

**Page** `apps/web/src/app/(public)/me/page.tsx` (replace the stub), `Suspense` + async inner component as in Home:

```tsx
const user = await getCurrentUser().catch(() => null);
if (!user) redirect(loginHref('/me'));
if (user.creatorSlug) redirect(`/${user.creatorSlug}`);
return (<><PageHeader title="Profil" fallbackHref="/" /><ProfileSummary user={user} /></>);
```

**Component** `apps/web/src/components/profile/profile-summary.tsx`: avatar circle with initials (`initialsOf(displayName)`; reuse an existing helper if the drawer/comments already have one, else add `lib/format.ts`), `<h1>` display name, `@username` when present, bio paragraph when present. A secondary button **Edit Profil** opens a `BottomSheet` titled "Edit Profil" with a "Perlu konfirmasi" pill and the text "Apa saja yang bisa diubah belum diputuskan." Below the header a dashed-border panel: pill "Perlu konfirmasi", heading "Isi di bawah header belum diputuskan", text "Aktivitas publik, lencana, dan pembelian tidak ditampilkan sampai ini diputuskan." Nothing else is rendered (no purchases, no activity).

**Story edit (already applied by the Tech Lead; do not redo):** in `US-043-profil-saya-page-ui.md` change the third criterion to "A creator opening `/me` is redirected to their own creator page. A cookie-less visitor is sent to login with `returnTo=/me` by the existing proxy, so no guest profile screen is built." and add to the first: "`GET /auth/me` returns `bio` and `creatorSlug`."

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/me/page.tsx` | real page + redirects |
| CREATE | `apps/web/src/components/profile/profile-summary.tsx` (+ `.test.tsx`) | user header |
| MODIFY | `.agile/features/user-area/US-043-profil-saya-page-ui.md` | AC edit above |
| MODIFY | `.agile/guidelines/codebase-map.md` | page and component |

**Testing:** header shows name / handle / bio; bio hidden when null; Edit Profil opens the sheet with the "Perlu konfirmasi" text; placeholder panel is present and no purchase/activity text renders; page redirects to login when logged out and to `/{slug}` for a creator; a user with `creatorSlug: null` renders the profile; initials fallback for a one-word name.

## Suggested order

TASK-178 → TASK-179.
