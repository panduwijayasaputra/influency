# US-013: Full-screen Media Viewer

**Status:** ready_for_uat
**Priority:** medium
**Feature:** creator-profile

## Description

As a visitor, I want to open a post's media full screen and swipe through it, so that I can see photos and videos at their best on my phone.

## Acceptance Criteria

- [ ] Tapping accessible media in a PostCard or a Grid tile opens a full-screen dark viewer (9:16) at that item. Locked premium media never opens the viewer; it goes to the post detail instead.
- [ ] The viewer can swipe or drag between the post's media, shows "n/total", and closes with the X button ("Tutup layar penuh"), a swipe down or Escape. On close, focus and the page's scroll position return to where they were.
- [ ] The viewer shows an action row: Suka · Komentar · Bagikan · Kirim Tip.
  - **Suka** and **Bagikan** work as on the PostCard, and **Kirim Tip** shows "Segera hadir".
  - **Komentar** opens the post's comments in a sheet of about 40% height (the existing comment list and form). The comments feature replaces it with the full Comments sheet later.
- [ ] Videos in the viewer play with sound controls. Media URLs are short-lived, so they are refreshed if they expire while the viewer is open, and a pseudonymous session watermark stays visible on premium media.
- [ ] The viewer is a labelled modal dialog: focus is trapped, all controls have Indonesian labels and 44 px targets, and swipe animations turn off under reduced motion.

## Tasks

### TASK-103: Shared like state and component class hooks
**Status:** done

### TASK-104: `MediaViewer` shell, slides, gestures
**Status:** done

### TASK-105: Viewer action row
**Status:** done

### TASK-106: Comments sheet in the viewer
**Status:** done

### TASK-107: Wire the viewer into PostCard and the Grid
**Status:** done
