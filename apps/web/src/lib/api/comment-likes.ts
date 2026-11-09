import { API_PREFIX, type CommentLikeResponse, commentLikeResponseSchema } from '@influency/shared';

/**
 * Like (POST) or unlike (DELETE) a comment from the browser. Never throws: any failure (rejected, offline,
 * unparsable) is null so the caller can roll back. The endpoint is built by US-018.
 */
export async function setCommentLike(
  postId: string,
  commentId: string,
  like: boolean,
): Promise<CommentLikeResponse | null> {
  try {
    const res = await fetch(`/${API_PREFIX}/posts/${postId}/comments/${commentId}/likes`, {
      method: like ? 'POST' : 'DELETE',
    });
    if (!res.ok) return null;
    const parsed = commentLikeResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
