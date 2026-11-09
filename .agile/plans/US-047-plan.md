# Technical Plan: US-047 — My Subscriptions List API

## Architecture Overview

`GET /api/v1/me/subscriptions` (signed in, `no-store`) lists the caller's active creator subscriptions. Read-only, no locking; user id from the session only. It lives in the `subscriptions` module (new `MySubscriptionsService` + controller on `@Controller('me')`), and reads `subscription_periods` the same way `PaidAccessService` does: server time from `dbNow(prisma)` (`common/db-time.ts`), never the client's.

State comes from timestamps, never a stored status (see the `SubscriptionPeriod` model comment):
- **active** = `canceledAt IS NULL AND startsAt <= now AND endsAt > now`;
- **scheduled** = `canceledAt IS NULL AND startsAt > now`.

Query: one `subscriptionPeriod.findMany({ where: { userId, canceledAt: null, endsAt: { gt: now }, creatorProfile: PUBLIC_CREATOR }, select: { creatorProfileId, startsAt, endsAt, creatorProfile: { select: { slug, displayName, bio, avatarKey, bannerKey } } } })`. In memory, group by creator: a creator is listed only if it has an active period; `endsAt` = the latest `endsAt` among that creator's active periods (normally exactly one); `hasScheduledRenewal` = the creator has a scheduled period. `daysLeft = Math.max(1, Math.ceil((endsAt - now) / 86_400_000))`. Order by `endsAt` ascending, then slug. A cancelled scheduled renewal has `canceledAt` set, so it is excluded and clears the flag with no extra code.

Only the caller's own dates and the public creator shape are returned. No price snapshot beyond what the story needs, no subscriber counts or earnings. (The story says "own plan price snapshot"; the UI does not show it, so it is left out. Do not add it.)

Bound: `take: 200` periods with a `// shortcut: 200 live periods per user is far above one active subscription per creator; paginate if users ever follow that many` comment.

## Dependencies

- US-042 (schemas, dummy fetch, `daysLeftLabel`). Existing `SubscriptionPeriod` data from the purchases feature.

## Risks

- Boundary at `endsAt == now` (expired: `gt` excludes it) and `startsAt == now` (active). Mitigation: explicit boundary tests with a controlled clock (insert periods relative to DB time).
- `PUBLIC_CREATOR` import creates a module cycle. Mitigation: import the constant from `creators/creator-profile.service.js` as `PaidAccess`/others already do, not the whole module.

## Tasks

### TASK-188: `GET /me/subscriptions` (service, controller, tests)

- `apps/api/src/modules/subscriptions/my-subscriptions.service.ts`: `MySubscriptionsService.list(userId): Promise<MySubscriptionList>` as above, returning `mySubscriptionSchema` objects (`creator` via `imageUrl(slug, key)` for avatar/banner, `endsAt` ISO, `daysLeft`, `hasScheduledRenewal`).
- `apps/api/src/modules/subscriptions/my-subscriptions.controller.ts`: `@Controller('me') @UseGuards(SessionGuard)`, `@Get('subscriptions') @Header('cache-control','no-store')`. Register both in `subscriptions.module.ts` (it already has `PrismaService`; add what is needed to resolve `dbNow`).
- Confirm the route does not collide with `GET /creators/:slug/subscription`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/subscriptions/my-subscriptions.service.ts` | list logic |
| CREATE | `apps/api/src/modules/subscriptions/my-subscriptions.controller.ts` | `GET /me/subscriptions` |
| MODIFY | `apps/api/src/modules/subscriptions/subscriptions.module.ts` | register |
| CREATE | `apps/api/src/modules/subscriptions/my-subscriptions.integration.spec.ts` | integration tests |
| MODIFY | `.agile/guidelines/codebase-map.md` | endpoint row |

**Testing** (real Postgres; reuse the helpers from `subscribe.integration.spec.ts` / `cancel-scheduled.integration.spec.ts` to create periods):
- Guest → 401; user A never sees B's subscriptions.
- Active period listed with correct `daysLeft` (e.g. 12 days → 12; 2 hours left → 1); expired (`endsAt <= now`) not listed; period with `startsAt == now` listed; scheduled-only never listed.
- Active + prepaid scheduled period → one row, `hasScheduledRenewal: true`; after the scheduled one is cancelled (`canceledAt` set) → `false`.
- Two creators → both listed, ordered by soonest `endsAt`; two subscriptions from different creators are independent.
- Suspended / unapproved creator excluded.
- Response keys are exactly the public shape (no price, no counts).

---

### TASK-189: Swap the Langganan UI to the real API

- `apps/web/src/lib/api/my-subscriptions.ts`: replace the dummy body with `fetch('/api/v1/me/subscriptions', { credentials: 'include' })`, throw on `!res.ok`, parse with `mySubscriptionListSchema`. Remove the dummy.
- `SubscriptionsView` needs no change if TASK-177 followed the plan; verify the copy for `daysLeft === 1` and the scheduled-renewal pill against real data.
- Update `my-subscriptions.test.ts` to mock `fetch`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/my-subscriptions.ts`, `my-subscriptions.test.ts` | real client |
| MODIFY | `.agile/guidelines/codebase-map.md` | remove "dummy" note |

**Testing:** non-OK throws; schema parse failure throws; manual run: subscribe to a demo creator (sandbox Koin), see "Aktif · 30 hari lagi" on `/subscriptions`; buy the early renewal, the pill appears; cancel it, the pill goes away.

## Suggested order

TASK-188 → TASK-189.
