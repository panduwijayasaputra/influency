import { describe, expect, it } from 'vitest';
import {
  createPostCommentSchema,
  ERRORS,
  POST_COMMENT_MAX_LENGTH,
  commentLikeResponseSchema,
  commentPinResponseSchema,
  postCommentListSchema,
  postCommentSchema,
  postReplyListSchema,
  updatePostCommentSchema,
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

describe('updatePostCommentSchema', () => {
  it('trims, keeps only body, and applies the create limits', () => {
    expect(
      updatePostCommentSchema.parse({
        body: '  baru ',
        parentId: '0190a000-0000-7000-8000-000000000001',
      }),
    ).toEqual({ body: 'baru' });
    for (const body of ['', '  \n ', 'a'.repeat(POST_COMMENT_MAX_LENGTH + 1)]) {
      expect(updatePostCommentSchema.safeParse({ body }).success).toBe(false);
    }
    expect(
      updatePostCommentSchema.safeParse({ body: 'a'.repeat(POST_COMMENT_MAX_LENGTH) }).success,
    ).toBe(true);
  });
});

describe('parentId and reply pages (US-017)', () => {
  it('accepts a uuid parentId, none, and rejects a bad one', () => {
    const id = '0190a000-0000-7000-8000-000000000001';
    expect(createPostCommentSchema.parse({ body: 'a', parentId: id }).parentId).toBe(id);
    expect(createPostCommentSchema.parse({ body: 'a' }).parentId).toBeUndefined();
    expect(createPostCommentSchema.safeParse({ body: 'a', parentId: 'x' }).success).toBe(false);
  });

  it('parses an opaque list cursor and a reply page, rejects a non-uuid reply cursor', () => {
    const cursor = '3_0190a000-0000-7000-8000-000000000001';
    expect(
      postCommentListSchema.parse({ items: [], nextCursor: cursor, canComment: false }).nextCursor,
    ).toBe(cursor);
    expect(postReplyListSchema.parse({ items: [], nextCursor: null, canComment: true })).toEqual({
      items: [],
      nextCursor: null,
      canComment: true,
    });
    expect(
      postReplyListSchema.safeParse({ items: [], nextCursor: 'x', canComment: true }).success,
    ).toBe(false);
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
          canEdit: false,
          canPin: false,
        },
      ],
      nextCursor: null,
      canComment: true,
    };
    expect(postCommentListSchema.parse(page)).toEqual(page);
  });
});

describe('postCommentSchema thread fields', () => {
  const base = {
    id: '0190a000-0000-7000-8000-000000000001',
    body: 'hai',
    createdAt: '2026-11-04T00:00:00.000Z',
    author: { displayName: 'Ana' },
    canDelete: false,
    canEdit: false,
    canPin: false,
  };

  it('rejects a comment without canEdit or canPin', () => {
    const noEdit = { ...base, canEdit: undefined };
    const noPin = { ...base, canPin: undefined };
    expect(postCommentSchema.safeParse(noEdit).success).toBe(false);
    expect(postCommentSchema.safeParse(noPin).success).toBe(false);
  });

  it('still parses the minimal comment', () => {
    expect(postCommentSchema.parse(base)).toEqual(base);
  });

  it('parses every thread field including a nested reply', () => {
    const full = {
      ...base,
      likeCount: 3,
      liked: true,
      editedAt: '2026-11-05T00:00:00.000Z',
      pinned: true,
      avatarUrl: null,
      replyCount: 1,
      replies: [
        { ...base, id: '0190a000-0000-7000-8000-000000000002', likeCount: 0, deleted: false },
      ],
    };
    expect(postCommentSchema.parse(full)).toEqual(full);
  });

  it('keeps replies one level deep: a reply cannot carry replies', () => {
    const parsed = postCommentSchema.parse({
      ...base,
      replies: [{ ...base, id: '0190a000-0000-7000-8000-000000000002', replies: [base] }],
    });
    expect(parsed.replies?.[0]).not.toHaveProperty('replies');
  });

  it('rejects a negative likeCount and a non-boolean liked', () => {
    expect(postCommentSchema.safeParse({ ...base, likeCount: -1 }).success).toBe(false);
    expect(postCommentSchema.safeParse({ ...base, liked: 'yes' }).success).toBe(false);
  });
});

describe('commentLikeResponseSchema', () => {
  it('parses a result and rejects a missing field', () => {
    expect(commentLikeResponseSchema.parse({ liked: true, likeCount: 3 })).toEqual({
      liked: true,
      likeCount: 3,
    });
    expect(commentLikeResponseSchema.safeParse({ liked: true }).success).toBe(false);
  });
});

describe('commentPinResponseSchema', () => {
  it('parses a result and rejects a missing or non-boolean field', () => {
    expect(commentPinResponseSchema.parse({ pinned: true })).toEqual({ pinned: true });
    expect(commentPinResponseSchema.safeParse({}).success).toBe(false);
    expect(commentPinResponseSchema.safeParse({ pinned: 'yes' }).success).toBe(false);
  });

  it('has a 422 error code for pinning a reply', () => {
    expect(ERRORS.COMMENT_NOT_PINNABLE.status).toBe(422);
  });
});
