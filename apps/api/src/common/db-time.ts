import { Prisma } from '../generated/prisma/client.js';

/**
 * The database clock at this moment (`clock_timestamp()`, not the transaction start), so decisions about periods and
 * access use one server time source even when a transaction waited on a lock first.
 *
 * Read as epoch milliseconds on purpose: a raw `timestamptz` comes back in the session time zone and the driver adapter
 * can drop the offset (seen as a +7h shift with Asia/Jakarta), while an integer cannot be misread.
 */
export async function dbNow(client: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<Date> {
  const [row] = await client.$queryRaw<
    { ms: bigint }[]
  >`SELECT (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms`;
  return new Date(Number(row!.ms));
}

/**
 * SQL for the instant a JS `Date` meant when it was written to `column` through Prisma (a timestamptz column).
 *
 * Why: the driver adapter sends a Date as its UTC wall-clock digits without an offset, and the database reads them in
 * the session time zone, so a Date written from JS is stored `session offset` away from the instant it meant (Asia/
 * Bangkok: 7 h early). Reading it back through a Prisma model undoes the shift (it drops the offset again), which is
 * why the app is consistent in JS; SQL that compares such a column with `now()` is not. This turns the stored value
 * back into the intended instant, and is a no-op when the session runs in UTC. Use it for columns the application
 * writes through Prisma. That includes `createdAt @default(now())` columns: Prisma fills those in from JS too, so they are
 * shifted the same way (only a row inserted by raw SQL gets the true database default).
 * `column` is a column or an aggregate such as `MIN(accrues_at)`: fixed text from our own code, never user input.
 */
export const writtenInstant = (column: string): Prisma.Sql =>
  Prisma.sql`((${Prisma.raw(column)} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC')`;
