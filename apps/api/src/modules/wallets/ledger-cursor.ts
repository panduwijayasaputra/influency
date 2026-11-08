import { z } from 'zod';

const CURSOR = /^(\d{1,15})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Opaque to clients: `<created_at ms>_<id>` of the last entry on the page (newest first). */
export const ledgerCursorSchema = z.string().regex(CURSOR, 'Cursor tidak valid.');

export const encodeLedgerCursor = (row: { createdAt: Date; id: string }) =>
  `${row.createdAt.getTime()}_${row.id}`;

/** Keyset filter for the entries after the cursor in (created_at DESC, id DESC). Throws on a malformed cursor. */
export function ledgerCursorWhere(cursor: string) {
  const m = CURSOR.exec(cursor);
  if (!m) throw new Error('invalid ledger cursor');
  const createdAt = new Date(Number(m[1]));
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: m[2]! } }] };
}
