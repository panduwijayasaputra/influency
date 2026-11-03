import { describe, expect, it } from 'vitest';
import { mediaAccessResponseSchema } from './index.js';

describe('mediaAccessResponseSchema', () => {
  const body = {
    media: [
      { id: 'a', kind: 'IMAGE', url: '/api/v1/dev-storage/post-media/x?exp=1&sig=s' },
      {
        id: 'b',
        kind: 'VIDEO',
        url: 'https://customer-x.cloudflarestream.com/t/iframe',
        player: 'iframe',
      },
    ],
    expiresAt: '2026-11-04T00:30:00.000Z',
    watermark: '1a2b3c4d',
  };

  it('parses images and videos', () => {
    expect(mediaAccessResponseSchema.parse(body)).toEqual(body);
    expect(mediaAccessResponseSchema.parse({ ...body, watermark: null }).watermark).toBeNull();
  });

  it('requires a player for videos', () => {
    const video = { id: 'b', kind: 'VIDEO', url: 'u' };
    expect(mediaAccessResponseSchema.safeParse({ ...body, media: [video] }).success).toBe(false);
  });
});
