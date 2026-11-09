# QA Report: TASK-213 — Payout accounts service, controller and web wiring

**Result:** PASS (2026-11-09)

## Checked
- Endpoints (`ApprovedCreatorGuard`, global CSRF, strict body `payoutAccountInputSchema`): `GET /me/payout-accounts` (active first, then oldest; deleted excluded), `POST /me/payout-accounts` (201), `POST /me/payout-accounts/:id/activate` (200, whole list), `DELETE /me/payout-accounts/:id` (204). Writes are rate-limited (10/min per creator, a [TBD] example): the 11th write answers 429.
- Rules: the first account is always active; a later one only when `makeActive`; a 4th → 409 `PAYOUT_ACCOUNT_LIMIT` (deleted accounts do not count); activating moves the single active flag; the active (and therefore the only) account cannot be deleted → 409 `PAYOUT_ACCOUNT_ACTIVE`; delete is a soft delete (the row stays with `deleted_at`, because payouts reference it).
- Concurrency (the partial unique index is the backstop; every write first locks the creator row): 8 parallel creates with `makeActive` → exactly 3 accounts and 1 active; 3 parallel activations → 1 active; an activation racing a delete of the same account never leaves an active, deleted account.
- Encryption: the stored value is ciphertext (`v1:…`), `last4` is stored separately, `decryptField` with the test key and the creator id returns the number, and the same ciphertext does not open under another creator. Responses contain exactly `id, bankCode, bankName, last4, holderName, active, createdAt`: no `accountNumber*` key and no digit sequence of the number appears in any response or in a 400 body. Request bodies are not logged (the request log keeps method and path) and the plain number never reaches Prisma.
- Validation → 400 `VALIDATION_FAILED`: 5 or 21 digits, letters, unknown bank, empty or over-long holder, extra key; spaces in the number are ignored. Isolation: another creator's account and an unknown id → 404 (nothing changes), malformed id → 400; guest 401; non-creator 403 `CREATOR_NOT_APPROVED`; cross-site `Origin` and a missing `Origin` (with the cookie) → 403.
- `activeInTx(tx, creatorProfileId)` is exported for the payout request (US-063).
- Web: `lib/api/payout-accounts.ts` is real (`GET`, `POST`, `POST …/activate`, `DELETE` with the empty 204 handled in the shared request helper). The in-memory dummy is gone; page and payout-dummy tests use a test-only fake (`src/test-support/payout-accounts-fake.ts`) that follows the same rules.
- Full `pnpm check` passes twice: shared 306, API 1262 (102 files), web 885 (116 files).

## Fixed during QA
- My "no Origin" test helper used a default parameter, so passing `undefined` silently sent a valid Origin; it now uses an explicit `null`.

## Notes
- The malformed-id case answers 400 (the shared uuid pipe, like the other studio routes), not 404 as the plan assumed.
- Rate limits are in-memory per process (existing shortcut for all rate limits); move to the Redis store with the others.
