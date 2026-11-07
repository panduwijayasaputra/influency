import { API_PREFIX, type HomeFeedPage, homeFeedPageSchema } from '@influency/shared';

/** One Home feed page, newest first. `cursor` is opaque (null = first page); the server leaves out the viewer's own posts. */
export async function fetchHomeFeedPage(cursor: string | null): Promise<HomeFeedPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await fetch(`/${API_PREFIX}/feed${query}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /feed failed: ${res.status}`);
  return homeFeedPageSchema.parse(await res.json());
}
