# QA Report: TASK-022 — Shared `safeReturnTo` sanitizer

**Story:** US-008
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Lives in `packages/shared` (`return-to.ts`), exported from `index.ts`; ESM `.js` import suffix
- [x] Pure function, no `any`; accepts `unknown` so callers can pass raw query values

### Security
- [x] Only same-origin relative paths pass: must start with `/`, not `//`; `\`, whitespace, control chars and non-ASCII are rejected; `new URL(v, base)` origin check as a final guard
- [x] `/login*` and `/api*` (segment-based, after URL normalisation, so `/./login` is caught) fall back to `/`
- [x] Returns the original string, never a re-serialised value

**Plan deviation (intentional):** the plan rejected only control chars and `\`. The implementation allows printable ASCII only (`/[^\x21-\x7E]|\/`). Non-ASCII in a `Location` header makes Node throw (a 500 on the callback), and browsers send paths percent-encoded anyway. This also avoids an `eslint-disable` for `no-control-regex`.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 2 | Only same-origin relative paths; else home (no open redirect) | PASS | Sanitizer level; API wiring in TASK-023 |

## Tests Run

- [x] `pnpm --filter @influency/shared test`: 50 passed (new `return-to.test.ts`)
- [x] `pnpm --filter @influency/shared lint` / `typecheck` / `build`: PASS
- [x] Edge cases: `//evil.com`, `/\evil.com`, `/\t/evil.com`, `javascript:`, absolute URLs, arrays/non-strings, 512 vs 513 chars, `/loginx` / `/apiary` kept, `/a b`, `/kreator/€`

## Issues

None.
