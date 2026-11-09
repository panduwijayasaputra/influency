import { cookies } from 'next/headers';
import {
  API_PREFIX,
  type PublicPostDetail,
  publicPostDetailSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/**
 * Server only. One post for /{slug}/posts/{postId}, or null on 404. Forwards the session cookie when present so the
 * owner (and entitled viewers) get `full`; uncached because the answer depends on the viewer.
 */
export async function getPublicPost(
  slug: string,
  postId: string,
): Promise<PublicPostDetail | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const path = `/creators/${encodeURIComponent(slug)}/posts/${encodeURIComponent(postId)}`;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /creators/:slug/posts/:postId failed: ${res.status}`);
  return publicPostDetailSchema.parse(await res.json());
}
