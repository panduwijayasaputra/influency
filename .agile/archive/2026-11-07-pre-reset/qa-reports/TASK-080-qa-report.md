# QA Report: TASK-080 — Failed uploads in the studio (Hapus / Coba lagi)

**Story:** US-049
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Changes stay in the existing client component `post-media.tsx`; labels live in `studio/posts/labels.ts` next to the status labels. No new components or dependencies.
- [x] Status shown as text ("Gambar n · Gagal" + reason), not only color; buttons have specific `aria-label`s ("Coba lagi gambar 1", "Hapus video 2").
- [x] UX checks only; the API enforces the limit, ownership and lock rules.

### Behavior
- [x] Failed cards show the reason label (`MEDIA_REJECTION_LABELS`) or "Unggahan gagal." for legacy rows; no image request for failed items.
- [x] The counter and the `full` check use non-REJECTED items only, matching the API's limit count.
- [x] Hapus is shown for failed items even on live posts (the API allows it); READY items stay locked. Coba lagi only on editable posts.
- [x] Coba lagi opens the existing file input; once the new slot is created, the failed item is deleted (best effort; a failed DELETE leaves a harmless, still removable row), then the normal PUT → complete flow runs. A refused slot keeps the failed item. A direct click on the input clears a pending retry, so an abandoned picker never deletes anything later.

### Security
- [x] No secrets or URLs added; same-origin API calls with credentials, as before.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 5 | A creator sees failed uploads in the studio and can remove or retry them | PASS | Cards with reasons; Hapus (any status) and Coba lagi (draft) |

## Test Results

- `post-media.test.tsx`: 24 passed (6 new: reasons + fallback, limit excludes failed, remove on a live post without retry, retry order POST → DELETE → PUT → complete, refused slot keeps the item, abandoned retry deletes nothing).
- Full `pnpm check`: format, lint, typecheck green; tests shared 187, web 189, api 548, all passed.
