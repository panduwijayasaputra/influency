import { describe, expect, it } from 'vitest';
import { mediaAccessResponseSchema } from './index.js';

describe('mediaAccessResponseSchema', () => {
  const body = {
    media: [
      { id: 'a', kind: 'IMAGE', url: '/api/v1/dev-storage/post-media/x?exp=1&sig=s' },
      {
        id: 'b',
        kind: 'VIDEO',
        url: 'https://customer-x.cloudflarestream.com/t/manifest/video.m3u8',
        posterUrl: 'https://customer-x.cloudflarestream.com/t/thumbnails/thumbnail.jpg',
        player: 'hls',
        durationSeconds: 65,
      },
    ],
    expiresAt: '2026-11-04T00:30:00.000Z',
    watermark: '1a2b3c4d',
  };

  it('parses images and videos', () => {
    expect(mediaAccessResponseSchema.parse(body)).toEqual(body);
    expect(mediaAccessResponseSchema.parse({ ...body, watermark: null }).watermark).toBeNull();
  });

  it('requires a player for videos, accepts an unknown poster and duration, and drops iframe', () => {
    const video = { id: 'b', kind: 'VIDEO', url: 'u', posterUrl: null, durationSeconds: null };
    const parse = (item: object) => mediaAccessResponseSchema.safeParse({ ...body, media: [item] });
    expect(parse(video).success).toBe(false);
    expect(parse({ ...video, player: 'video' }).success).toBe(true);
    expect(parse({ ...video, player: 'iframe' }).success).toBe(false);
  });
});
