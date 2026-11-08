# QA Report: TASK-156 — Midtrans notification endpoint

**Result: PASS**

- `POST /api/v1/webhooks/payments/midtrans`: no session (so the global CSRF guard does not apply — tested without cookie or Origin), body validated by the Zod notification schema (loose, 400 on a bad shape), IP rate limit 300/min. Flow: store event → verify `signature_key` (constant time) → `applyProviderStatus` → record outcome → 200 `{ ok: true }`.
- Bad signature: 401 `PAYMENT_VERIFICATION_FAILED` (status code changed 400 → 401; nothing else used it), attempt stored with `signature_valid=false`, order untouched. A forged copy with a bad signature does not block the real delivery (fingerprint excludes the signature).
- Wrong amount with a valid signature: 200, quarantined, status page shows `UNDER_REVIEW`, no credit. Unknown order: 200 `UNKNOWN_ORDER` (dashboard test pings).
- Storage failure → 500 so Midtrans retries (spy on the insert); the order is unchanged.
- Duplicates: the same notification 10× concurrently → all 200, one credit, one event row; capture then settlement → one credit. Browser return with `?transaction_status=settlement` credits nothing.
- 10 HTTP tests; api typecheck/lint clean; docs/payments.md already documents the URL and signature rule.
