import type { Prisma } from '../../generated/prisma/client.js';

/**
 * PLACEHOLDER ranking for "Creator untukmu" (see .agile/features/home-feed/feature.md): follower count, then newest.
 * The one place to swap for real ranking.
 * shortcut: counts every follow while the response shows ACTIVE followers only (a suspended follower can nudge rank),
 * and counts per request; move to a cached count or materialized ranking past ~10k creators.
 */
export const RECOMMENDED_ORDER: Prisma.CreatorProfileOrderByWithRelationInput[] = [
  { follows: { _count: 'desc' } },
  { createdAt: 'desc' },
  { id: 'desc' },
];
