import { cookies } from 'next/headers';
import {
  API_PREFIX,
  type PublicPostList,
  publicPostListSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/**
 * Server only. Published feed for /{creatorSlug}, or null when not found. Viewer-aware (access, likes), so it
 * forwards the session cookie when present; uncached so hidden posts disappear immediately.
 */
export async function getPublicPosts(slug: string): Promise<PublicPostList | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(
    `${API_ORIGIN}/${API_PREFIX}/creators/${encodeURIComponent(slug)}/posts`,
    { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}, cache: 'no-store' },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /creators/:slug/posts failed: ${res.status}`);
  return publicPostListSchema.parse(await res.json());
}
