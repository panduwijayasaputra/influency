# QA Report: TASK-232 — Preferences endpoints + web wiring

**Story:** US-073
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `GET/PUT /me/notification-preferences` (`SessionGuard`, `no-store`, strict Zod body via `updateNotificationPreferencesSchema`; CSRF via the global guard) in the `notifications` module
- [x] Pure, unit-tested mapping (`notification-preferences.ts`): `TOGGLE_TYPES` (earnings = NEW_SUBSCRIBER + POST_UNLOCKED + TIP_RECEIVED), `toToggles`, `applyPatch`; no toggle exists for TOPUP_CREDITED / PAYOUT_STATUS, and the producer ignores opt-outs for them anyway
- [x] Telegram status: `unavailable` without `TELEGRAM_BOT_TOKEN`, else `connected` / `not_connected` by the linked chat; `allowed` only when linked **and** switched on
- [x] Bot env (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_BOT_WEBHOOK_SECRET`) added here because the status needs it. Empty or the `.env.example` placeholder `SET_LOCALLY` counts as unset: the existing local `.env` has those placeholders and must keep booting. A set token requires the other two.
- [x] Web `lib/api/notification-preferences.ts` calls the API; any error throws, so the toggle rolls back with its toast (US-068)

### Security / Isolation
- [x] Only the session user's row is read or written; `earnings` from a non-creator → 403 `FORBIDDEN` (same APPROVED rule as `ApprovedCreatorGuard`)

### Found and fixed during QA
- **Lost or failing concurrent first saves.** Prisma `upsert` is find-then-create, so two first-time toggles raced on UNIQUE `user_id` (one got a 500). Fixed with `INSERT … ON CONFLICT (user_id) DO NOTHING`, then `SELECT … FOR UPDATE`, then read + write through Prisma. A raw enum array can come back as a `'{…}'` string, so the read goes through the model. The concurrent-toggle test now passes three runs in a row.
- **Spec isolation.** New specs' creators could outrank other specs' creators in `GET /creators/recommended` while running in parallel (one full-suite failure in `recommended-creators.integration.spec.ts`). Every creator in this feature's specs now uses `LEFTOVER_CREATED_AT`, and the producer spec's 3-follower creator is `PENDING_REVIEW` (the fan-out doesn't read creator status). Two consecutive full runs: 1,418/1,418.

## Acceptance Criteria (US-073)

| AC | Result |
|---|---|
| One row per user (UNIQUE), opt-outs + telegramAllowed; defaults without a row | PASS |
| GET/PUT, CSRF, Zod; unknown keys 400; earnings rejected for non-creators | PASS (403) |
| Producers skip opted-out types; transactional types can't be turned off | PASS |
| `telegramAllowed` only effective once linked; API says not connected | PASS |
| US-068 uses the endpoints; tests | PASS |

## Testing

- `notification-preferences.spec.ts` (6): defaults equal the shared defaults; earnings null for non-creators; earnings off when any type is out; patch adds/removes only patched types; earnings types switch together; idempotent, ignores telegramAllowed and keeps transactional entries.
- `notification-preferences.integration.spec.ts` (9): 401; defaults + creator earnings + Telegram unavailable; patch saved, other users untouched; earnings 403/200; unknown key and non-boolean 400; three concurrent toggles all applied; opted-out NEW_POST not produced while TOPUP_CREDITED is; with a bot: not_connected → connected/allowed once a chat is linked.
- `env.spec.ts` (+5): bot off by default and with placeholders; full config accepted; username and secret required with a token; malformed token or secret rejected.
- Web: `notification-preferences.test.ts` (3).
- Full suites: API 117 files / 1,418 tests (twice), web 129 files / 959 tests. ESLint + `tsc` clean.
