import {
  API_PREFIX,
  type LibraryPage,
  type LibraryQuery,
  libraryPageSchema,
} from '@influency/shared';

/**
 * One page of Koleksi Saya (GET /me/library). The server applies the filters and the sort; `cursor` is opaque
 * (undefined = first page). Defaults are left out of the query string.
 */
export async function fetchLibraryPage(query: LibraryQuery): Promise<LibraryPage> {
  const params = new URLSearchParams();
  if (query.relation !== 'all') params.set('relation', query.relation);
  if (query.media !== 'all') params.set('media', query.media);
  if (query.sort !== 'recent') params.set('sort', query.sort);
  if (query.creator) params.set('creator', query.creator);
  if (query.cursor) params.set('cursor', query.cursor);
  const qs = params.size > 0 ? `?${params}` : '';
  const res = await fetch(`/${API_PREFIX}/me/library${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /me/library failed: ${res.status}`);
  return libraryPageSchema.parse(await res.json());
}
