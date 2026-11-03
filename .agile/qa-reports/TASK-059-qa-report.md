# QA Report: TASK-059 — Studio offer form and public cards: permanent access copy

**Story:** US-046
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] The form validates with the shared `setPostOfferSchema` before fetching (same rule as the API); price input `min`/`max` come from the shared constants
- [x] Bahasa copy; labels + `aria-describedby` errors unchanged; public card stays a server component

### Security
- [x] No new data exposed; the public card renders only `priceCoins`

### Financial Integrity
- N/A (display + client-side pre-validation only; the server and DB enforce 5–1,000)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Same 5–1,000 rule in the studio form | PASS | 4 / empty → "Harga minimal 5 Koin.", 1001 → "Harga maksimal 1000 Koin.", 2.5 → integer message, no fetch; 1000 → PUT `{"priceCoins":1000}` |
| 2 | No duration input; "akses permanen" copy | PASS | No "Durasi" label; "Versi 2: 5 Koin · akses permanen"; permanent-access hint; public card "8 Koin · akses permanen" with no "hari" |
| 3 | Price change applies to future purchases only | PASS | Footnote "Perubahan harga hanya berlaku untuk pembelian berikutnya." |

## Tests Run

- [x] Full `pnpm check`: exit 0. Shared 162, web 148 (26 files), api 394 (34 files)

## Issues (if any)

None.
