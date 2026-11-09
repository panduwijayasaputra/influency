# US-048: Safe Cover & Blurred Preview for Premium Posts

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-content
**Source:** Video Infrastructure v1 §4, §7, §12

## Description

As an approved creator, I want my premium posts to show a blurred preview cover I chose, so that visitors are enticed to unlock without seeing the actual content.

## Acceptance Criteria

- [x] A creator chooses a cover for a premium post: one of the post's images, a dedicated uploaded cover image, or (video) a provider thumbnail fetched server-side
- [x] The server generates a separate, actually transformed preview file (downscaled + blurred, lossy); the original pixels cannot be recovered from it and removing CSS reveals nothing more
- [x] The public feed (and later post detail) shows only that preview for premium posts — never the original's object key, URL, video id or a clear frame
- [x] Changing the cover regenerates the preview; a premium post without a cover shows a generic locked placeholder
- [x] Whether a clear (non-blurred) cover may ever be public is TBD; it is a configurable setting that defaults to blurred-only

## Tasks

### TASK-064: Shared cover contract
**Status:** done

### TASK-065: Schema, env setting and preview generator
**Status:** done

### TASK-066: Provider thumbnail for video covers
**Status:** done

### TASK-067: Studio cover API
**Status:** done

### TASK-068: Public preview in the feed + public preview route
**Status:** done

### TASK-069: Studio "Sampul" UI
**Status:** done

### TASK-070: Public feed shows preview or locked placeholder
**Status:** done
