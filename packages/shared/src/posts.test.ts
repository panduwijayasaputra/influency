import { describe, expect, it } from 'vitest';
import { createPostSchema, POST_CAPTION_MAX_LENGTH, updatePostSchema } from './index.js';

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
