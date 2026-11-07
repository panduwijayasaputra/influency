# QA Report: TASK-029 — Creator profile application columns, constraints and seed

**Story:** US-010
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Schema change ships with a migration (`20261103024134_creator_applications`); no applied migration edited
- [x] Conventions: snake_case via `@map`, `Timestamptz(3)`; `schema-conventions.integration.spec.ts` still passes
- [x] Seed step stays idempotent (upsert by fixed id; `agreementAcceptedAt` only set on create)

### Security
- [x] Slug rules enforced by DB too: `CHECK (slug = lower(slug))` + `CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$')` (same regex as shared `SLUG_PATTERN`). With the existing `UNIQUE(slug)`, case variants cannot coexist

### Financial Integrity
- N/A

### Code Quality
- [x] Migration hand-edited to add nullable → backfill from `users.display_name` / `created_at` → `SET NOT NULL`; verified on the local dev DB with the 2 seeded rows (applied cleanly) and on the empty test DB (global setup re-migrates)
- [x] New `apps/api/test/creator-profile.ts` (`profileFields()`) supplies the required columns in specs instead of repeating them

**Deviation from plan:** DB constraint tests were added to the existing `roles-schema.integration.spec.ts` (which already tests `creator_profiles` uniqueness) instead of a new `creator-profiles-schema.integration.spec.ts`.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Collects display name, slug, bio/category, agreement | PASS (storage) | `display_name`, `bio`, `category`, `agreement_version`, `agreement_accepted_at` |
| 2 | Lowercase, permitted chars, unique case-insensitively | PASS (DB) | CHECKs reject `Roles-Spec-Upper`, `a.b`, `-ab`, `ab`, `admin ` |
| 3 | Reserved names rejected | — | App-level (TASK-028/030) |
| 4 | PENDING_REVIEW, one application per user | PASS (DB) | default status + `UNIQUE(user_id)` (existing test) |

## Tests Run

- [x] `pnpm --filter @influency/api test`: 17 files, 168 passed (incl. seed spec asserting display names, guard/me specs with new required fields)
- [x] api typecheck, lint, prettier: pass
- [x] `pnpm db:seed` on the migrated dev DB: pass
