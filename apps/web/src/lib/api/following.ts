import {
  API_PREFIX,
  type FollowingPage,
  type FollowingQuery,
  followingPageSchema,
} from '@influency/shared';

/**
 * One page of Diikuti (GET /me/following). The server applies the sort; `cursor` is opaque (undefined = first
 * page). The default sort is left out of the query string.
 */
export async function fetchFollowingPage(query: FollowingQuery): Promise<FollowingPage> {
  const params = new URLSearchParams();
  if (query.sort !== 'recent') params.set('sort', query.sort);
  if (query.cursor) params.set('cursor', query.cursor);
  const qs = params.size > 0 ? `?${params}` : '';
  const res = await fetch(`/${API_PREFIX}/me/following${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /me/following failed: ${res.status}`);
  return followingPageSchema.parse(await res.json());
}
