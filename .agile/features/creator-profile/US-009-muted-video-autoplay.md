# US-009: Muted Video Autoplay in PostCard

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-profile

## Description

As a visitor, I want accessible videos to start playing silently when I scroll to them, so that I can preview content without tapping, and without sound surprising me.

## Acceptance Criteria

- [x] A free or accessible premium video autoplays **muted** and inline once it is mostly visible. This is LOCKED Option B; the visibility threshold is a configurable example value.
- [x] Only **one** video plays at a time, and only the active carousel slide. A video pauses when its slide changes, when it leaves the viewport, when the browser tab goes to the background, or when a sheet or the viewer opens.
- [x] A **locked premium** video never autoplays and shows only its blurred preview.
- [x] The video has an unmute/mute control (labelled "Nyalakan suara" / "Matikan suara") and shows its duration (m:ss). If the browser blocks autoplay, or the user prefers reduced motion or has data saving on, the video shows a play button instead (tap to play).
- [x] Videos load lazily: only their thumbnail before they come into view, never a full video that hasn't been watched yet.

## Tasks

### TASK-024: Signed HLS playback and poster in media-access
**Status:** done

### TASK-025: PostVideo player and single-playback store
**Status:** done

### TASK-026: Wire autoplay into PostCard, sheets and the post page
**Status:** done
