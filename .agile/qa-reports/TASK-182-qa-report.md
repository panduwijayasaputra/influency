# QA Report: TASK-182 — Simpan button wiring, toasts and demo seed

**Result:** PASS (seed part not applicable)

- `lib/api/post-save.ts` `setSaved` never throws (null on any failure); `SaveButton` is optimistic, ignores clicks while pending, rolls back with "Gagal menyimpan. Coba lagi." and toasts "Disimpan ke Koleksi Saya" / "Dihapus dari Disimpan". `PostCard` (also used by the post detail page) starts it from `viewer.saved`; guests keep the login link; the "Segera hadir" toast and its `SOON` constant are gone.
- The plan's demo-seed step was skipped: the seed contains no posts (users, roles, coin packages, plans only), so there is nothing to save. Nothing depends on it.
- Tests: `post-save.test.ts` (2), `save-button.test.tsx` (4), `post-card.test.tsx` (new Simpan cases) pass. `pnpm check` clean (shared 251, api 997, web 735).
