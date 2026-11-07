# US-002: Bottom Sheet & Toast

**Status:** ready_for_uat
**Priority:** high
**Feature:** app-foundation

## Description

As a user, I want sheets and short confirmations that look and behave the same everywhere, so that actions feel predictable and native.

## Acceptance Criteria

- [x] **Bottom sheet.**
  - It slides up from the bottom with a backdrop, a drag handle, an optional title and a close control, using a 22 px top radius.
  - It closes on the close control, a backdrop tap, swipe-down or Escape.
  - Focus moves into the sheet, is trapped while open, and returns to the trigger on close.
- [x] While a sheet is open, the page behind does not scroll and keeps its scroll position after close. The sheet respects the safe area and the on-screen keyboard (content and inputs stay reachable).
- [x] **Toast.**
  - A short message appears above the bottom nav and disappears by itself after a few seconds. Multiple toasts do not overlap.
  - Toasts are announced to screen readers (`aria-live`) and never steal focus.
- [x] The existing `purchase-sheet` and any other ad-hoc sheets or dialogs on user-facing pages use this sheet. Motion is reduced under `prefers-reduced-motion`.

## Tasks

### TASK-003: BottomSheet component and keyboard-inset hook
**Status:** done

### TASK-004: Toast provider, `useToast` and bottom-nav height variable
**Status:** done

### TASK-005: Move `purchase-sheet` onto BottomSheet
**Status:** done

### TASK-006: Report form and comment-delete confirm as sheets, share toast, guidelines
**Status:** done
