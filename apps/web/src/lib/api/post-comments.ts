import { cookies } from 'next/headers';
import {
  API_PREFIX,
  type PostCommentList,
  postCommentListSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/**
 * Server only. First page of a post's comments; 'forbidden' = premium without access (TBD policy), null on 404.
 * Forwards the session cookie so canComment/canDelete match the viewer; uncached for the same reason.
 */
export async function getPostComments(
  postId: string,
): Promise<PostCommentList | 'forbidden' | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(
    `${API_ORIGIN}/${API_PREFIX}/posts/${encodeURIComponent(postId)}/comments`,
    {
      headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
      cache: 'no-store',
    },
  );
  if (res.status === 403) return 'forbidden';
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /posts/:id/comments failed: ${res.status}`);
  return postCommentListSchema.parse(await res.json());
}
