# Post media processing & cleanup

How post media moves between states, and how failed or abandoned uploads are cleaned up (US-016, US-017, US-049).

## States

| Status           | Meaning                                                               | Counts toward the per-post limit |
| ---------------- | --------------------------------------------------------------------- | -------------------------------- |
| `PENDING_UPLOAD` | Upload slot issued; the browser uploads straight to storage / Stream  | Only until the slot expires      |
| `PROCESSING`     | Video uploaded; the provider is still encoding                        | Yes                              |
| `READY`          | Checked and usable                                                    | Yes                              |
| `REJECTED`       | Failed; `rejection_reason` says why (null on rows from before US-049) | No                               |

Rows only move forward. `READY` and `REJECTED` are final, and every transition is a conditional update. Concurrent or repeated triggers can't regress a row, and only the update that actually rejects a row deletes its bytes.

## What moves a row

All of these go through `PostMediaService.refresh`:

- **`POST …/media/:id/complete`**: the browser calls it after uploading.
- **`GET …/media`** (studio list, polled every 5 s while a video processes): refreshes the post's PROCESSING videos and rejects its expired slots.
- **Stale-upload sweep**: `MediaSweeper` runs every `MEDIA_SWEEP_INTERVAL_SECONDS` (default 300; 0 = off), at most 100 rows per run. It runs on every API instance until the Phase 5 worker exists; this is safe because the sweep is idempotent.
- **Stream webhook** (optional, below).

## Rejection reasons

| Reason               | When                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPLOAD_EXPIRED`     | The slot expired before the upload was completed (`UPLOAD_URL_TTL_SECONDS` for images, `VIDEO_UPLOAD_TTL_SECONDS` for video)                                    |
| `PROCESSING_TIMEOUT` | The video was still processing `VIDEO_PROCESSING_TIMEOUT_SECONDS` (TBD placeholder, default 7200) after its slot expired; the provider is asked once more first |
| `PROCESSING_FAILED`  | The provider reported an error or no longer has the video                                                                                                       |
| `TOO_LARGE`          | Bytes over `POST_IMAGE_MAX_BYTES` / `POST_VIDEO_MAX_BYTES`                                                                                                      |
| `TOO_LONG`           | Duration over `POST_VIDEO_MAX_DURATION_SECONDS` (Stream also enforces it at upload)                                                                             |
| `UNSUPPORTED_TYPE`   | Image bytes aren't JPEG/PNG/WebP                                                                                                                                |

The limits are TBD placeholders in `packages/shared/src/post-media.ts`. A rejected file or provider video is deleted (best effort; failures are logged with the media id only). Creators see failed items in the studio and can remove them (in any post status) or retry with a new file.

## Cloudflare Stream webhook (optional)

`POST /api/v1/webhooks/video/cloudflare-stream` is off (404) until `CLOUDFLARE_STREAM_WEBHOOK_SECRET` is set; polling and the sweep work without it.

1. Register the URL. There is one webhook per Cloudflare account, and Cloudflare can't reach localhost (use a tunnel for local tests):
   ```sh
   curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_STREAM_ACCOUNT_ID/stream/webhook" \
     -H "Authorization: Bearer $CLOUDFLARE_STREAM_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"notificationUrl":"https://<public-api-origin>/api/v1/webhooks/video/cloudflare-stream"}'
   ```
2. Put `result.secret` from the response into `CLOUDFLARE_STREAM_WEBHOOK_SECRET` (a secret store, never git).

The handler checks `Webhook-Signature: time=…,sig1=…`, the hex HMAC-SHA256 of `<time>.<raw body>` with that secret, using a constant-time compare. Requests more than 300 s old (or ahead) are refused with 403. The handler only uses `uid` from the body and re-reads the video's state from the Stream API, so duplicate, replayed and out-of-order events are harmless. Unknown videos get 200; a Stream API error gets 500.

Notes against the current docs ([Stream webhooks](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/), checked 2026-11-04):

- The docs give no numeric replay window; 300 s is our choice.
- The docs don't state the delivery `Content-Type`. The handler expects `application/json`; any other type is refused (403) without touching the row. Check the first real delivery.
- Retry behavior on non-2xx isn't documented. If a 500 isn't retried, the poll or sweep still settles the row.
