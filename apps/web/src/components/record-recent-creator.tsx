'use client';

import { useEffect } from 'react';
import { addRecentCreator, type RecentCreator } from '@/lib/recent-creators';

/** Adds the opened creator profile to "Baru dilihat" on this device (US-066). Renders nothing. */
export function RecordRecentCreator({ creator }: { creator: RecentCreator }) {
  const { slug, displayName, avatarUrl } = creator;
  useEffect(() => {
    addRecentCreator({ slug, displayName, avatarUrl });
  }, [slug, displayName, avatarUrl]);
  return null;
}
