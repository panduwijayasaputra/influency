import { describe, expect, it } from 'vitest';
import {
  createPostCommentSchema,
  POST_COMMENT_MAX_LENGTH,
  postCommentListSchema,
} from './index.js';

describe('createPostCommentSchema', () => {
  it('trims the body', () => {
    expect(createPostCommentSchema.parse({ body: '  hai  ' })).toEqual({ body: 'hai' });
  });

  it('rejects an empty or whitespace-only body', () => {
    expect(createPostCommentSchema.safeParse({ body: '' }).success).toBe(false);
    expect(createPostCommentSchema.safeParse({ body: ' \n\t ' }).success).toBe(false);
  });

  it('accepts the max length and rejects one more', () => {
    const max = 'a'.repeat(POST_COMMENT_MAX_LENGTH);
    expect(createPostCommentSchema.safeParse({ body: max }).success).toBe(true);
    expect(createPostCommentSchema.safeParse({ body: `${max}a` }).success).toBe(false);
  });
});

describe('postCommentListSchema', () => {
  it('parses a last page', () => {
    const page = {
      items: [
        {
          id: '0190a000-0000-7000-8000-000000000001',
          body: '<b>hai</b>',
          createdAt: '2026-11-04T00:00:00.000Z',
          author: { displayName: 'Ana' },
          canDelete: false,
        },
      ],
      nextCursor: null,
      canComment: true,
    };
    expect(postCommentListSchema.parse(page)).toEqual(page);
  });
});
