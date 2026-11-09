# QA Report: TASK-015 — Telegram token, BrandLogo and legal placeholder sheets

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `--telegram: #1a7db0` / `--telegram-foreground: #ffffff` are defined in `:root` and mapped in `@theme inline`. The comment limits the token to the Telegram login button. `theme.test.ts` asserts the values and AA contrast (white on `#1a7db0` ≈ 4.56:1).
- [x] `BrandLogo` is server-safe and `aria-hidden`, and the wrapper supplies the name. `HomeTopBar` uses it, its logo link label is unchanged, and its tests pass untouched.
- [x] `LegalSheet` reuses `BottomSheet` (controlled), one per document, as agreed. It shows the "Teks final dari legal" eyebrow, "Terakhir diperbarui: [TANGGAL]" and a dark `secondary` **Selesai** button.

### Security
- [x] Static copy only.

### Code Quality
- [x] Placeholder copy lives in one file with a `shortcut:` comment. Every body is bracketed, and the design mock's TBD values (Koin rate, subscription days) are left out. A test enforces both rules.
- [x] The inline trigger text buttons carry a comment about the WCAG 2.5.8 inline exception.

## Acceptance Criteria Verification
- [x] The **Syarat** and **Kebijakan Privasi** links open a bottom sheet with placeholder text marked "Teks final dari legal", a "Terakhir diperbarui: [TANGGAL]" line and a **Selesai** button. The page wiring is in TASK-016.

## Tests Run
- New `legal-sheet.test.tsx`:
  - Syarat opens with both markers and its first heading; Selesai closes it and returns focus to the trigger.
  - Kebijakan Privasi opens its own sheet.
  - 14 copy self-checks: bracketed, no `Rp<n>` or `<n> hari`.
- `theme.test.ts`: telegram values and the AA pair.
- Web: 49 files / 340 tests green. Typecheck and lint clean.
