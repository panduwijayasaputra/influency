# US-034: Kirim Tip Sheet UI

**Status:** ready_for_uat
**Priority:** medium
**Feature:** purchases

## Description

As a user who pays a creator, I want to send them a tip from a post or their profile, so that I can thank them beyond the purchase price.

## Acceptance Criteria

- [x] **Entry points:** "Kirim Tip" appears on the post card and media viewer for a premium post the viewer has full access to, and on the creator profile when the viewer is tip-eligible (active subscription or at least one purchase from that creator). It never appears on free posts, on the viewer's own content, or for guests.
- [x] **Sheet:** creator avatar, name and @username; preset amounts 5 / 10 / 25 / 50 / 100 (default 10) plus a custom whole-number amount from 1 to 1,000 Koin; the balance; and the note "Tip adalah ucapan terima kasih. Tip tidak membuka konten, dan Influency tidak memotong biaya tip." The layout carries a "Perlu konfirmasi" label (design proposal).
- [x] **States:**
  - an invalid amount (0, more than 1,000, a decimal) disables Kirim with an inline message
  - insufficient balance → "Isi Koin · kurang N Koin"
  - sending → disabled
  - success → toast "Tip N Koin terkirim ke …"
  - error → a message with retry
  - one `Idempotency-Key` per sheet opening
- [x] Until US-039 lands, eligibility and sending come from the dummy source with a "Demo" toast. Component tests cover the visibility rules, amount validation and each state.

## Tasks

### TASK-161: Kirim Tip sheet and entry points
**Status:** done
