import { describe, expect, it } from 'vitest';
import { discoverVideosPageSchema } from './discover.js';

const item = {
  id: 'p',
  visibility: 'FREE',
  caption: 'Sambal matah',
  publishedAt: '2026-11-07T00:00:00.000Z',
  imageCount: 0,
  videoCount: 1,
  offer: null,
  previewUrl: null,
  likeCount: 0,
  access: 'full',
  viewer: null,
  commentCount: 0,
  media: [{ kind: 'VIDEO', durationSeconds: 42 }],
  creator: { slug: 'raka', displayName: 'Raka', avatarUrl: null },
  follow: { following: false, followerCount: 8150 },
};

describe('discoverVideosPageSchema', () => {
  it('parses a page of reels with follow state', () => {
    const page = discoverVideosPageSchema.parse({ items: [item], nextCursor: null });
    expect(page.items[0]!.follow.followerCount).toBe(8150);
  });

  it('rejects an item without its follow state', () => {
    const bare = { ...item, follow: undefined };
    expect(discoverVideosPageSchema.safeParse({ items: [bare], nextCursor: null }).success).toBe(
      false,
    );
  });
});
