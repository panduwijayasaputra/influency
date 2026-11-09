# QA Report: TASK-062 — Pure post access rule + unit tests

**Story:** US-020
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Pure function in `apps/api/src/modules/entitlements/post-access.ts`, one `if` per rule step, shared `PostStatus`/`PostVisibility` types (same import as `posts.service.ts`)
- [x] ESM, no classes/options; JSDoc names the US-050 extension point

### Security
- [x] Inputs are DB facts + a session-derived viewer only; no client flag can reach the rule
- [x] Order is safe: REMOVED is checked before ownership, so an owner can't see a takedown; non-PUBLISHED / non-public creator → `hidden` (404, no existence leak)

### Financial Integrity
- N/A (no money movement)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | One check: published AND free, or owner; premium denied | PASS | PUBLISHED PREMIUM for non-owner → `locked` |
| 2 | Owner sees own drafts/archived; public never sees draft/archived/removed | PASS | Table tests per status |
| 3 | Removed denied except admins | PASS | Owner → `hidden`, admin → `full` |
| 4 | Server time, no client flags | PASS | No time-based rule yet; signature takes no request data (US-050 adds a server `now`) |
| 5 | Unit tests: free, premium-denied, owner, archived, draft, removed | PASS | `post-access.spec.ts`, 17 tests |

## Tests Run

- [x] `vitest run src/modules/entitlements/post-access.spec.ts`: 17 passed
- [x] Full `pnpm check`: exit 0

## Issues (if any)

None.
