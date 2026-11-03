# QA Report: TASK-066 — Provider thumbnail for video covers

**Story:** US-048
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] `VideoProvider.getThumbnail(uid)` → bytes, or null while missing / not ready
- [x] Stream flow:
  - Video details, then `POST /stream/:uid/token` with `{ exp }` (unix seconds, +300).
  - Fetch `https://customer-<code>.cloudflarestream.com/<token>/thumbnails/thumbnail.jpg?fit=clip` with a 10 s timeout and a 10 MiB cap.
  - The host must be https `*.cloudflarestream.com`, and the account token is never sent to it.
  - Errors carry only the HTTP status.
- [x] Stub: a generated gray JPEG once the video is ready (documented dev stand-in). Fake: `thumbnails` map + `failNext.getThumbnail`

## Docs check (CLAUDE.md rule)

Official docs (securing-your-stream, updated 2026-10-27; displaying-thumbnails) confirm:
- the token endpoint, with `exp` in epoch seconds and the token at `result.token`
- the token replaces the uid in the URL
- `time` defaults to 0s (first frame), and `fit=clip` keeps the whole frame

**Not confirmed** by the pages reviewed: the `thumbnail` field in the video details response, which supplies the customer host. If it is missing, `getThumbnail` throws and the API answers `COVER_SOURCE_UNAVAILABLE`; it never guesses a host. Verify with the real Stream account during UAT.

## Tests Run

- [x] Stream spec (+7): call order and body; null cases without minting a token; 403 without leaking the token; oversize; foreign host, http and missing field. Stub spec (+1). 25 passed

## Issues (if any)

None blocking. The `/token` endpoint is rate-limited (the docs suggest signing keys above ~1,000 tokens/day); cover changes are low-volume.
