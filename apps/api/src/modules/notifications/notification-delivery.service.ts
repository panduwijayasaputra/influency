import { Inject, Injectable } from '@nestjs/common';
import { writtenInstant } from '../../common/db-time.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TELEGRAM_BOT, type TelegramBot } from '../../common/telegram-bot.js';
import { NotificationsService } from './notifications.service.js';

/** A claimed job is not picked up again for this long (crash safety across API instances). */
const LEASE_MS = 60_000;
const BASE_BACKOFF_MS = 30_000;

/** Backoff after `attempts` failed sends: 30 s, 60 s, 120 s, … */
export const retryDelayMs = (attempts: number) => BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);

type Claimed = { id: string; notificationId: string; attempts: number };

/**
 * Sends queued notifications through the official bot (US-074). The message is the same text and link as the inbox
 * (summary + website link only; never media, comment text or payout details). Never touches the inbox row or money.
 */
@Injectable()
export class NotificationDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot | null,
  ) {}

  /** Claims up to `limit` due jobs (SKIP LOCKED + lease, so instances never share one) and sends them. */
  async deliverDue(limit = 20): Promise<number> {
    if (!this.bot) return 0;
    const now = new Date();
    // Timestamps are bound from JS like Prisma writes them; compare with the DB clock via writtenInstant.
    const claimed = await this.prisma.$queryRaw<Claimed[]>`
      UPDATE notification_jobs j
      SET next_attempt_at = ${new Date(now.getTime() + LEASE_MS)}::timestamptz,
          attempts = j.attempts + 1,
          updated_at = ${now}::timestamptz
      WHERE j.id IN (
        SELECT id FROM notification_jobs
        WHERE status = 'PENDING' AND ${writtenInstant('next_attempt_at')} <= now()
        ORDER BY next_attempt_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      RETURNING j.id, j.notification_id AS "notificationId", j.attempts`;
    for (const job of claimed) await this.deliver(this.bot, job);
    return claimed.length;
  }

  private async deliver(bot: TelegramBot, job: Claimed): Promise<void> {
    const rendered = await this.notifications.render(job.notificationId);
    const prefs = rendered
      ? await this.prisma.notificationPreference.findUnique({
          where: { userId: rendered.userId },
          select: { telegramAllowed: true, telegramChat: true },
        })
      : null;
    // Opted out or unlinked since the job was queued.
    if (!rendered || !prefs?.telegramAllowed || prefs.telegramChat === null) {
      await this.finish(job.id, 'SKIPPED');
      return;
    }
    const { item } = rendered;
    const text = `${item.actor ? `${item.actor.displayName} ` : ''}${item.text}\n${this.env.WEB_ORIGIN.replace(/\/$/, '')}${item.href}`;
    const res = await bot.sendMessage(prefs.telegramChat, text);
    if (res.ok) {
      await this.finish(job.id, 'SENT');
      return;
    }
    if (res.permanent) {
      await this.finish(job.id, 'FAILED', res.code);
      // Blocked bot / unknown chat: stop all deliveries to this user instead of retrying every message.
      await this.prisma.notificationPreference.update({
        where: { userId: rendered.userId },
        data: { telegramAllowed: false },
      });
      return;
    }
    if (job.attempts >= this.env.NOTIFICATION_MAX_ATTEMPTS) {
      await this.finish(job.id, 'FAILED', res.code);
      return;
    }
    const delay =
      res.retryAfterSeconds !== undefined
        ? res.retryAfterSeconds * 1000
        : retryDelayMs(job.attempts);
    await this.prisma.notificationJob.update({
      where: { id: job.id },
      data: { nextAttemptAt: new Date(Date.now() + delay), lastError: res.code },
    });
  }

  private finish(id: string, status: 'SENT' | 'SKIPPED' | 'FAILED', lastError?: string) {
    return this.prisma.notificationJob.update({
      where: { id },
      data: {
        status,
        ...(status === 'SENT' && { sentAt: new Date() }),
        ...(lastError && { lastError }),
      },
    });
  }
}
