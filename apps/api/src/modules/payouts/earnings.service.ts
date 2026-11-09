import { Injectable, Logger } from '@nestjs/common';
import {
  EARNINGS_PENDING_DAYS,
  type EarningsActivityPage,
  type EarningsActivityQuery,
  type EarningsBalance,
} from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';
import { writtenInstant } from '../../common/db-time.js';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  decodeLedgerCursor,
  formatLedgerCursor,
  ledgerCursorSchema,
} from '../wallets/ledger-cursor.js';
import { WALLET_PAGE_SIZE } from '../wallets/wallets.service.js';
import { ACTIVITY_SOURCE, type ActivityRow, toActivityItem } from './earnings-activity.js';

/** Payouts that hold earnings back from `available`. The admin feature extends this if it adds statuses. */
const RESERVING_STATUS = 'REQUESTED';

/** Everything in integer IDR (BigInt); {@link EarningsService.balance} turns it into JSON numbers. */
export interface EarningsBalanceRaw {
  pendingIdr: bigint;
  availableIdr: bigint;
  reservedIdr: bigint;
  paidOutIdr: bigint;
  nextMaturityMs: number | null;
  nextMaturityIdr: bigint;
}

type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * A creator's earnings (creator-studio US-060), computed on read from the revenue ledger and the payouts; there is no
 * stored balance that could drift. All amounts are integer rupiah and all time is the database clock.
 *
 *   matured   = CREATOR ledger rows whose accrues_at + 14 days has passed
 *   pending   = the rest (a scheduled subscription period accrues at its start, so it matures 14 days after it starts)
 *   available = matured − reserved (REQUESTED payouts) − paid out (PAID_OUT payouts)
 *
 * Rows are summed per source (purchase, period, tip), so a cancelled scheduled renewal (a SALE plus its REVERSAL with the
 * same accrues_at) nets to zero and never shows up as pending or as the next maturity.
 */
@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Also used inside the payout request transaction (US-063), after it locked the creator row, so a concurrent request
   * cannot read a balance that ignores it. `now()` is the transaction start: one instant for the whole statement.
   */
  async balanceInTx(db: Db, creatorProfileId: string): Promise<EarningsBalanceRaw> {
    const [row] = await db.$queryRaw<
      {
        matured: bigint;
        pending: bigint;
        next_ms: bigint | null;
        next_idr: bigint;
        reserved: bigint;
        paid: bigint;
      }[]
    >`
      WITH src AS (
        SELECT ${writtenInstant('MIN(accrues_at)')} + make_interval(days => ${EARNINGS_PENDING_DAYS}::int) AS matures_at,
               SUM(amount_idr) AS net
        FROM revenue_ledger_entries
        WHERE creator_profile_id = ${creatorProfileId}::uuid AND account = 'CREATOR'
        GROUP BY source_type, source_id
      ), pending AS (
        SELECT matures_at, net FROM src WHERE matures_at > now() AND net > 0
      ), next AS (
        SELECT MIN(matures_at) AS at FROM pending
      )
      SELECT
        COALESCE((SELECT SUM(net) FROM src WHERE matures_at <= now()), 0)::bigint AS matured,
        COALESCE((SELECT SUM(net) FROM src WHERE matures_at > now()), 0)::bigint AS pending,
        (SELECT (extract(epoch FROM at) * 1000)::bigint FROM next) AS next_ms,
        COALESCE((
          SELECT SUM(p.net) FROM pending p, next n
          WHERE (p.matures_at AT TIME ZONE 'Asia/Jakarta')::date = (n.at AT TIME ZONE 'Asia/Jakarta')::date
        ), 0)::bigint AS next_idr,
        COALESCE((
          SELECT SUM(amount_idr) FROM creator_payouts
          WHERE creator_profile_id = ${creatorProfileId}::uuid AND status = ${RESERVING_STATUS}::payout_status
        ), 0)::bigint AS reserved,
        COALESCE((
          SELECT SUM(amount_idr) FROM creator_payouts
          WHERE creator_profile_id = ${creatorProfileId}::uuid AND status = 'PAID_OUT'::payout_status
        ), 0)::bigint AS paid`;
    const r = row!;
    let available = r.matured - r.reserved - r.paid;
    if (available < 0n) {
      // Payouts are capped by the available balance under a lock, so this means a bug or a manual change: say so, never hide it.
      this.logger.error(
        `negative available earnings for creator ${creatorProfileId}: matured ${r.matured}, reserved ${r.reserved}, paid ${r.paid}`,
      );
      available = 0n;
    }
    return {
      pendingIdr: r.pending,
      availableIdr: available,
      reservedIdr: r.reserved,
      paidOutIdr: r.paid,
      nextMaturityMs: r.next_ms === null ? null : Number(r.next_ms),
      nextMaturityIdr: r.next_idr,
    };
  }

  /** GET /me/earnings. Own creator only; the caller passes `req.creatorProfileId`. */
  async balance(creatorProfileId: string): Promise<EarningsBalance> {
    const raw = await this.balanceInTx(this.prisma, creatorProfileId);
    return {
      pendingIdr: toSafeInt(raw.pendingIdr),
      availableIdr: toSafeInt(raw.availableIdr),
      reservedIdr: toSafeInt(raw.reservedIdr),
      paidOutIdr: toSafeInt(raw.paidOutIdr),
      nextMaturityAt:
        raw.nextMaturityMs === null ? null : new Date(raw.nextMaturityMs).toISOString(),
      nextMaturityIdr: toSafeInt(raw.nextMaturityIdr),
    };
  }

  /**
   * GET /me/earnings/activity: the caller's CREATOR revenue rows, newest first, keyset-paged (same cursor and page size
   * as the wallet ledger). The cursor is compared as integer epoch milliseconds, never as a JS Date parameter (see
   * writtenInstant). The buyer is a LEFT JOIN so a row can never disappear from a creator's history; only the buyer's
   * display name and a caption excerpt leave the API.
   */
  async activity(
    creatorProfileId: string,
    query: Pick<EarningsActivityQuery, 'type' | 'cursor'>,
  ): Promise<EarningsActivityPage> {
    let after = Prisma.empty;
    if (query.cursor !== undefined) {
      if (!ledgerCursorSchema.safeParse(query.cursor).success) {
        throw new DomainError('VALIDATION_FAILED', {
          issues: [{ path: 'cursor', message: 'Cursor tidak valid.' }],
        });
      }
      const cursor = decodeLedgerCursor(query.cursor);
      after = Prisma.sql`WHERE (q.created_ms, q.id) < (${cursor.ms}::bigint, ${cursor.id}::uuid)`;
    }
    const onlyType =
      query.type === 'all'
        ? Prisma.empty
        : Prisma.sql`AND r.source_type = ${ACTIVITY_SOURCE[query.type]}::revenue_source_type`;
    const rows = await this.prisma.$queryRaw<ActivityRow[]>`
      SELECT * FROM (
        SELECT r.id, r.kind::text AS kind, r.source_type::text AS source_type, r.amount_idr, r.gross_idr, r.fee_bps,
               (extract(epoch FROM ${writtenInstant('r.created_at')}) * 1000)::bigint AS created_ms,
               (extract(epoch FROM ${writtenInstant('r.accrues_at')}) * 1000)::bigint AS accrues_ms,
               (${writtenInstant('r.accrues_at')} + make_interval(days => ${EARNINGS_PENDING_DAYS}::int) <= now()) AS available,
               u.display_name AS buyer_name,
               p.caption AS post_caption
        FROM revenue_ledger_entries r
        LEFT JOIN post_purchases pp ON r.source_type = 'POST_PURCHASE' AND pp.id = r.source_id
        LEFT JOIN subscription_periods sp ON r.source_type = 'SUBSCRIPTION_PERIOD' AND sp.id = r.source_id
        LEFT JOIN tips t ON r.source_type = 'TIP' AND t.id = r.source_id
        LEFT JOIN users u ON u.id = COALESCE(pp.user_id, sp.user_id, t.user_id)
        LEFT JOIN posts p ON p.id = COALESCE(pp.post_id, t.post_id)
        WHERE r.creator_profile_id = ${creatorProfileId}::uuid AND r.account = 'CREATOR' ${onlyType}
      ) q
      ${after}
      ORDER BY q.created_ms DESC, q.id DESC
      LIMIT ${WALLET_PAGE_SIZE + 1}`;
    const page = rows.slice(0, WALLET_PAGE_SIZE);
    return {
      items: page.map(toActivityItem),
      nextCursor:
        rows.length > WALLET_PAGE_SIZE
          ? formatLedgerCursor(page.at(-1)!.created_ms, page.at(-1)!.id)
          : null,
    };
  }
}
