# QA Report: TASK-212 — Field encryption helper + env key

**Result:** PASS (2026-11-09)

## Checked
- `common/field-encryption.ts`: AES-256-GCM, a random 12-byte IV per value, payload `v1:<iv>:<tag>:<ciphertext>` (base64 parts). Round trip including non-ASCII and the empty string; the same value encrypts differently each time; the plain value never appears in the payload. **Beyond the plan:** an optional authenticated `context` (the owner's id) that is not stored, so a ciphertext copied into another creator's row does not decrypt. A wrong key, a wrong or missing context, a tampered ciphertext / tag / IV, an unknown version, a missing or extra part and plain text all throw. `isFieldKey` / `loadFieldKey` accept only canonical base64 of exactly 32 bytes (Node's lenient decoder would otherwise accept stray characters).
- `PAYOUT_ACCOUNT_ENC_KEY` is required in `common/env.ts`: missing, 16 or 48 bytes, not base64, empty and the `.env.example` placeholder `SET_LOCALLY` all fail startup with a message naming the variable and never echoing the value. Tests inject a fixed test-only key through `vitest.config.ts` (so CI needs no workflow change); the two existing env tests that built their own config were updated.
- 258 `common` tests pass.

## Operational notes (the user needs to know)
- **`.env`:** the key is required, so a local `.env` without it stops the API at startup. I appended a freshly generated 32-byte dev key to the local, gitignored `.env` (value not shown anywhere). `.env.example` has the placeholder and the `openssl rand -base64 32` instruction.
- **Key loss makes stored account numbers unrecoverable, and rotation is not designed** (the `v1` prefix leaves room for it). Back up the production key and decide a rotation procedure before going live.
