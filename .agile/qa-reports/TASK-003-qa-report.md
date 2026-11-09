# QA Report: TASK-003 — BottomSheet component and keyboard-inset hook

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] Client component only where interactive. No new dependency: Radix `Dialog` from the installed `radix-ui`.
- [x] Uses the theme tokens (`bg-card`, `rounded-t-3xl` = 22 px, `max-w-feed`). The close button is 44 px (`size="icon"`).

### Security
- [x] N/A. Presentation only: no data, secrets or access logic.

### Financial Integrity
- N/A

### Code Quality
- Fixed during QA. Pointer capture on the header would retarget the click on the Tutup button to the header, so on real devices Tutup could stop closing the sheet.
  - Change: the drag no longer starts from a `button` or from a non-primary pointer.
  - A regression test was added.
- Fixed during QA. `useKeyboardInset` called `setState` directly inside an effect (lint `react-hooks/set-state-in-effect`). It now returns `active ? inset : 0`.

## Acceptance Criteria Verification
- [x] Slides up from the bottom with a backdrop, a handle, a visible or sr-only title, a close button and a 22 px top radius.
- [x] Closes on Tutup, a backdrop tap, a swipe-down (> 80 px or > 0.5 px/ms) or Escape.
- [x] Focus moves in and is trapped (Radix FocusScope). It returns to the trigger, or for controlled sheets without a trigger, to the element focused before opening.
- [x] Page scroll is locked while open (`data-scroll-locked`, react-remove-scroll, no `position: fixed`, so the scroll position is kept).
- [x] Safe-area padding at the bottom. Android: `interactiveWidget: 'resizes-content'`. iOS: the visualViewport inset lifts the sheet. Only the body scrolls, so the header and inputs stay reachable.
- [x] Motion is off under reduced motion (`motion-reduce:animate-none` / `transition-none`).

## Tests Run
- `bottom-sheet.test.tsx`: 8 tests.
  - trigger open + focus return
  - Escape
  - backdrop (pointerdown + click: Radix 1.8 defers primary-button dismissal to the click)
  - swipe close vs a short slow drag
  - no drag from Tutup
  - scroll lock
  - hidden title + reduced motion
  - controlled focus return
- `use-keyboard-inset.test.ts`: 3 tests.
- Web suite 283/283, lint, typecheck and format all clean.

## Notes
- jsdom can't verify the real iOS Safari / Android Chrome keyboard behaviour. Check it by hand at UAT: open Laporkan and focus the textarea.
