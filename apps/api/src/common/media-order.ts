import type { Prisma } from '../generated/prisma/client.js';

/**
 * The one display order of a post's media (creator-studio US-059): the creator's `position`, then created_at, id as
 * tie-breakers (rows made before positions existed, or inserted directly, share position 0). Studio, public, feed,
 * detail and media-access all read media in this order, so a post looks the same everywhere.
 */
export const MEDIA_ORDER = [
  { position: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.MediaAssetOrderByWithRelationInput[];
