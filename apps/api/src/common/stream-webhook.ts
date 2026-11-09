import { createHmac, timingSafeEqual } from 'node:crypto';

/** Max age (either direction) of a signed webhook; older requests are treated as replays. */
export const STREAM_WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Cloudflare Stream `Webhook-Signature: time=<unix s>,sig1=<hex HMAC-SHA256(secret, "<time>.<raw body>")>`
 * (developers.cloudflare.com/stream/manage-video-library/using-webhooks). Checks the raw bytes, never re-serialized JSON.
 */
export function verifyStreamWebhook(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  now: Date,
): boolean {
  if (!header) return false;
  const parts = new Map(
    header.split(',').map((part) => {
      const at = part.indexOf('=');
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const;
    }),
  );
  const time = parts.get('time');
  const signature = parts.get('sig1');
  if (!time || !/^\d+$/.test(time) || !signature) return false;
  if (Math.abs(now.getTime() / 1000 - Number(time)) > STREAM_WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(`${time}.`).update(rawBody).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
