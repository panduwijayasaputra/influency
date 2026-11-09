# QA Report: TASK-192 — Creator stepper

**Result:** PASS

- Four steps (Profil, Langganan, Pencairan, Tinjau) plus an under-review done screen. Profil reuses `creatorApplicationSchema.pick(...)` (reserved slugs such as `welcome` are rejected; the address is lowercased).
- Langganan: digits only, 10–5.000 Koin, presets, and a Rupiah estimate from the shared integer helper `subscriptionCreatorShareIdr`. `SUBSCRIPTION_FEE_BPS` now lives in shared and `split-revenue.ts` reads it; a spec compares the helper with `splitRevenue` for 10, 25, 50, 75, 333, 4999 and 5000 Koin.
- Pencairan collects nothing ("Perlu konfirmasi"). Tinjau has Ubah per row and blocks Kirim until the agreement is ticked.
- Deviation from the plan: the browser submit lives in a new `lib/api/creator-apply.ts` because `creator-application.ts` is server-only (`next/headers`). The price is already sent; until US-053 the API ignores it.
- Tests: `creator-path.test.tsx` (16), `creator-apply.test.ts` (3), shared (258), api split-revenue (11). `typecheck`, `lint` clean.
