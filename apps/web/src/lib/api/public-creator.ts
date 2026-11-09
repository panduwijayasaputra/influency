import { cacheLife, cacheTag } from 'next/cache';
import {
  API_PREFIX,
  type CreatorProfileResponse,
  creatorProfileResponseSchema,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/** Server only. Public creator profile for /{creatorSlug}, or null when not found. Sends no cookies, so it's cached. */
export async function getPublicCreator(slug: string): Promise<CreatorProfileResponse | null> {
  'use cache';
  cacheLife('minutes');
  // Edit Profil expires this tag (studio/profile/actions.ts) so the owner sees a change at once.
  cacheTag(`creator:${slug}`);
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/creators/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /creators/:slug failed: ${res.status}`);
  return creatorProfileResponseSchema.parse(await res.json());
}
