import { z } from 'zod';

/** TBD placeholder (agreed default 500, US-052). Mirrored by the post_comments_body_length CHECK. */
export const POST_COMMENT_MAX_LENGTH = 500;
export const POST_COMMENTS_PAGE_SIZE = 50;

/** Body of POST /posts/:id/comments. Plain text only; rendered as text, never as HTML. */
export const createPostCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Komentar tidak boleh kosong.')
    .max(POST_COMMENT_MAX_LENGTH, `Komentar maksimal ${POST_COMMENT_MAX_LENGTH} karakter.`),
});
export type CreatePostCommentInput = z.infer<typeof createPostCommentSchema>;

/** One visible comment. Never carries user ids. */
export const postCommentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  createdAt: z.string(),
  author: z.object({ displayName: z.string() }),
  /** Server-side delete rule for the current viewer: the comment's author or the post owner. */
  canDelete: z.boolean(),
});
export type PostComment = z.infer<typeof postCommentSchema>;

/** GET /posts/:id/comments: oldest first, POST_COMMENTS_PAGE_SIZE per page. */
export const postCommentListSchema = z.object({
  items: z.array(postCommentSchema),
  /** Pass as ?cursor= for the next page; null = no more comments. */
  nextCursor: z.uuid().nullable(),
  /** Server-side write rule for the current viewer; false for anonymous. */
  canComment: z.boolean(),
});
export type PostCommentList = z.infer<typeof postCommentListSchema>;
