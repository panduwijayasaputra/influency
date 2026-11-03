# US-015: Create and Edit Draft Posts

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-content

## Description

As an approved creator, I want to create and edit posts as drafts, so that I can prepare content before publishing it.

## Acceptance Criteria

- [ ] A creator can create a post with a caption and mark it as `FREE` or `PREMIUM`
- [ ] Posts start as `DRAFT` and are not visible publicly
- [ ] The Studio lists the creator's own posts with their status
- [ ] A creator cannot view or edit another creator's posts (another creator's post ID returns not found)

## Tasks

### TASK-041: `posts` schema, migration and shared post contract
**Status:** done

### TASK-042: Studio posts API (`/creators/me/posts`)
**Status:** done

### TASK-043: Studio posts pages (`/studio/posts`, `/new`, `/[postId]`)
**Status:** done
