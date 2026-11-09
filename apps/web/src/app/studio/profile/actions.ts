'use server';

import { updateTag } from 'next/cache';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';

/**
 * Expires the cached public profile of the caller's own creator page after Edit Profil. The slug comes from the
 * session, never from the caller, so this can only refresh the caller's own page.
 */
export async function refreshOwnPublicProfile(): Promise<void> {
  const profile = await getMyCreatorProfile().catch(() => null);
  if (profile) updateTag(`creator:${profile.slug}`);
}
