import { describe, expect, it } from 'vitest';
import {
  createPostSchema,
  isPostEditable,
  POST_CAPTION_MAX_LENGTH,
  POST_STATUSES,
  setPostOfferSchema,
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
  it.each([
    { priceCoins: 1, durationDays: 1 },
    { priceCoins: 10_000, durationDays: 365 },
  ])('accepts the limits %j', (input) => {
    expect(setPostOfferSchema.parse(input)).toEqual(input);
  });

  it.each([
    [{ priceCoins: 0, durationDays: 7 }, 'priceCoins', 'Harga minimal 1 Koin.'],
    [{ priceCoins: -1, durationDays: 7 }, 'priceCoins', 'Harga minimal 1 Koin.'],
    [{ priceCoins: 10_001, durationDays: 7 }, 'priceCoins', 'Harga maksimal 10000 Koin.'],
    [{ priceCoins: 1.5, durationDays: 7 }, 'priceCoins', 'Harga harus bilangan bulat Koin.'],
    [{ priceCoins: '5', durationDays: 7 }, 'priceCoins', 'Harga harus bilangan bulat Koin.'],
    [{ durationDays: 7 }, 'priceCoins', 'Harga harus bilangan bulat Koin.'],
    [{ priceCoins: 5, durationDays: 0 }, 'durationDays', 'Durasi minimal 1 hari.'],
    [{ priceCoins: 5, durationDays: 366 }, 'durationDays', 'Durasi maksimal 365 hari.'],
    [{ priceCoins: 5, durationDays: 0.5 }, 'durationDays', 'Durasi harus bilangan bulat hari.'],
  ])('rejects %j', (input, path, message) => {
    const result = setPostOfferSchema.safeParse(input);
    expect(result.error?.issues[0]).toMatchObject({ path: [path], message });
  });
});

describe('isPostEditable', () => {
  it.each(POST_STATUSES)('%s', (status) => {
    expect(isPostEditable(status)).toBe(status === 'DRAFT' || status === 'HIDDEN');
  });
});
