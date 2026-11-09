# US-070: Creator Search API

**Status:** ready_for_uat
**Priority:** high
**Feature:** discover-notifications-settings

## Description

As a visitor or logged-in user, I want creator search to return real creators, so that I can find a creator by name or username.

## Acceptance Criteria

- [ ] `GET /discover/creators?q=` (public; not `/creators/search`, which would collide with `/creators/:slug`) matches approved creators whose display name or slug contains `q`, case-insensitively. Ranking: exact slug match, then slug prefix, then other matches; max 20 results.
- [ ] `q` is trimmed and must be 1–50 characters (else 400). Input is treated as plain text (LIKE wildcards `%`/`_` escaped), never as a pattern or SQL.
- [ ] Each result: slug, display name, avatar URL. Unapproved, suspended or deleted creators and plain users never appear; no internal ids, Telegram data or follower lists are exposed.
- [ ] Rate limited per IP. US-066 uses this endpoint instead of dummy data.
- [ ] Integration tests cover matching, ranking, case-insensitivity, wildcard escaping, validation and the exclusion rules.

## Tasks

### TASK-226: Creator search endpoint + web wiring
**Status:** done
