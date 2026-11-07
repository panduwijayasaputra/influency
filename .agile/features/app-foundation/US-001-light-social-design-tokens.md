# US-001: Light Social Design Tokens

**Status:** ready_for_uat
**Priority:** high
**Feature:** app-foundation

## Description

As a visitor, I want a bright, warm and consistent visual style, so that Influency feels like a friendly social app I can trust.

## Acceptance Criteria

- [x] Theme tokens are light-only and follow design/HANDOFF.md:
  - primary `#EF8176`
  - primary.strong `#D9584C`
  - primary.ink `#B4463B`
  - primary.soft `#FFE8E2`
  - koin `#D6A443`, with surface `#FFF6E5` and text `#6B4A0E`
  - canvas `#FAFAFA`
  - surface `#FFFFFF`
  - text `#25262B`
  - muted `#6B6B75`
  - border `#ECE8E7`
  - danger `#B42318`
  - success `#1E6B3A` on `#E6F4EA`

  Values are defined in one place. The Dark Social palette (lemon yellow, `dark` class, `color-scheme: dark`) is gone.
- [x] Filled primary buttons use primary.strong with white text, and coral text links use primary.ink. Coral `#EF8176` is used only for the logo, active indicators, the liked heart and selection rings. Every text/background pair meets WCAG AA (4.5:1), except white on primary.strong `#D9584C` (3.85:1). That pair is kept exactly as designed, by user decision on 2026-11-07, and is documented as an accepted exception.
- [x] Radii follow the design scale: 9 px for segments, 12–14 px for buttons/inputs, 16 px for cards/media, 20 px for recommended cards and 22 px for sheets. Primary buttons are 48–52 px tall.
- [x] Plus Jakarta Sans (400–800) is used app-wide. Controls keep tap targets of at least 44×44 px. Layouts use `100dvh` and safe-area insets. Content sits in a centred 480–560 px column with a 16 px gutter.
- [x] All existing pages (creator page, post detail, login, studio, admin, become-creator) render correctly in the new theme. None of them scroll horizontally at 320, 375, 390 or 430 px.

## Tasks

### TASK-001: Light Social tokens, radius scale and theme test
**Status:** done

### TASK-002: Restyle UI primitives and sweep existing pages
**Status:** done
