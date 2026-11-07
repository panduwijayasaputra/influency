# US-053: Light Social Design Tokens

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a visitor, I want a bright, warm and consistent visual style, so that Influency feels like a friendly social app I can trust.

> This reworks the Dark Social tokens from TASK-093/094. The palette and the light-only theme change. The tap-target, dvh/safe-area and feed-width work stays.

## Acceptance Criteria

- [ ] Theme tokens are light-only and follow design/HANDOFF.md:
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

  Values are defined once and used by existing components; no Dark Social colours or `dark` class remain.
- [ ] Filled primary buttons use primary.strong with white text, and coral text links use primary.ink. Coral `#EF8176` is used only for the logo, active indicators, the liked heart and selection rings. Every text/background pair meets WCAG AA.
- [ ] Radii follow the design scale: 9 px for segments, 12–14 px for buttons/inputs, 16 px for cards/media, 20 px for recommended cards and 22 px for sheets. Primary buttons are 48–52 px tall.
- [x] Plus Jakarta Sans (400–800) is loaded via next/font and applied app-wide.
- [x] Interactive controls have tap targets of at least 44×44 px. Layouts use `100dvh` and safe-area insets. Content is a centred 480–560 px column on desktop with a 16 px side gutter.
- [x] Pages render without horizontal scroll at 320, 375, 390 and 430 px widths.
