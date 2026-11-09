# QA Report: TASK-021 — Trusted proxy for the client IP (`TRUST_PROXY`)

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `TRUST_PROXY` is validated at startup:
  - unset or empty → `false` (today's behaviour)
  - `1`–`5` → hop count
  - a comma-separated list → IPs/CIDRs, validated with `net.isIP` and the prefix length
  - `true` is refused with a clear message
  - invalid values make startup list the variable
- [x] `createFastifyAdapter({ trustProxy })` passes it to Fastify, and `main.ts` passes `env.TRUST_PROXY`. Nest's adapter type has no `number`, so a hop count becomes `(addr, hop) => hop < n`, which is the same semantics as proxy-addr's numeric trust (commented). Tests and other callers keep the default (no trust).
- [x] `.env.example` (commented placeholder), `docs/media-protection.md` and the `rate-limit.guard.ts` comment describe the setting and its precondition.

### Security
- [x] There is no "trust everyone" mode (`true` is rejected).
- [x] The documented precondition: set it only where the edge overwrites `X-Forwarded-For`. The Next proxy keeps a client-sent XFF (`??=`), so otherwise a client could choose its rate-limit key. Access checks don't depend on `req.ip`.

### Code Quality
- [x] There is no change to the guard logic. `keyGenerator` still uses `userId ?? req.ip`.

## Acceptance Criteria Verification
- [x] This supports US-008's lazy media per card: with `TRUST_PROXY` set behind a sanitizing edge, guests no longer share one 60/min media-access bucket.

## Tests Run
- `env.spec.ts`:
  - parses `1`, `127.0.0.1, ::1`, `10.0.0.0/8` and empty
  - rejects `true`, `TRUE`, `abc`, `999.1.1.1`, `0`, `6`, `10.0.0.0/33` and `::1/129`
  - the defaults include `TRUST_PROXY: false`
- New `trust-proxy.integration.spec.ts` (an unknown post, so every call counts and answers 404 until limited):
  - trusted `['127.0.0.1']`: IP A is exhausted → 429, and IP B → 404 (own bucket)
  - hop count `1`: the same
  - no trust: after A is exhausted, B → 429 (a shared bucket, today's behaviour pinned)
- `pnpm check` green: shared 212, web 385, api 643.

## Notes
- **Not verified end-to-end:** that the API receives the browser's IP through `next dev` (web proxy → API). The Next source sets `x-forwarded-for` from the socket address when absent, and the rewrite forwards headers, but this wasn't exercised with both servers running. Check it in UAT or at deploy time. It only matters when `TRUST_PROXY` is set.
