# US-017: Upload Video to Posts

**Status:** backlog
**Priority:** medium
**Feature:** creator-content

## Description

As an approved creator, I want to attach video to my posts, so that I can sell video content as well as images.

## Acceptance Criteria

- [ ] A creator can upload a video to a post through a storage adapter targeting private Cloudflare Stream
- [ ] The post shows a processing status until the video is ready
- [ ] When Stream credentials are not available, a stub adapter with a protected test fixture lets the rest of the flow be developed and tested
- [ ] Video originals are never publicly accessible without a signed token
