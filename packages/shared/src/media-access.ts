import { z } from 'zod';

/**
 * One viewable media item of GET /posts/:id/media-access. `url` is short-lived and signed (relative with the local
 * storage driver). VIDEO plays in `<video>`: `player` = `hls` (an HLS manifest) or `video` (a file); `posterUrl` is
 * signed like `url`, and `durationSeconds` is null while unknown.
 */
export const mediaAccessItemSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('IMAGE'), url: z.string() }),
  z.object({
    id: z.string(),
    kind: z.literal('VIDEO'),
    url: z.string(),
    posterUrl: z.string().nullable(),
    player: z.enum(['hls', 'video']),
    durationSeconds: z.number().int().positive().nullable(),
  }),
]);
export type MediaAccessItem = z.infer<typeof mediaAccessItemSchema>;

/** Minted only after the server-side access check; never cached or rendered into SSR HTML. */
export const mediaAccessResponseSchema = z.object({
  media: z.array(mediaAccessItemSchema),
  /** When the URLs stop working; request fresh ones before this. */
  expiresAt: z.string(),
  /** Pseudonymous session tag for the visible watermark; null for anonymous viewers. */
  watermark: z.string().nullable(),
});
export type MediaAccessResponse = z.infer<typeof mediaAccessResponseSchema>;
