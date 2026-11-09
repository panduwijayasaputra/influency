# US-061: Earnings Activity API

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-studio

## Description

As an approved creator, I want a list of every unlock, subscription and tip with its fee and net amount, so that I understand where my earnings come from.

## Acceptance Criteria

- [ ] `GET /me/earnings/activity?type=all|subscription|unlock|tip&cursor=` (approved creator only) returns my revenue rows newest first with cursor pagination, using the same page size convention as the wallet ledger.
- [ ] Each item: id, type, date, buyer display name, post caption excerpt (unlock/tip on a post), gross Koin, fee bps, net IDR (the stored `CREATOR` amount, not recomputed), status `PENDING|AVAILABLE` and `availableAt`. Reversals appear as negative rows.
- [ ] Only my own rows are returned; an invalid cursor or type → 400. No buyer ids, usernames, Telegram data or other creators' rows are exposed.
- [ ] US-056 Riwayat uses this endpoint instead of dummy data. Integration tests cover each type filter, pagination stability, reversals, status by server time and isolation.

## Tasks

### TASK-211: Earnings activity endpoint + web wiring
**Status:** done
