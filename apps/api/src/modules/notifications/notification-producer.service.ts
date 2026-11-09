import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@influency/shared';
import { writtenInstant } from '../../common/db-time.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { DEFAULT_OPT_OUT_TYPES, TRANSACTIONAL_TYPES } from './notification-types.js';

export interface NotifyInput {
  /** Recipient. */
  userId: string;
  type: NotificationType;
  /** Deterministic per event (e.g. `topup:{orderId}`): retries and duplicate triggers create one row. */
  dedupeKey: string;
  actorUserId?: string;
  creatorProfileId?: string;
  postId?: string;
  commentId?: string;
  sourceId?: string;
  coins?: bigint;
}

type Db = Pick<PrismaService, '$executeRaw'>;
type Tx = Prisma.TransactionClient;

/**
 * Inserts the rows a candidates query yields (columns: user_id, type, actor_user_id, creator_profile_id, post_id,
 * comment_id, source_id, coins, dedupe_key) as notifications, plus one Telegram delivery job for each new row whose
 * recipient connected and allowed Telegram (US-074). Skips inactive recipients, self-notifications and opted-out types
 * (transactional types ignore opt-outs). Duplicate (user, dedupe_key) rows are ignored, so every trigger is idempotent.
 *
 * Timestamps are bound from a JS Date, not the column default, so they are stored exactly like every timestamp Prisma
 * writes and read back correctly through Prisma (the session time zone shift explained in `common/db-time.ts`). SQL
 * that compares them with now() must use `writtenInstant`.
 */
export function notificationInsertSql(candidates: Prisma.Sql, at = new Date()): Prisma.Sql {
  return Prisma.sql`
    WITH candidates AS (${candidates}),
    inserted AS (
      INSERT INTO notifications
        (user_id, type, actor_user_id, creator_profile_id, post_id, comment_id, source_id, coins, dedupe_key,
         created_at)
      SELECT c.user_id, c.type, c.actor_user_id, c.creator_profile_id, c.post_id, c.comment_id, c.source_id,
             c.coins, c.dedupe_key, ${at}::timestamptz
      FROM candidates c
      JOIN users u ON u.id = c.user_id AND u.status = 'ACTIVE'
      LEFT JOIN notification_preferences p ON p.user_id = c.user_id
      WHERE c.user_id IS DISTINCT FROM c.actor_user_id
        AND (c.type = ANY (${TRANSACTIONAL_TYPES}::text[]::notification_type[])
             OR NOT (c.type = ANY (COALESCE(p.opt_out_types, ${DEFAULT_OPT_OUT_TYPES}::text[]::notification_type[]))))
      ON CONFLICT (user_id, dedupe_key) DO NOTHING
      RETURNING id, user_id
    )
    INSERT INTO notification_jobs (notification_id, next_attempt_at, created_at, updated_at)
    SELECT i.id, ${at}::timestamptz, ${at}::timestamptz, ${at}::timestamptz
    FROM inserted i
    JOIN notification_preferences p ON p.user_id = i.user_id
    WHERE p.telegram_allowed AND p.telegram_chat IS NOT NULL`;
}

/** One candidate row from explicit values. */
function single(n: NotifyInput): Prisma.Sql {
  return Prisma.sql`SELECT ${n.userId}::uuid AS user_id, ${n.type}::notification_type AS type,
    ${n.actorUserId ?? null}::uuid AS actor_user_id, ${n.creatorProfileId ?? null}::uuid AS creator_profile_id,
    ${n.postId ?? null}::uuid AS post_id, ${n.commentId ?? null}::uuid AS comment_id,
    ${n.sourceId ?? null}::uuid AS source_id, ${n.coins ?? null}::bigint AS coins, ${n.dedupeKey}::text AS dedupe_key`;
}

/**
 * Writes notifications (US-072). The notification row is the outbox: in a business transaction it commits or rolls
 * back with the change. It can never undo money: inside a transaction it runs under a savepoint, and any failure
 * rolls back to it and is logged. No method throws.
 */
@Injectable()
export class NotificationProducer {
  private readonly logger = new Logger(NotificationProducer.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Inside a business transaction (savepoint-protected). */
  notifyInTx(tx: Tx, input: NotifyInput): Promise<void> {
    return this.inSavepoint(tx, input.type, notificationInsertSql(single(input)));
  }

  /** Outside a transaction (e.g. after a comment is committed). */
  async notify(input: NotifyInput): Promise<void> {
    await this.run(this.prisma, input.type, notificationInsertSql(single(input)));
  }

  /**
   * NEW_POST to every follower of the creator, in the publish transaction. The dedupe key holds the time window, so a
   * follower gets at most one new-post notification per creator per NEW_POST_NOTIFY_WINDOW_MINUTES (the first post).
   * shortcut: fans out inside the publish transaction; move it out (poll recent publishes) past ~10k followers.
   */
  notifyNewPostInTx(
    tx: Tx,
    p: { creatorProfileId: string; creatorUserId: string; postId: string; now: Date },
  ): Promise<void> {
    const windowMs = this.env.NEW_POST_NOTIFY_WINDOW_MINUTES * 60_000;
    const dedupeKey = `new-post:${p.creatorProfileId}:${Math.floor(p.now.getTime() / windowMs)}`;
    const candidates = Prisma.sql`
      SELECT f.user_id, 'NEW_POST'::notification_type AS type, ${p.creatorUserId}::uuid AS actor_user_id,
             ${p.creatorProfileId}::uuid AS creator_profile_id, ${p.postId}::uuid AS post_id,
             NULL::uuid AS comment_id, NULL::uuid AS source_id, NULL::bigint AS coins, ${dedupeKey}::text AS dedupe_key
      FROM creator_follows f
      WHERE f.creator_profile_id = ${p.creatorProfileId}::uuid`;
    return this.inSavepoint(tx, 'NEW_POST', notificationInsertSql(candidates));
  }

  /**
   * SUBSCRIPTION_ENDING for periods ending within SUBSCRIPTION_REMINDER_LEAD_HOURS (DB time) that have no renewal
   * scheduled after them. One per period (dedupe key), so running the sweep again creates nothing new.
   */
  async remindEndingSubscriptions(): Promise<void> {
    // ends_at is written from JS through Prisma: compare its intended instant with the DB clock.
    const endsAt = writtenInstant('sp.ends_at');
    const candidates = Prisma.sql`
      SELECT sp.user_id, 'SUBSCRIPTION_ENDING'::notification_type AS type, NULL::uuid AS actor_user_id,
             sp.creator_profile_id, NULL::uuid AS post_id, NULL::uuid AS comment_id, sp.id AS source_id,
             NULL::bigint AS coins, 'subscription-ending:' || sp.id AS dedupe_key
      FROM subscription_periods sp
      WHERE sp.canceled_at IS NULL
        AND ${endsAt} > now()
        AND ${endsAt} <= now() + make_interval(hours => ${this.env.SUBSCRIPTION_REMINDER_LEAD_HOURS}::int)
        AND NOT EXISTS (
          SELECT 1 FROM subscription_periods nx
          WHERE nx.user_id = sp.user_id AND nx.creator_profile_id = sp.creator_profile_id
            AND nx.canceled_at IS NULL AND nx.starts_at >= sp.ends_at)`;
    await this.run(this.prisma, 'SUBSCRIPTION_ENDING', notificationInsertSql(candidates));
  }

  private async inSavepoint(tx: Tx, type: string, sql: Prisma.Sql): Promise<void> {
    try {
      await tx.$executeRawUnsafe('SAVEPOINT notify');
    } catch (err) {
      this.warn(type, err);
      return;
    }
    try {
      await tx.$executeRaw(sql);
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT notify');
    } catch (err) {
      this.warn(type, err);
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT notify').catch(() => {});
    }
  }

  private async run(db: Db, type: string, sql: Prisma.Sql): Promise<void> {
    try {
      await db.$executeRaw(sql);
    } catch (err) {
      this.warn(type, err);
    }
  }

  /** Type and error message only: no recipient ids or PII. */
  private warn(type: string, err: unknown): void {
    this.logger.warn(`notification ${type} not written: ${(err as Error).message}`);
  }
}
