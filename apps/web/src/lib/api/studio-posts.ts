import { cookies } from 'next/headers';
import {
  API_PREFIX,
  SESSION_COOKIE,
  type StudioMediaList,
  studioMediaListSchema,
  type StudioPost,
  type StudioPostList,
  studioPostListSchema,
  studioPostSchema,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/** GET with only the session cookie forwarded; null when logged out or the API answers a `nullOn` status. */
async function getAsCreator(path: string, nullOn: number[]): Promise<unknown> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}${path}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: 'no-store',
  });
  if (nullOn.includes(res.status)) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

/** Server only. The approved creator's own posts, or null (logged out / not approved). */
export async function getMyPosts(): Promise<StudioPostList | null> {
  const body = await getAsCreator('/creators/me/posts', [401, 403]);
  return body === null ? null : studioPostListSchema.parse(body);
}

/** Server only. One of the creator's own posts, or null (also for a malformed, unknown or foreign id). */
export async function getMyPost(id: string): Promise<StudioPost | null> {
  const body = await getAsCreator(
    `/creators/me/posts/${encodeURIComponent(id)}`,
    [400, 401, 403, 404],
  );
  return body === null ? null : studioPostSchema.parse(body);
}

/** Server only. READY media of one of the creator's own posts, or null (same cases as getMyPost). */
export async function getMyPostMedia(postId: string): Promise<StudioMediaList | null> {
  const body = await getAsCreator(
    `/creators/me/posts/${encodeURIComponent(postId)}/media`,
    [400, 401, 403, 404],
  );
  return body === null ? null : studioMediaListSchema.parse(body);
}
