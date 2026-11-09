import { z } from 'zod';

/** TBD placeholder (agreed default 500, US-052). Mirrored by the post_comments_body_length CHECK. */
export const POST_COMMENT_MAX_LENGTH = 500;
export const POST_COMMENTS_PAGE_SIZE = 50;
/** Replies embedded under each top-level comment in GET /posts/:id/comments. */
export const POST_COMMENT_REPLIES_PREVIEW = 3;
/** Page size of GET /posts/:id/comments/:commentId/replies. */
export const POST_COMMENT_REPLIES_PAGE_SIZE = 20;

/** Body of POST /posts/:id/comments. Plain text only; rendered as text, never as HTML. */
export const createPostCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Komentar tidak boleh kosong.')
    .max(POST_COMMENT_MAX_LENGTH, `Komentar maksimal ${POST_COMMENT_MAX_LENGTH} karakter.`),
  /** US-017. Reply to this comment on the same post; a reply to a reply is attached to its top-level parent. */
  parentId: z.uuid().optional(),
});
export type CreatePostCommentInput = z.infer<typeof createPostCommentSchema>;

/** Body of PATCH /posts/:id/comments/:commentId: same rules as creating. The response is a PostReply. */
export const updatePostCommentSchema = createPostCommentSchema.pick({ body: true });
export type UpdatePostCommentInput = z.infer<typeof updatePostCommentSchema>;

/**
 * One visible comment or reply. Never carries user ids.
 * The optional fields are filled in by later stories: the UI shows a feature only when its field is present.
 */
export const postReplySchema = z.object({
  id: z.uuid(),
  body: z.string(),
  createdAt: z.string(),
  author: z.object({ displayName: z.string() }),
  /** Server-side delete rule for the current viewer: the comment's author or the post owner (admins join in US-021). */
  canDelete: z.boolean(),
  /** Server-side edit rule for the current viewer: the comment's author only (creators and admins never edit others). */
  canEdit: z.boolean(),
  /** Server-side pin rule for the current viewer: the post owner, top-level comments only (replies send false). */
  canPin: z.boolean(),
  /** US-018. Present = comment likes are live. */
  likeCount: z.number().int().min(0).optional(),
  /** US-018. The viewer's own like. */
  liked: z.boolean().optional(),
  /** US-019. ISO time of the last edit; null = never edited. */
  editedAt: z.string().nullable().optional(),
  /** US-017. A deleted parent kept for its replies: `body` and `author` are empty and must not be shown. */
  deleted: z.boolean().optional(),
  avatarUrl: z.string().nullable().optional(),
});
export type PostReply = z.infer<typeof postReplySchema>;

/** A top-level comment: a reply plus the thread fields. Replies are one level deep. */
export const postCommentSchema = postReplySchema.extend({
  /** US-020. True on the post's pinned comment; only on a top-level comment. */
  pinned: z.boolean().optional(),
  /** US-017. */
  replyCount: z.number().int().min(0).optional(),
  /** US-017. Oldest first. */
  replies: z.array(postReplySchema).optional(),
});
export type PostComment = z.infer<typeof postCommentSchema>;

/** Response of POST and DELETE /posts/:id/comments/:commentId/likes (US-018); both are idempotent. */
export const commentLikeResponseSchema = z.object({
  liked: z.boolean(),
  likeCount: z.number().int().min(0),
});
export type CommentLikeResponse = z.infer<typeof commentLikeResponseSchema>;

/** Response of PUT and DELETE /posts/:id/comments/:commentId/pin (US-020); both are idempotent. */
export const commentPinResponseSchema = z.object({ pinned: z.boolean() });
export type CommentPinResponse = z.infer<typeof commentPinResponseSchema>;

/** GET /posts/:id/comments: Top order (placeholder: likes descending, then newest first), POST_COMMENTS_PAGE_SIZE per page. */
export const postCommentListSchema = z.object({
  items: z.array(postCommentSchema),
  /** Opaque. Pass as ?cursor= for the next page; null = no more comments. */
  nextCursor: z.string().nullable(),
  /** Server-side write rule for the current viewer; false for anonymous. */
  canComment: z.boolean(),
});
export type PostCommentList = z.infer<typeof postCommentListSchema>;

/** GET /posts/:id/comments/:commentId/replies: oldest first, POST_COMMENT_REPLIES_PAGE_SIZE per page. */
export const postReplyListSchema = z.object({
  items: z.array(postReplySchema),
  /** Last reply id of this page; pass as ?cursor=. null = no more replies. */
  nextCursor: z.uuid().nullable(),
  canComment: z.boolean(),
});
export type PostReplyList = z.infer<typeof postReplyListSchema>;
