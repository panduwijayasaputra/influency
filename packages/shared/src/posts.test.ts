import { describe, expect, it } from 'vitest';
import {
  createPostSchema,
  isPostEditable,
  POST_CAPTION_MAX_LENGTH,
  POST_STATUSES,
  postLikeResponseSchema,
  publicPostDetailSchema,
  publicPostSchema,
  setPostCoverSchema,
  setPostOfferSchema,
  studioPostSchema,
  updatePostSchema,
} from './index.js';

const VISIBILITY_MESSAGE = 'Pilih Gratis atau Premium.';

describe('createPostSchema', () => {
  it('defaults caption to empty and trims it', () => {
    expect(createPostSchema.parse({ visibility: 'FREE' })).toEqual({
      caption: '',
      visibility: 'FREE',
    });
    expect(createPostSchema.parse({ caption: '  hai  ', visibility: 'PREMIUM' }).caption).toBe(
      'hai',
    );
  });

  it('accepts the max caption length and rejects one more', () => {
    const max = 'a'.repeat(POST_CAPTION_MAX_LENGTH);
    expect(createPostSchema.safeParse({ caption: max, visibility: 'FREE' }).success).toBe(true);
    const result = createPostSchema.safeParse({ caption: `${max}a`, visibility: 'FREE' });
    expect(result.error?.issues[0]).toMatchObject({ path: ['caption'] });
  });

  it.each([{}, { visibility: 'free' }, { visibility: 'PUBLIC' }])(
    'rejects visibility %j',
    (input) => {
      const result = createPostSchema.safeParse(input);
      expect(result.error?.issues[0]).toMatchObject({
        path: ['visibility'],
        message: VISIBILITY_MESSAGE,
      });
    },
  );

  it('strips fields the client may not set', () => {
    expect(
      createPostSchema.parse({ visibility: 'FREE', status: 'PUBLISHED', creatorProfileId: 'x' }),
    ).toEqual({ caption: '', visibility: 'FREE' });
  });
});

describe('updatePostSchema', () => {
  it('rejects an empty update', () => {
    expect(updatePostSchema.safeParse({}).success).toBe(false);
    expect(updatePostSchema.safeParse({ status: 'PUBLISHED' }).success).toBe(false);
  });

  it('accepts a partial update, including clearing the caption', () => {
    expect(updatePostSchema.parse({ caption: '' })).toEqual({ caption: '' });
    expect(updatePostSchema.parse({ visibility: 'PREMIUM' })).toEqual({ visibility: 'PREMIUM' });
  });
});

describe('setPostOfferSchema', () => {
  it.each([{ priceCoins: 5 }, { priceCoins: 1_000 }])('accepts the limits %j', (input) => {
    expect(setPostOfferSchema.parse(input)).toEqual(input);
  });

  it.each([
    [{ priceCoins: 4 }, 'priceCoins', 'Harga minimal 5 Koin.'],
    [{ priceCoins: 0 }, 'priceCoins', 'Harga minimal 5 Koin.'],
    [{ priceCoins: 1_001 }, 'priceCoins', 'Harga maksimal 1000 Koin.'],
    [{ priceCoins: 1.5 }, 'priceCoins', 'Harga harus bilangan bulat Koin.'],
    [{ priceCoins: '5' }, 'priceCoins', 'Harga harus bilangan bulat Koin.'],
    [{}, 'priceCoins', 'Harga harus bilangan bulat Koin.'],
  ])('rejects %j', (input, path, message) => {
    const result = setPostOfferSchema.safeParse(input);
    expect(result.error?.issues[0]).toMatchObject({ path: [path], message });
  });

  it('rejects an access duration (offers are permanent)', () => {
    const result = setPostOfferSchema.safeParse({ priceCoins: 5, durationDays: 7 });
    expect(result.error?.issues[0]).toMatchObject({
      code: 'unrecognized_keys',
      keys: ['durationDays'],
    });
  });
});

describe('isPostEditable', () => {
  it.each(POST_STATUSES)('%s', (status) => {
    expect(isPostEditable(status)).toBe(status === 'DRAFT');
  });
});

describe('setPostCoverSchema', () => {
  const mediaId = '0190a000-0000-7000-8000-000000240001';

  it('accepts a media uuid', () => {
    expect(setPostCoverSchema.parse({ mediaId })).toEqual({ mediaId });
  });

  it.each([{ mediaId: 'abc' }, {}, { mediaId, atSeconds: 3 }])('rejects %j', (input) => {
    expect(setPostCoverSchema.safeParse(input).success).toBe(false);
  });
});

describe('cover fields', () => {
  const studio = {
    id: 'p',
    caption: '',
    visibility: 'PREMIUM',
    status: 'DRAFT',
    offer: null,
    publishedAt: null,
    createdAt: 'c',
    updatedAt: 'u',
  };
  const publicPost = {
    id: 'p',
    visibility: 'PREMIUM',
    caption: '',
    publishedAt: 'p',
    imageCount: 1,
    videoCount: 0,
    offer: { priceCoins: 5 },
    likeCount: 0,
    access: 'locked',
    viewer: null,
    commentCount: 0,
    media: [{ kind: 'VIDEO', durationSeconds: 12 }],
  };

  it.each([null, { mediaId: null, previewUrl: '/x' }, { mediaId: 'm', previewUrl: '/x' }])(
    'studio cover %j',
    (cover) => {
      expect(studioPostSchema.parse({ ...studio, cover }).cover).toEqual(cover);
    },
  );

  it.each([null, '/api/v1/creators/a/posts/p/preview/x'])('public previewUrl %j', (previewUrl) => {
    expect(publicPostSchema.parse({ ...publicPost, previewUrl }).previewUrl).toBe(previewUrl);
  });

  it.each(['access', 'media', 'commentCount', 'viewer'])('requires %s on a feed item', (field) => {
    expect(
      publicPostSchema.safeParse({ ...publicPost, previewUrl: null, [field]: undefined }).success,
    ).toBe(false);
  });

  it('rejects an unknown media kind', () => {
    const media = [{ kind: 'AUDIO', durationSeconds: null }];
    expect(publicPostSchema.safeParse({ ...publicPost, previewUrl: null, media }).success).toBe(
      false,
    );
  });
});

describe('publicPostDetailSchema', () => {
  const locked = {
    id: 'p',
    visibility: 'PREMIUM',
    status: 'PUBLISHED',
    caption: '',
    publishedAt: '2026-11-01T00:00:00.000Z',
    imageCount: 1,
    videoCount: 0,
    offer: { priceCoins: 5 },
    previewUrl: null,
    access: 'locked',
    likeCount: 3,
    viewer: null,
    commentCount: 2,
    media: [{ kind: 'IMAGE', durationSeconds: null }],
  };

  it('accepts a locked premium post and an owner draft without publishedAt', () => {
    expect(publicPostDetailSchema.parse(locked).access).toBe('locked');
    const draft = { ...locked, status: 'DRAFT', publishedAt: null, access: 'full' };
    expect(publicPostDetailSchema.parse(draft).publishedAt).toBeNull();
  });

  it('accepts a logged-in viewer and requires likeCount', () => {
    const viewer = { liked: true, canLike: false, canReport: true };
    expect(publicPostDetailSchema.parse({ ...locked, viewer }).viewer).toEqual(viewer);
    expect(publicPostDetailSchema.safeParse({ ...locked, likeCount: undefined }).success).toBe(
      false,
    );
  });

  it('rejects hidden (a 404, never a body)', () => {
    expect(publicPostDetailSchema.safeParse({ ...locked, access: 'hidden' }).success).toBe(false);
  });
});

describe('postLikeResponseSchema', () => {
  it('parses a like result', () => {
    expect(postLikeResponseSchema.parse({ liked: true, likeCount: 1 })).toEqual({
      liked: true,
      likeCount: 1,
    });
  });
});
