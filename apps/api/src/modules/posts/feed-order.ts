import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * PLACEHOLDER Home feed order (feature.md: the ranking is OPEN, not final policy): newest published first.
 * This file is the only place that knows the order, so swapping the ranking means changing it and the cursor below.
 */
export const FEED_ORDER: Prisma.PostOrderByWithRelationInput[] = [
  { publishedAt: 'desc' },
  { id: 'desc' },
];

const CURSOR = /^(\d{1,15})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Opaque to clients: `<publishedAt ms>_<id>` of the last post on the page. */
export const feedCursorSchema = z.string().regex(CURSOR, 'Cursor tidak valid.');

export const encodeFeedCursor = (row: { publishedAt: Date; id: string }) =>
  `${row.publishedAt.getTime()}_${row.id}`;

/**
 * Keyset filter for the posts after the cursor in FEED_ORDER. Posts published after page 1 sort above the cursor, so
 * later pages never repeat or skip a post. Throws on a malformed cursor.
 */
export function feedCursorWhere(cursor: string) {
  const m = CURSOR.exec(cursor);
  if (!m) throw new Error('invalid feed cursor');
  const publishedAt = new Date(Number(m[1]));
  return { OR: [{ publishedAt: { lt: publishedAt } }, { publishedAt, id: { lt: m[2]! } }] };
}
