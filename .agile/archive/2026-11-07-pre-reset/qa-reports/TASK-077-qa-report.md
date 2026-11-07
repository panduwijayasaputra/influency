# QA Report: TASK-077 — Rejection reason, error code and env settings

**Story:** US-049
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Schema change ships with a migration (`20261104130000_media_rejection_reason`): enum `media_rejection_reason`, nullable `media_assets.rejection_reason`, index `(status, upload_expires_at)`, hand-added CHECK `media_assets_rejection_reason_status` (`rejection_reason IS NULL OR status = 'REJECTED'`). Snake_case mapping; schema-conventions spec green.
- [x] Shared contract: `MEDIA_REJECTION_REASONS` / `MediaRejectionReason`, `studioMediaSchema.rejectionReason` (nullable enum); new error code `VIDEO_TOO_LONG` (422, Bahasa message) in `ERRORS`.
- [x] Env: `VIDEO_PROCESSING_TIMEOUT_SECONDS` (TBD placeholder, 600–86400, default 7200), `MEDIA_SWEEP_INTERVAL_SECONDS` (0–3600, default 300, 0 = off), optional `CLOUDFLARE_STREAM_WEBHOOK_SECRET`; documented in `.env.example`; tests run with the sweep off.

### Security
- [x] `.env.example` leaves the webhook secret **commented out**: any value enables the webhook endpoint, so a published placeholder would be a known secret.
- [x] No secrets or URLs added to responses or logs.

### Financial Integrity
- N/A

### Code Quality
- [x] Error messages stay static strings, with a comment pointing at the limit constants (avoids a shared import cycle; the plan allows this).
- Note: `migrate dev` first produced an empty migration (run before the schema edit). It was removed and its dev-DB `_prisma_migrations` row deleted (it changed nothing). The real migration was renamed so it sorts after `20261104120000_post_covers`.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Limits are configurable placeholders | Partial (by design) | Size/duration stay labeled TBD shared constants; enforcement on READY is TASK-078 |
| 2 | Failed uploads marked failed | Foundation | Reason column + timeout setting; behavior in TASK-078 |
| 3–5 | — | — | TASK-078 to TASK-080 |

## Test Results

- `packages/shared`: 187 passed (new `studioMediaSchema rejectionReason` cases: null + each reason accepted, unknown rejected)
- `apps/api` `env.spec.ts`: 53 passed (defaults, sweep 0 accepted, bounds rejected)
- `apps/api` posts module + schema conventions: 133 passed (key-list assertion updated for `rejectionReason`)
- `pnpm typecheck`: pass; `apps/web` tests: 171 passed (fixtures updated)
- The DB CHECK test lives in the TASK-078 spec.
