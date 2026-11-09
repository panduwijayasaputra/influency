import { z } from 'zod';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RECENT = new RegExp(`^r_(\\d{1,15})_(${UUID})$`);
const NAME = new RegExp(`^n_([A-Za-z0-9_-]{0,400})_(${UUID})$`);

/** Opaque to clients: `r_<followed at ms>_<follow id>` (recent) or `n_<base64url lower-cased name>_<follow id>` (name). */
export const followingCursorSchema = z
  .string()
  .refine((c) => RECENT.test(c) || NAME.test(c), 'Cursor tidak valid.');

export const encodeRecentCursor = (row: { createdAt: Date; id: string }) =>
  `r_${row.createdAt.getTime()}_${row.id}`;
export const encodeNameCursor = (row: { sortName: string; id: string }) =>
  `n_${Buffer.from(row.sortName, 'utf8').toString('base64url')}_${row.id}`;

/** The position after a "recent" cursor, or null when the cursor belongs to the other sort. */
export function parseRecentCursor(cursor: string): { createdAt: Date; id: string } | null {
  const m = RECENT.exec(cursor);
  return m ? { createdAt: new Date(Number(m[1])), id: m[2]! } : null;
}

/** The position after a "name" cursor, or null when the cursor belongs to the other sort. */
export function parseNameCursor(cursor: string): { sortName: string; id: string } | null {
  const m = NAME.exec(cursor);
  return m ? { sortName: Buffer.from(m[1]!, 'base64url').toString('utf8'), id: m[2]! } : null;
}
