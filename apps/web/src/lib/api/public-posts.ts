import { API_PREFIX, type PublicPostList, publicPostListSchema } from '@influency/shared';
import { API_ORIGIN } from './origin';

/** Server only. Published feed for /{creatorSlug}, or null when not found. Uncached (no cookies) so hidden posts disappear immediately. */
export async function getPublicPosts(slug: string): Promise<PublicPostList | null> {
  const res = await fetch(
    `${API_ORIGIN}/${API_PREFIX}/creators/${encodeURIComponent(slug)}/posts`,
    { cache: 'no-store' },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /creators/:slug/posts failed: ${res.status}`);
  return publicPostListSchema.parse(await res.json());
}
