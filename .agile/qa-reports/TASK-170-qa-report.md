# QA Report: TASK-170 — Tips schema, endpoints, eligibility and Kirim Tip wiring

**Result:** PASS

## Checked (financial integrity, eligibility, isolation)

- **Model:** `tips` (`amount_coins` CHECK 1–1,000, append-only trigger, FK RESTRICT; `post_id` set for a post tip).
- **Endpoints:** `POST /creators/:slug/tips` and `POST /posts/:id/tips` (session, rate limit 10/min TBD, required `Idempotency-Key`, body `{ amountCoins }` strict). One transaction: key claim → creator (public) → shared lock on the creator row → wallet lock → **eligibility re-checked at commit time** → debit with FIFO lots → tip row → revenue row → key completed.
- **Eligibility** (`isTipEligible`, pure and unit-tested): an active subscription period or at least one purchase from the creator; never yourself; never a non-public creator. A post tip also needs the tipper to have **paid access to that very post** (a purchase of it or an active subscription) and the post must be published and premium; free, archived (403) and draft/removed/unknown (404) posts are refused. A buyer of post A can tip the creator and post A but not post B.
- **Money:** a tip creates one CREATOR revenue row of amount × Rp1.000 with `fee_bps` 0 and no PLATFORM row (a platform fee of 0 is never written). Tips create no purchase and no period (checked), so they never grant or extend access.
- **Idempotency and races:** same key and body → one tip and the same result; same key with another amount → `DUPLICATE_REQUEST`; five simultaneous 10-Koin tips against 15 Koin → exactly one succeeds, four get `INSUFFICIENT_COINS`. `INSUFFICIENT_COINS` carries `{ required, available }` and writes nothing.
- **Where the UI offers a tip is now the same rule as the API:** `viewer.canTip` on a post is "published premium post the viewer has paid access to and does not own" (the interim rule from US-034 is gone: an admin or owner with free access gets no button; a free post never does), and the profile's `canTip` uses `supportsCreator` + `isTipEligible` (supporters yes; others, the owner and guests no).
- **Wallet activity:** tips show as "Tip · {creator}" with a link to the post (post tip) or the profile.
- **Web:** `sendTip` is a real request; the sheet's success toast is "Tip N Koin terkirim ke {creator}". `lib/demo.ts` is deleted: no dummy purchase data is left anywhere.
- **Open item (spec §6, RECOMMENDED):** structured-tipping and micro-tip review beyond the rate limit is not built; a `shortcut:` comment in `TipsService` and the codebase map say so.

## Tests

`tips.integration.spec.ts` (18 tests: subscriber, buyer and post tips with ledger, revenue and no-access-change checks; other creator; non-supporters and expired subscribers; self-tip; amount bounds incl. 1 and 1,000; free / archived / draft / removed / unknown posts; replay, payload mismatch and 5-way race; shortfall; session / key / origin; wallet activity; `viewer.canTip` for buyer, subscriber, other, owner, admin, guest, free post, and the profile; DB amount and append-only rules), `tip-eligibility.spec.ts`, `public-posts.integration.spec.ts` (admin gets no tip button), web `purchases.test.ts` (profile tip, post tip, shortfall error), `tip-sheet.test.tsx`, `wallet-activity.test.tsx`. `pnpm check` green twice in a row: shared 249, API 979, web 676.

## Notes

- A flaky test of mine was fixed along the way (period dates built from two `Date.now()` calls could break the 30-day CHECK); no production code was involved.
