import { API_PREFIX, type PostReplyList, postReplyListSchema } from '@influency/shared';

/**
 * Browser fetch of the replies after `cursor` (a reply id) under a top-level comment, oldest first.
 * Never throws: any failure is null so the caller can show its error text.
 */
export async function fetchMoreReplies(
  postId: string,
  commentId: string,
  cursor: string | undefined,
): Promise<PostReplyList | null> {
  try {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const res = await fetch(`/${API_PREFIX}/posts/${postId}/comments/${commentId}/replies${query}`);
    if (!res.ok) return null;
    const parsed = postReplyListSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
