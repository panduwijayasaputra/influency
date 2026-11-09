# QA Report: TASK-205 — Rekening Pencairan page

**Result:** PASS (2026-11-09)

## Checked
- List: `bank •••• last4`, `a.n. holder`, counter `n / 3 rekening`, "Aktif" badge and coral border on the active account. The active account has no action and shows the right reason (only account vs several).
- Jadikan aktif moves the single badge (toast "{bank} sekarang rekening pencairan aktif"). Hapus asks first ("Hapus rekening ini?"); Batal keeps the account; confirming deletes (toast "Rekening dihapus").
- Add form: closed until "Tambah rekening"; holder prefilled with the display name; invalid numbers (12345, letters, empty, 21 digits) and an empty holder show inline errors and call nothing; spaces are ignored; "Jadikan rekening aktif" moves the active flag; the form and button disappear at 3 accounts ("Maksimal 3 rekening."); with no accounts the form is open and the checkbox is hidden (the first account is always active).
- Back link: Pengaturan only for `?from=settings`; anything else (including a repeated or hostile value) goes to Penghasilan (`back-link.test.tsx`).
- Web typecheck, lint, Prettier pass; web tests 113 files / 847 tests pass.

## Notes
- `post-media-viewer.test.tsx > shows no watermark for anonymous viewers` failed once in a full run and passed in 3 isolated runs and the next full run. The file is untouched by this story; it uses a default 1 s `waitFor` and looks load-sensitive (flaky, not a regression).
- `/settings` (the back target from Pengaturan) is built in feature 10; the param is only read here.
- The list is an in-memory dummy until US-062.
