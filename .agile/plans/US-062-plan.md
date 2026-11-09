# Technical Plan: US-062 — Payout Accounts API

## Architecture Overview

`PayoutAccountsService` + `PayoutAccountsController` in the `payouts` module, over `creator_payout_accounts` (TASK-209).

- **Account numbers are encrypted at rest** (decision 2026-11-09): AES-256-GCM via `node:crypto` with the required env key `PAYOUT_ACCOUNT_ENC_KEY` (base64, 32 bytes). The stored value is `v1:<base64 iv>:<base64 tag>:<base64 ciphertext>`, and `last4` is stored in clear for display. The API never decrypts in this feature; decryption exists only as a tested helper for the admin feature.
- **Serialization:** every write locks the creator row first (`SELECT id FROM creator_profiles WHERE id = $1 FOR UPDATE`), so the count limit and the active swap are race-free. The partial unique index (TASK-209) is the backstop.
- **Endpoints** (`@UseGuards(ApprovedCreatorGuard)`; CSRF global; rate limit writes with `RateLimitGuard` at 10/min, TBD constant `PAYOUT_ACCOUNT_RATE_LIMIT`):
  - `GET /me/payout-accounts` → `{ accounts }`, non-deleted, active first then oldest first, `no-store`.
  - `POST /me/payout-accounts` body `payoutAccountInputSchema` → 201 `PayoutAccount`.
    - Lock; count non-deleted; ≥ 3 → 409 `PAYOUT_ACCOUNT_LIMIT`.
    - `active = count === 0 || makeActive`; if active, set the other rows `active=false` first; insert `{ bankCode, accountNumberEnc: encrypt(number), last4: number.slice(-4), holderName, active }`.
  - `POST /me/payout-accounts/:id/activate` → `{ accounts }`. Lock; the row must be own and non-deleted (else 404); deactivate the others, then activate it (two updates in order, so the partial unique index never sees two active rows).
  - `DELETE /me/payout-accounts/:id` → 204. Lock; own and non-deleted (else 404); active → 409 `PAYOUT_ACCOUNT_ACTIVE`; set `deleted_at = now()` (soft delete keeps the FK for payouts).
- **Response mapping:** `{ id, bankCode, bankName: payoutBankName(bankCode), last4, holderName, active, createdAt }`. `accountNumberEnc` is never selected into a response object (use an explicit `select`).

## Dependencies

- TASK-204 contract and error codes; TASK-209 table.
- New env var: `PAYOUT_ACCOUNT_ENC_KEY` in `common/env.ts` (required, a z.string refine that decodes base64 to exactly 32 bytes), `.env.example` (placeholder + "generate with `openssl rand -base64 32`"), the test env used by `pnpm test`, and the CI workflow env (a fixed test-only key).

## Risks

- **Key loss makes stored numbers unrecoverable**; key rotation is not designed. Mitigation: the `v1:` version prefix leaves room for rotation. Document the key in `.env.example` and flag it in the summary as an ops item before live.
- **Logging.** The request body contains the full number. Mitigation: make sure the request logger doesn't log bodies (check `configureApp`/logger), and never interpolate input in error details.

## Tasks

### TASK-212: Field encryption helper + env key

- **`apps/api/src/common/field-encryption.ts`:** `encryptField(plain: string, key: Buffer): string` (random 12-byte IV, `aes-256-gcm`, returns `v1:iv:tag:ct` base64 parts) and `decryptField(payload: string, key: Buffer): string` (rejects an unknown version or a bad tag by throwing). `loadFieldKey(base64: string): Buffer` validates the length.
- **`common/env.ts`:** `PAYOUT_ACCOUNT_ENC_KEY` required, with the 32-byte check; extend `env.spec.ts`.
- `.env.example`, the test env setup and the CI workflow get the variable (placeholder / fixed test key).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/common/field-encryption.ts` (+ `.spec.ts`) | AES-256-GCM helper |
| MODIFY | `apps/api/src/common/env.ts` (+ `env.spec.ts`) | Required key |
| MODIFY | `.env.example`, test env config, `.github/workflows/*.yml` | Provide the key |

**Testing** (unit):
- Round trip; two encryptions of the same value differ (random IV).
- A tampered ciphertext or tag throws; a wrong key throws; the `v2:` prefix throws.
- Env: a missing key, non-base64, or 16 bytes fail startup validation.

---

### TASK-213: Payout accounts service, controller and web wiring

- **`apps/api/src/modules/payouts/payout-accounts.service.ts`:** `list(creatorProfileId)`, `create(creatorProfileId, input)`, `activate(creatorProfileId, id)`, `remove(creatorProfileId, id)` as described above, each write in `prisma.$transaction` with the creator-row `FOR UPDATE` first. Inject the key from env once (constructor). Export the service (US-063 needs `activeInTx(tx, creatorProfileId)` → `{ id, bankCode, last4, holderName } | null`, defined here).
- **`payout-accounts.controller.ts`:** `@Controller('me/payout-accounts')`; validate `:id` as a uuid (malformed → 404, matching other studio routes); body via `ZodValidationPipe(payoutAccountInputSchema)`.
- **Web:** `lib/api/payout-accounts.ts` becomes real fetches (`GET`, `POST`, `POST …/activate`, `DELETE`), parsed with the shared schemas, throwing `ApiError`. Delete the dummy array and `__resetPayoutAccountsDummy`, and update the tests to mock `fetch`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/payouts/payout-accounts.service.ts`, `payout-accounts.controller.ts` | API |
| MODIFY | `apps/api/src/modules/payouts/payouts.module.ts` | Wire |
| CREATE | `apps/api/src/modules/payouts/payout-accounts.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/lib/api/payout-accounts.ts` (+ test) | Real client |

**Testing** (integration):
- The first account is active; a second with `makeActive` moves the active flag; a 4th → 409 `PAYOUT_ACCOUNT_LIMIT`.
- 4 concurrent creates on an empty list → exactly 3 rows, exactly one active.
- Concurrent activates of two accounts → exactly one active.
- Deleting the active account → 409 `PAYOUT_ACCOUNT_ACTIVE`; deleting an inactive one → 204, gone from the list, the row still exists with `deleted_at`.
- Another creator's id → 404 for activate/delete.
- Responses contain no `accountNumber*` key; the DB value is not the plain number, and `decryptField` returns it.
- Validation: spaces stripped, 5 digits → 400, unknown bank → 400, extra key → 400.
- Guest 401; non-creator 403; a missing Origin with the cookie → 403 (CSRF).
