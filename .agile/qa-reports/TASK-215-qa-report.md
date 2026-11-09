# QA Report: TASK-215 — Atomic payout request

**Result:** PASS (2026-11-09)

## Checked
- `POST /api/v1/me/payouts` (approved creator, required `Idempotency-Key`, strict body `{ amountIdr, expectedFeeIdr }`, 5/min [TBD], `no-store`): 201 for a new payout, 200 for a replay. One transaction: lock the creator row (`FOR UPDATE`) → claim the Idempotency-Key → check the fee, the active account, the minimum and the balance → insert the payout (snapshot of amount, fee, net, `fee_is_placeholder` and the destination: bank, last 4, holder, account id) and its first status change (null → REQUESTED by the requester) → store the result. A REQUESTED payout IS the reservation: the earnings balance subtracts it, so there is no second number to keep in step. Nothing is paid and no provider or bank is contacted.
- Limits: exactly the available amount passes, one rupiah more → 409 `PAYOUT_EXCEEDS_AVAILABLE`; Rp100.000 passes, 99.999 → 400/`VALIDATION_FAILED` (minimum measured before the fee); pending earnings cannot be requested; no active account → 409 `PAYOUT_ACCOUNT_REQUIRED`; amounts beyond 32 bits work; another creator's balance and payouts never interfere.
- Fee safety: the request carries the fee that was shown; a different one → 409 `PAYOUT_FEE_CHANGED` with the real fee, nothing written.
- Idempotency: same key + same payload → the same payout (replay, status 200), one row, one status change, reserved once; same key + different payload → 409 `DUPLICATE_REQUEST`; a failed check rolls the whole transaction back **including the key**, so the corrected retry with the same key succeeds; keys are per user.
- Concurrency (real parallel transactions): available Rp250.000 and 6 parallel requests of Rp100.000 with different keys → exactly 2 succeed, 4 get `PAYOUT_EXCEEDS_AVAILABLE`, reserved total Rp200.000, 2 status-change rows; two requests of Rp150.000 → exactly one; 6 identical requests with the same key → one payout, 5 replays, one row.
- The snapshot is independent of later account changes (the account is deactivated and replaced afterwards; the payout keeps BCA •••• 4821).
- HTTP: missing / malformed key, below-minimum, fractional, missing fee, client-chosen `netIdr` or `status` (extra keys), string amount → 400 and nothing created; guest 401; non-creator 403; cross-site and origin-less writes 403; the 6th request in a minute → 429.
- Web: `requestPayout` is the real call (Idempotency-Key header, body `{ amountIdr, expectedFeeIdr }`, 200 and 201 both accepted); the payout sheet is unchanged. Full `pnpm check` passes twice: shared 306, API 1310 (104 files), web 887 (116 files).

## Notes / things to know
- Until US-064 the Pencairan list and Batalkan on Penghasilan still run on an in-memory dummy (`studio-dummy-store.ts`), so a payout requested now shows in the reserved balance but not yet in that list.
- The recommended-creators spec failed intermittently under parallel load (its creators were dated January 2026 and ranked newest-first inside a 15-item cap shared with every other spec). I made it immune by dating its creators 2099; the order it asserts is unchanged.
- The fee is an EXAMPLE placeholder; the real bank cost and the final minimum-vs-fee rule are still OPEN (spec §8).
