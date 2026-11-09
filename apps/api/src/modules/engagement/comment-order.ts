import { z } from 'zod';

/**
 * PLACEHOLDER Top order (feature.md: the formula is OPEN, not final policy): likes descending, then newest first.
 * Ids are uuidv7, so `id desc` is newest first. This file is the only place that knows the formula.
 * shortcut: a like landing between two page loads can move one item across the page boundary; revisit with the real formula.
 */
export const TOP_ORDER = [{ likeCount: 'desc' }, { id: 'desc' }] as const;

const CURSOR = /^(\d{1,9})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Opaque to clients: `<likeCount>_<id>` of the last item on the page. */
export const topCursorSchema = z.string().regex(CURSOR, 'Cursor tidak valid.');

export const encodeTopCursor = (row: { likeCount: number; id: string }) =>
  `${row.likeCount}_${row.id}`;

/** Keyset filter for the rows after the cursor in TOP_ORDER. Throws on a malformed cursor. */
export function topCursorWhere(cursor: string) {
  const m = CURSOR.exec(cursor);
  if (!m) throw new Error('invalid top cursor');
  const likeCount = Number(m[1]);
  return { OR: [{ likeCount: { lt: likeCount } }, { likeCount, id: { lt: m[2]! } }] };
}
