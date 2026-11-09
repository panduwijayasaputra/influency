# Technical Plan: US-057 — Rekening Pencairan Page UI

## Architecture Overview

New studio route `/studio/payout-accounts` rendering `PayoutAccountsView` (client). Data goes through `lib/api/payout-accounts.ts`, which keeps a module-level in-memory dummy list until US-062. Its function signatures and return types are the final ones from the shared contract, so the add/activate/delete flows really work in the UI.

The back link uses `?from=earnings|settings`: `PageHeader fallbackHref` → `/studio/earnings` (default) or `/settings` when `from=settings`. Pengaturan doesn't exist yet (feature 10); the param is only read here.

## Dependencies

- `packages/shared/src/payouts.ts` from TASK-202.

## Risks

- **Two sources of truth for the rules** (UI and API). Mitigation: put the limits in shared (`PAYOUT_ACCOUNT_MAX = 3`, `PAYOUT_BANKS`, `payoutAccountInputSchema`). The UI hides actions the API would reject, but the API (US-062) is still the authority.

## Tasks

### TASK-204: Payout account contract + dummy client

**In `packages/shared/src/payouts.ts`:**
- `PAYOUT_ACCOUNT_MAX = 3`.
- `PAYOUT_BANKS = [{ code: 'BCA', name: 'BCA' }, { code: 'BNI', name: 'BNI' }, { code: 'BRI', name: 'BRI' }, { code: 'MANDIRI', name: 'Mandiri' }, { code: 'JAGO', name: 'Bank Jago' }, { code: 'PERMATA', name: 'Permata' }, { code: 'CIMB', name: 'CIMB Niaga' }] as const`. Comment: `// EXAMPLE list from the design; final bank list is OPEN (Perlu konfirmasi)`. Also `PAYOUT_BANK_CODES` and `payoutBankName(code)`.
- `payoutAccountInputSchema = z.object({ bankCode: z.enum(PAYOUT_BANK_CODES), accountNumber: z.string().transform(s => s.replace(/\s/g, '')).pipe(z.string().regex(/^\d{6,20}$/, 'Nomor rekening harus 6–20 digit angka.')), holderName: z.string().trim().min(1, 'Nama pemilik wajib diisi.').max(100), makeActive: z.boolean().default(false) }).strict()`.
- `payoutAccountSchema = z.object({ id: z.string().uuid(), bankCode: z.string(), bankName: z.string(), last4: z.string().regex(/^\d{4}$/), holderName: z.string(), active: z.boolean(), createdAt: z.string().datetime() })`; `payoutAccountListSchema = z.object({ accounts: z.array(payoutAccountSchema) })`.
- Tests: spaces stripped, 5/21 digits and letters rejected, holder trimmed/empty rejected, unknown bank rejected, extra keys rejected.

**`apps/web/src/lib/api/payout-accounts.ts`:**
- Functions: `fetchPayoutAccounts(): Promise<PayoutAccount[]>`, `createPayoutAccount(input: PayoutAccountInput): Promise<PayoutAccount>`, `activatePayoutAccount(id): Promise<PayoutAccount[]>`, `deletePayoutAccount(id): Promise<void>`.
- Dummy implementation (`// dummy until US-062`) over a module array seeded with BCA ••••4821 (active) and Bank Jago ••••4756, holder "Nadia Kirana".
- It mirrors the API rules: the first account is active; `makeActive` deactivates the others; a 4th → throw `ApiError` `PAYOUT_ACCOUNT_LIMIT`; deleting the active one → throw `PAYOUT_ACCOUNT_ACTIVE`; it stores only `last4`.
- Export `__resetPayoutAccountsDummy()` for tests.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/payouts.ts` (+ test) | Account contract, bank list |
| MODIFY | `packages/shared/src/errors.ts` | `PAYOUT_ACCOUNT_LIMIT` (409, "Maksimal 3 rekening pencairan."), `PAYOUT_ACCOUNT_ACTIVE` (409, "Rekening aktif tidak bisa dihapus.") |
| MODIFY | `apps/web/src/lib/api/payout-accounts.ts` (+ test) | Dummy CRUD (replaces the TASK-202 stub) |

**Testing:** the dummy enforces the limit, the single active account and the delete rule; it never returns a full number.

---

### TASK-205: Rekening Pencairan page

- **`apps/web/src/app/studio/payout-accounts/page.tsx`:** `PageHeader` back to `from`, `<h1>` "Rekening Pencairan", renders `<PayoutAccountsView />`.
- **`payout-accounts-view.tsx` (`'use client'`):**
  - Header line: counter `{n} / {PAYOUT_ACCOUNT_MAX}`.
  - Card per account: bank icon tile, "{bankName} •••• {last4}", "a.n. {holderName}".
    - **Active:** coral 1.5px border + badge "Aktif" + note. With 1 account: "Rekening satu-satunya · tambah rekening lain sebelum menghapus." Otherwise: "Rekening aktif · jadikan rekening lain aktif untuk menghapus ini." No delete action.
    - **Inactive:** buttons "Jadikan aktif" (toast "{bankName} sekarang rekening pencairan aktif") and "Hapus". Hapus switches the card into an inline confirm "Hapus rekening ini?" with "Batal" / "Hapus"; confirming shows the toast "Rekening dihapus".
  - **"Tambah rekening"** (hidden at the max; at the max show "Maksimal 3 rekening.") opens an inline form:
    - Bank `<select>` from `PAYOUT_BANKS`;
    - "Nomor rekening" (`inputMode=numeric`);
    - "Nama pemilik rekening" (prefilled with the creator's display name; pass it from the page via `getMyCreatorProfile()`);
    - checkbox "Jadikan rekening aktif" (hidden and implied when the list is empty);
    - "Simpan" / "Batal".
    - Validate with `payoutAccountInputSchema`; errors inline after the first submit. Success toast "Rekening ditambahkan" (+ " dan dijadikan aktif").
  - Every action disables its buttons while pending. `ApiError` codes map to toasts with the API message.
  - Empty state: "Belum ada rekening pencairan." + the form opened.
- Studio has no bottom nav; keep the 16px gutter and a 560px max width.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/app/studio/payout-accounts/page.tsx` | Route |
| CREATE | `apps/web/src/app/studio/payout-accounts/payout-accounts-view.tsx` (+ `.test.tsx`) | Page UI |

**Testing:**
- Renders masked accounts and the counter; the active account has no Hapus and shows the right note (1 vs 2+ accounts).
- Jadikan aktif moves the badge; Hapus needs a confirm; Batal keeps the account.
- Add form: invalid number/holder errors; success adds a row; with makeActive the badge moves; at 3 the add button is hidden.
- Empty list: the form is open and the active checkbox is hidden.
