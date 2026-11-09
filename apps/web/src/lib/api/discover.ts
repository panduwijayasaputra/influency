import {
  API_PREFIX,
  type CreatorSearchResult,
  creatorSearchResponseSchema,
  type DiscoverVideosPage,
  discoverVideosPageSchema,
} from '@influency/shared';

/** One Jelajahi page of free creator videos, newest first. `cursor` is opaque (null = first page). */
export async function fetchDiscoverVideosPage(cursor: string | null): Promise<DiscoverVideosPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await fetch(`/${API_PREFIX}/discover/videos${query}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /discover/videos failed: ${res.status}`);
  return discoverVideosPageSchema.parse(await res.json());
}

/** Visible creators whose name or slug contains `q` (case-insensitive), best matches first. */
export async function searchCreators(q: string): Promise<CreatorSearchResult[]> {
  const res = await fetch(`/${API_PREFIX}/discover/creators?q=${encodeURIComponent(q)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`GET /discover/creators failed: ${res.status}`);
  return creatorSearchResponseSchema.parse(await res.json()).creators;
}
