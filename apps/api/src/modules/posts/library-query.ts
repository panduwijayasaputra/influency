import { z } from 'zod';
import type { LibraryQuery } from '@influency/shared';
import { Prisma } from '../../generated/prisma/client.js';

const CURSOR = /^(\d{1,15})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Opaque to clients: `<addedAt ms>_<postId>` of the last item on the page. */
export const libraryCursorSchema = z.string().regex(CURSOR, 'Cursor tidak valid.');

export const encodeLibraryCursor = (row: { addedMs: number; id: string }) =>
  `${row.addedMs}_${row.id}`;

function parseLibraryCursor(cursor: string): { addedMs: bigint; id: string } {
  const m = CURSOR.exec(cursor);
  if (!m) throw new Error('invalid library cursor');
  return { addedMs: BigInt(m[1]!), id: m[2]! };
}

/**
 * Which posts are in a user's Koleksi Saya. Mirrors PUBLIC_CREATOR (APPROVED creator, ACTIVE owner; the
 * integration spec fails if the two diverge).
 * - Dibeli = a post_purchases row. It stays listed while the post is PUBLISHED or ARCHIVED (spec §4.1); a REMOVED
 *   (legal takedown) post is not.
 * - Disimpan = a post_saves row. Listed only while the post is PUBLISHED.
 * userId is the session's user and is always a bound parameter.
 */
const available = (userId: string) => Prisma.sql`
  FROM posts p
  JOIN creator_profiles cp ON cp.id = p.creator_profile_id AND cp.status = 'APPROVED'
  JOIN users u ON u.id = cp.user_id AND u.status = 'ACTIVE'
  LEFT JOIN post_saves ps ON ps.post_id = p.id AND ps.user_id = ${userId}::uuid
  LEFT JOIN post_purchases pp ON pp.post_id = p.id AND pp.user_id = ${userId}::uuid
  WHERE ((pp.id IS NOT NULL AND p.status IN ('PUBLISHED', 'ARCHIVED'))
      OR (ps.id IS NOT NULL AND p.status = 'PUBLISHED'))`;

export interface LibrarySqlRow {
  postId: string;
  saved: boolean;
  purchased: boolean;
  addedMs: bigint;
}

/**
 * One keyset page: `take` rows (callers ask for page size + 1) ordered by the later of the save / purchase time, then
 * post id. Times are compared and returned as epoch milliseconds: a raw timestamptz can come back shifted by the
 * driver adapter (see `dbNow`), an integer cannot.
 */
export function libraryPageSql(userId: string, q: LibraryQuery, take: number): Prisma.Sql {
  const relation =
    q.relation === 'saved'
      ? Prisma.sql`AND ps.id IS NOT NULL`
      : q.relation === 'purchased'
        ? Prisma.sql`AND pp.id IS NOT NULL`
        : Prisma.empty;
  const creator = q.creator ? Prisma.sql`AND lower(cp.slug) = lower(${q.creator})` : Prisma.empty;
  const media =
    q.media === 'all'
      ? Prisma.empty
      : Prisma.sql`AND EXISTS (
          SELECT 1 FROM media_assets m
          WHERE m.post_id = p.id AND m.status = 'READY' AND m.kind = ${q.media === 'image' ? 'IMAGE' : 'VIDEO'}::media_kind)`;
  const oldest = q.sort === 'oldest';
  const cursor = q.cursor
    ? (() => {
        const c = parseLibraryCursor(q.cursor);
        return oldest
          ? Prisma.sql`WHERE (added_ms, post_id) > (${c.addedMs}::bigint, ${c.id}::uuid)`
          : Prisma.sql`WHERE (added_ms, post_id) < (${c.addedMs}::bigint, ${c.id}::uuid)`;
      })()
    : Prisma.empty;
  const order = oldest
    ? Prisma.sql`ORDER BY added_ms ASC, post_id ASC`
    : Prisma.sql`ORDER BY added_ms DESC, post_id DESC`;
  return Prisma.sql`
    WITH items AS (
      SELECT p.id AS post_id,
             (ps.id IS NOT NULL) AS saved,
             (pp.id IS NOT NULL) AS purchased,
             (extract(epoch FROM GREATEST(ps.created_at, pp.created_at)) * 1000)::bigint AS added_ms
      ${available(userId)}
      ${relation} ${creator} ${media}
    )
    SELECT post_id AS "postId", saved, purchased, added_ms AS "addedMs"
    FROM items
    ${cursor}
    ${order}
    LIMIT ${take}`;
}

/** The creators in the user's whole collection (any relation, media or creator filter), for the dropdown. */
export function libraryCreatorsSql(userId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT cp.slug AS "slug", cp.display_name AS "displayName"
    ${available(userId)}
    ORDER BY cp.display_name, cp.slug`;
}
