import { Injectable } from '@nestjs/common';
import { CREATOR_SEARCH_LIMIT, type CreatorSearchResponse } from '@influency/shared';
import { PrismaService } from '../../common/prisma.service.js';
import { imageUrl, PUBLIC_CREATOR } from '../creators/creator-profile.service.js';

/** Rows fetched before ranking; the exact slug is looked up separately so it is never cut off. */
const CANDIDATES = 50;

type Row = { slug: string; displayName: string; avatarKey: string | null };

/** Prisma `contains` builds LIKE '%value%' without escaping, so the query's own \ % _ must be escaped here. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** Exact slug first, then slug prefix, then other matches; ties by display name. Pure, for unit tests. */
export function rankCreatorMatches<T extends { slug: string; displayName: string }>(
  needle: string,
  rows: T[],
): T[] {
  const rank = (r: T) => (r.slug === needle ? 0 : r.slug.startsWith(needle) ? 1 : 2);
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName, 'id'),
  );
}

/** Jelajahi → Cari (US-070): visible creators whose name or slug contains the query. */
@Injectable()
export class CreatorSearchService {
  constructor(private readonly prisma: PrismaService) {}

  // shortcut: ILIKE '%q%' scans creator_profiles; add a pg_trgm index when creators reach the thousands.
  async search(q: string): Promise<CreatorSearchResponse> {
    const text = q.trim();
    const needle = text.toLowerCase();
    const select = { slug: true, displayName: true, avatarKey: true } as const;
    const [exact, rows] = await Promise.all([
      this.prisma.creatorProfile.findFirst({
        where: { slug: needle, ...PUBLIC_CREATOR },
        select,
      }),
      this.prisma.creatorProfile.findMany({
        where: {
          ...PUBLIC_CREATOR,
          // The value is a bound parameter (no SQL injection); escapeLike keeps % and _ literal.
          OR: [
            { slug: { contains: escapeLike(needle) } },
            { displayName: { contains: escapeLike(text), mode: 'insensitive' } },
          ],
        },
        select,
        orderBy: { slug: 'asc' },
        take: CANDIDATES,
      }),
    ]);
    const unique = new Map<string, Row>(rows.map((r) => [r.slug, r]));
    if (exact) unique.set(exact.slug, exact);
    return {
      creators: rankCreatorMatches(needle, [...unique.values()])
        .slice(0, CREATOR_SEARCH_LIMIT)
        .map((r) => ({
          slug: r.slug,
          displayName: r.displayName,
          avatarUrl: imageUrl(r.slug, r.avatarKey),
        })),
    };
  }
}
