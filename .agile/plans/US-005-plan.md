# Technical Plan: US-005 — Right Account Drawer

## Architecture Overview

- **API: Telegram username.** Store Telegram's `preferred_username` claim as a nullable `auth_identities.username`, refresh it on every login, and return it as `username: string | null` from `GET /auth/me`.
  - The username is display-only. Identity stays `(provider, provider_sub)`.
  - The current login already requests `scope: 'openid profile'`. Per the official docs (https://core.telegram.org/bots/telegram-login#available-scopes, checked 2026-11-07), `profile` returns `id`, `name`, `preferred_username` and `picture`.
- **Web: `AccountDrawer`** (`components/account-drawer.tsx`, client) is a right-side panel on Radix `Dialog`, the same primitive `BottomSheet` uses.
  - Radix provides the backdrop, closing on Escape and on a backdrop tap, the focus trap, returning focus to the trigger, and a scroll lock that keeps the page position.
  - The trigger is the burger button.
  - The slide uses the tw-animate `slide-in-from-right` classes with `motion-reduce:animate-none`, as `BottomSheet` does.
- **Wiring.** `HomeTopBar` takes an `account` slot that replaces its interim `/me` burger link. Home passes a streamed server component, `AccountEntry`:
  - It reads `getCurrentUser()`, treating an API outage as logged out, the same rule `UserMenu` uses.
  - Signed in: `<AccountDrawer user={user} />`.
  - Guest: a burger link to `/login` (US-007 later redirects guests away from Home).
- **Removals.**
  - `AccountMenu`, `UserMenu` and their tests are deleted, plus `KoinBalance` if nothing else uses it.
  - `/me` drops the interim account entry.
  - `useLogout` lands on `/login` instead of `/`.
- **New `/following` placeholder** for "Diikuti", with `following` added to the reserved slugs.

Decisions agreed with the user (2026-11-07):
- **@username** is the Telegram username (stored, nullable). The line is hidden when there is none.
- **Studio** (approved creators) and **Admin** (admins) items are added on top of the AC list, so these areas stay reachable once the old menu is gone.

Item order (AC 1–10 plus the two agreed additions), with labels and targets:
1. Header: avatar (initials, same style as the old `AccountMenu`), `displayName`, and `@username` when not null.
2. Koin card: a "Demo" badge, `DEMO_KOIN_BALANCE` Koin, and **Beli Koin** → `/wallet`.
3. **Profil Saya** → `/me`.
4. **Studio** → `/studio` (CREATOR). *(added)*
5. **Penghasilan** → `/studio/earnings` (CREATOR).
6. **Jadi Creator** → `/become-creator` (not CREATOR).
7. **Koleksi Saya** → `/library`.
8. **Diikuti** → `/following`.
9. **Langganan** → `/subscriptions`.
10. **Pengaturan** → `/account/settings`.
11. **Admin** → `/admin` (ADMIN). *(added)*
12. **Keluar** → logout → `/login`.

## Dependencies

None new. The tools already in the repo are enough: `radix-ui` (`Dialog`), `tw-animate-css`, `lucide-react`, and Prisma migrations.

## Risks

- **Username claim absent or odd.** The docs don't say whether `preferred_username` is always present. Parse it leniently: a missing or malformed value becomes `null` and never fails login. Validate it as `^[A-Za-z0-9_]{1,64}$`; Telegram usernames are 5–32 chars of `[A-Za-z0-9_]`, and 64 leaves headroom. React renders it as text.
- **Existing users have `username = null`** until their next login. Accepted; the line is simply hidden. Dev login and the seed leave it null.
- **Home becomes a partial prerender** because `AccountEntry` reads the cookie. It is wrapped in `<Suspense>` with a same-size placeholder, so the bar doesn't shift.
- **`picture` is not stored.** The avatar uses initials. Storing Telegram photo URLs (hotlinking `telesco.pe`) is out of scope.
- **Logout is reachable only from the drawer on Home.** It is no longer on `/me`. Every signed-in user can reach Home, so this is acceptable.

---

## Tasks

### TASK-012: Telegram username on auth identities and `/auth/me`

1. **Schema.** In `apps/api/prisma/schema.prisma`, add `username String?` to `AuthIdentity`, with the doc comment `/// Telegram preferred_username: display only, refreshed on each login; never used to match identities.`.
   - Create the migration with `pnpm db:migrate --name auth_identity_username`. It adds the nullable column `ALTER TABLE auth_identities ADD COLUMN username TEXT;`. No CHECK is needed, because the API validates the value.
   - Then run `pnpm --filter @influency/api generate`.
2. **OIDC client** (`apps/api/src/modules/auth/telegram-oidc.client.ts`):
   - `claimsSchema`: add `preferred_username: z.string().regex(/^[A-Za-z0-9_]{1,64}$/).optional().catch(undefined)`. A bad value is dropped and doesn't fail validation.
   - `VerifiedTelegramIdentity` gets `username: string | null`, and `verifyIdToken` returns `username: claims.data.preferred_username ?? null`.
3. **Login** (`auth.service.ts`, `findOrCreateUser({ sub, name, username })`):
   - New identity: `authIdentity.create` with `username`.
   - Existing identity: if `existing.username !== username`, run `authIdentity.update({ where: { id: existing.id }, data: { username } })` before returning. Telegram usernames change, so this refresh is intentional, and a `null` claim clears the column.
   - The concurrent-first-login P2002 path stays as it is. The winner's row keeps its username, and the next login refreshes it.
4. **`me()`**: select `authIdentities: { where: { provider: 'TELEGRAM' }, select: { username: true }, take: 1 }` and return `username: user.authIdentities[0]?.username ?? null`.
5. **Shared** (`packages/shared/src/auth.ts`): add `username: z.string().nullable()` to `meResponseSchema`.
   - Update `auth.test.ts`: the valid fixtures get `username: 'ana'` and `username: null`, and an object missing `username` is rejected.
   - Rebuild shared.
   - Grep `apps/web/src` and `apps/api` for `MeResponse` fixtures and object literals (`displayName: '…', roles:`), and add `username` where the type requires it.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration `auth_identity_username`) | nullable `username` |
| MODIFY | `apps/api/src/modules/auth/telegram-oidc.client.ts` (+ spec) | parse `preferred_username` leniently |
| MODIFY | `apps/api/src/modules/auth/auth.service.ts` | store and refresh username, return it from `me()` |
| MODIFY | `apps/api/src/modules/auth/auth.integration.spec.ts`, `me.integration.spec.ts` | username cases |
| MODIFY | `packages/shared/src/auth.ts` (+ test) | `username` in `MeResponse` |

**Testing** (real Postgres integration via the existing auth spec helpers; the fake OIDC server signs the claims passed to `login(agent, claims)`):
- First login with `preferred_username: 'ana_01'`: `GET /auth/me` returns `username: 'ana_01'`.
- A second login for the same `sub` with `preferred_username: 'ana_new'` updates the value. A third login without the claim gives `username: null`. In all three, the user id is unchanged.
- `preferred_username: 'bad name!'` (malformed): login succeeds and `username` is `null`.
- The existing "never matches by name or username" test still passes: same username, different `sub`, different users.
- `me()` for a dev-login or seeded user (no username) returns `username: null`.
- Unit test (`telegram-oidc.client` spec, if it exists): the claims parse keeps a valid username and drops an invalid one.

---

### TASK-013: AccountDrawer component, logout to `/login` and `/following` placeholder

1. **`apps/web/src/components/account-drawer.tsx`** (`'use client'`): `export function AccountDrawer({ user }: { user: MeResponse })`.
   - **Root:** `Dialog.Root` holds its own `open` state (`useState`) so tests can check it closes. `Dialog.Trigger asChild` is a `<button type="button" aria-label="Buka menu akun">` with the `Menu` icon.
     - Export `ICON_BUTTON_CLASS` from `home-top-bar.tsx` (rename the current `ICON_CLASS`) and reuse it here, so the burger looks the same.
     - Radix sets `aria-expanded` and returns focus to this trigger on close.
   - **Overlay:** `<Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />`, the same as `BottomSheet`. A backdrop tap closes the drawer (Radix default).
   - **Content:** `<Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl duration-200 focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right motion-reduce:animate-none">`.
   - **Header row:** `flex items-center justify-between px-4 h-14`. It holds `<Dialog.Title className="text-base font-bold">Akun</Dialog.Title>` and `<Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Tutup"><X/></Button></Dialog.Close>`.
   - **Scroll area:** `<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">`. This lets the content scroll at small heights (AC: 320–430 px).
   - **Profile block:**
     - Avatar: `size-14 rounded-full bg-primary text-primary-foreground font-extrabold`, showing `initials(displayName)`, `aria-hidden`.
     - Name: `font-bold truncate`.
     - `{user.username && <p className="text-sm text-muted-foreground truncate">@{user.username}</p>}`.
   - **Koin card:** `rounded-xl border border-koin-border bg-koin-surface p-3 flex items-center gap-3`, containing:
     - `KoinIcon`
     - `<p className="font-bold text-koin-foreground">{DEMO_KOIN_BALANCE} Koin</p>`
     - the "Demo" badge (`rounded-full bg-card px-2 text-xs font-bold text-koin-foreground`)
     - `<Button asChild size="sm" className="ml-auto"><Link href="/wallet" onClick={close}>Beli Koin</Link></Button>`
     - Comment: `// shortcut: demo balance until koin-wallet; read GET /wallet then.`
   - **Nav:** `<nav aria-label="Menu akun"><ul>`. The items follow the order in the Architecture Overview (`Profil Saya` … `Admin`), each a `Link` row (`flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring`) with a lucide icon:
     - `UserRound`, `LayoutDashboard`, `ChartNoAxesColumn`, `Sparkles`, `Bookmark`, `Users`, `Star`, `Settings`, `ShieldCheck`
     - Role gates: `const creator = user.roles.includes('CREATOR')`, `const admin = user.roles.includes('ADMIN')`.
     - Every link calls `onClick={() => setOpen(false)}`, so the drawer closes on navigation.
   - **Keluar:** a separator, then a `<button>` row with the `LogOut` icon. `const { logout, pending, failed } = useLogout()`.
     - The label is `pending ? 'Keluar…' : 'Keluar'`, and the button is `disabled={pending}`.
     - On `failed`, show `<p role="alert" className="px-3 text-sm text-destructive">Gagal keluar. Silakan coba lagi.</p>`.
     - The drawer stays open while pending or failed.
2. **`use-logout.ts`:** `router.replace('/')` becomes `router.replace('/login')`.
3. **`/following`:** create `apps/web/src/app/(public)/following/page.tsx`: `ComingSoon title="Diikuti" description="Creator yang kamu ikuti akan muncul di sini."`, with `metadata = { title: 'Diikuti' }`.
   - Add `'following'` to `RESERVED_SLUGS` in `packages/shared/src/creators.ts` and rebuild shared.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/account-drawer.tsx` | the drawer |
| CREATE | `apps/web/src/components/account-drawer.test.tsx` | behaviour and items |
| MODIFY | `apps/web/src/components/home-top-bar.tsx` | export `ICON_BUTTON_CLASS` |
| MODIFY | `apps/web/src/components/use-logout.ts` | land on `/login` |
| CREATE | `apps/web/src/app/(public)/following/page.tsx` | Diikuti placeholder |
| MODIFY | `packages/shared/src/creators.ts` | reserve `following` |

**Testing** (`account-drawer.test.tsx`; mock `next/navigation` `useRouter` → `{ replace, refresh }`, and stub `fetch`):
- Closed by default. Clicking "Buka menu akun" opens a `dialog` named "Akun", and the trigger has `aria-expanded="true"`.
- Escape closes it, and focus returns to the trigger. "Tutup" closes it.
- USER `{ username: 'ana' }`: the name and "@ana" are shown. The links in order are Profil Saya `/me`, Jadi Creator `/become-creator`, Koleksi Saya `/library`, Diikuti `/following`, Langganan `/subscriptions`, Pengaturan `/account/settings`. There is no Studio, Penghasilan or Admin.
- CREATOR + ADMIN: Studio `/studio` and Penghasilan `/studio/earnings` are present, Jadi Creator is absent, and Admin `/admin` is present.
- `username: null`: no "@" line.
- Koin card: "Demo", `DEMO_KOIN_BALANCE` Koin, and Beli Koin → `/wallet`.
- Clicking a nav link closes the dialog.
- Keluar: `fetch` returns ok → `replace('/login')` and `refresh()`. `fetch` returns 500 → the alert "Gagal keluar…" shows and the dialog stays open.
- `creators.test.ts` covers `following` through the existing `it.each`.

---

### TASK-014: Drawer on the Home top bar, remove old account menu, guidelines

1. **`HomeTopBar`**: add the prop `account?: ReactNode` and render `{account ?? <GuestBurger />}` in place of the `/me` link. Remove the `shortcut:` comment.
   - `GuestBurger` is a `Link href="/login" aria-label="Masuk"` with the `Menu` icon and `ICON_BUTTON_CLASS`.
   - Export `GuestBurger` for `AccountEntry`.
2. **`AccountEntry`** (`components/account-entry.tsx`, server, async):
   ```tsx
   export async function AccountEntry() {
     // An API outage must not break Home: show the guest entry instead.
     const user = await getCurrentUser().catch(() => null);
     return user ? <AccountDrawer user={user} /> : <GuestBurger />;
   }
   ```
3. **Home** (`app/page.tsx`): `header={<HomeTopBar account={<Suspense fallback={<span aria-hidden className="size-11" />}><AccountEntry /></Suspense>} />}`, with the comment `reads the session cookie, so it streams in`.
4. **Remove the old menu.**
   - Delete `components/account-menu.tsx`, `account-menu.test.tsx`, `user-menu.tsx` and `user-menu.test.tsx`.
   - `/me` (`app/(public)/me/page.tsx`): drop the `Suspense`/`UserMenu` children, so it is a plain `ComingSoon`.
   - `koin.tsx`: if `KoinBalance` has no remaining importers (grep), delete it and its test cases. Keep `KoinIcon`.
5. **Docs.**
   - Add `following` to the reserved lists in `CLAUDE.md` and `frontend.md`.
   - `frontend.md` "App shell": the account entry is `AccountDrawer`, which opens from the Home top bar. Don't reintroduce a header account menu.
   - `codebase-map.md` (updated at story completion):
     - `auth_identities.username`, and `username` in `/auth/me`
     - `AccountDrawer` and `AccountEntry`
     - the `/following` route
     - removal of AccountMenu and UserMenu
     - logout → `/login`

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/home-top-bar.tsx` (+ test) | `account` slot, `GuestBurger` |
| CREATE | `apps/web/src/components/account-entry.tsx` (+ test) | server user → drawer or guest |
| MODIFY | `apps/web/src/app/page.tsx` (+ test) | mount AccountEntry in Suspense |
| MODIFY | `apps/web/src/app/(public)/me/page.tsx` | drop interim UserMenu |
| DELETE | `components/account-menu.tsx` (+ test), `components/user-menu.tsx` (+ test) | replaced by the drawer |
| MODIFY | `apps/web/src/components/koin.tsx` | drop `KoinBalance` if unused |
| MODIFY | `CLAUDE.md`, `.agile/guidelines/frontend.md` | reserved `following`, account entry rule |

**Testing:**
- `home-top-bar.test.tsx`: the last control without `account` is the "Masuk" link to `/login`. With `account={<button>X</button>}`, it renders X instead.
- `account-entry.test.tsx` (mock `@/lib/api/current-user`):
  - a user → the "Buka menu akun" button
  - `null` → the "Masuk" link to `/login`
  - a rejected promise → "Masuk"
- `app/page.test.tsx`: still h1 "Beranda" and the Cari link. Mock `getCurrentUser` with a pending promise, so the Suspense fallback renders.
- `pnpm check` green, and `pnpm --filter @influency/web build` succeeds, with `/` as a partial prerender and `/following` present.
- Manual check at 320, 375, 390 and 430 px:
  - The drawer fits the viewport and its list scrolls at a short height.
  - The backdrop, X and Esc each close it, and focus goes back to the burger.
  - The page behind keeps its scroll position.
  - Keluar lands on `/login`.
