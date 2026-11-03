# Media protection (US-021)

What Influency does to keep premium media to entitled viewers, and what it can't do.

## What is enforced

- **Server-side access check.** Viewable media URLs come only from `GET /api/v1/posts/:id/media-access`. It runs `PostAccessService.check` with the session user and server time on every request: `full` mints URLs, `locked` returns 403, `hidden` returns 404. The client never decides access.
- **Short-lived, signed URLs.** Images are R2 presigned GETs (HMAC-signed dev-storage URLs locally). Videos use Cloudflare Stream playback tokens on videos uploaded with `requireSignedURLs`, minted with `downloadable: false`. Lifetime: `MEDIA_ACCESS_TTL_SECONDS` (placeholder 10–30 min; default 30, longer than the 10-minute max video). Each refresh is a new request through the check, so a revoked or removed post stops new URLs immediately.
- **Never in public HTML, logs or analytics.** URLs are fetched by the browser after the page loads (never server-rendered), returned with `no-store`, and never logged. The authorization log line holds only post id, user id, decision and count; request logs drop query strings.
- **Rate limit.** 60 requests per minute per user (per IP when anonymous); placeholder.

## The watermark

The player overlays `influency · <tag>`, where the tag is the first 8 hex characters of `sha256(session id)`. It holds no name, Telegram id or other personal data. It lets an operator tell which session a leaked capture came from, and it discourages casual sharing.

## Limits (not claimed as protection)

- Screen recording, screenshots and phone cameras can't be prevented. The watermark can be cropped or blurred out.
- A minted URL works for anyone who has it until it expires (up to the TTL), and after access is lost (for example a subscription ending mid-session) until then.
- There is no DRM. Stream's `downloadable: false` blocks the download endpoint, not capture of the stream.
- The viewer refreshes URLs a minute before expiry; a video paused past that point restarts from the beginning.
- The in-memory rate limit is per API process, and anonymous callers behind the web proxy share one IP bucket until `trustProxy` is configured.
