# QA Report: TASK-145 — Shared wallet contract and interim wallet data source

**Result: PASS**

- Reviewed `packages/shared/src/wallet.ts`, `apps/web/src/lib/{format,use-wallet-balance}.ts`, `lib/api/wallet.ts`.
- Koin and IDR are integers end to end (`z.int()`); packages are the LOCKED 10/25/50/100/250 at Rp1.000 per Koin; a client-sent price is stripped from the create request.
- Dummy source is flagged with a `shortcut:` comment and has the final API shape.
- Tests: shared 5, web 9 (formatters incl. Jakarta day across UTC midnight, dummy paging with no duplicate ids, hook load/disabled/error+reload). `pnpm --filter shared|web typecheck`, `lint`, and prettier all clean.
