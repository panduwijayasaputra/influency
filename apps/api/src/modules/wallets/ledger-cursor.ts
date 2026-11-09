import { z } from 'zod';

const CURSOR = /^(\d{1,15})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Opaque to clients: `<created_at ms>_<id>` of the last entry on the page (newest first). */
export const ledgerCursorSchema = z.string().regex(CURSOR, 'Cursor tidak valid.');

/** The one cursor format, for rows read through Prisma models and for raw SQL rows (epoch ms from the database). */
export const formatLedgerCursor = (createdMs: number | bigint, id: string) => `${createdMs}_${id}`;

export const encodeLedgerCursor = (row: { createdAt: Date; id: string }) =>
  formatLedgerCursor(row.createdAt.getTime(), row.id);

/** Splits a cursor into its epoch milliseconds and id. Throws on a malformed cursor. */
export function decodeLedgerCursor(cursor: string): { ms: bigint; id: string } {
  const m = CURSOR.exec(cursor);
  if (!m) throw new Error('invalid ledger cursor');
  return { ms: BigInt(m[1]!), id: m[2]! };
}

/** Keyset filter for the entries after the cursor in (created_at DESC, id DESC). Throws on a malformed cursor. */
export function ledgerCursorWhere(cursor: string) {
  const { ms, id } = decodeLedgerCursor(cursor);
  const createdAt = new Date(Number(ms));
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}
