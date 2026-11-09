import { Inject, Injectable } from '@nestjs/common';
import type {
  NotificationPreferences,
  NotificationType,
  UpdateNotificationPreferencesInput,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import { applyPatch, toToggles } from './notification-preferences.js';
import { DEFAULT_OPT_OUT_TYPES } from './notification-types.js';

/** The caller's notification choices (US-073). userId always comes from the session. */
@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Same rule as ApprovedCreatorGuard: an APPROVED creator profile. */
  private async isCreator(userId: string): Promise<boolean> {
    const row = await this.prisma.creatorProfile.findFirst({
      where: { userId, status: 'APPROVED' },
      select: { id: true },
    });
    return row !== null;
  }

  async get(userId: string): Promise<NotificationPreferences> {
    const [row, isCreator] = await Promise.all([
      this.prisma.notificationPreference.findUnique({
        where: { userId },
        select: { optOutTypes: true, telegramAllowed: true, telegramChat: true },
      }),
      this.isCreator(userId),
    ]);
    const linked = row?.telegramChat != null;
    return {
      ...toToggles(row?.optOutTypes ?? DEFAULT_OPT_OUT_TYPES, isCreator),
      telegram: {
        status: !this.env.TELEGRAM_BOT_TOKEN
          ? 'unavailable'
          : linked
            ? 'connected'
            : 'not_connected',
        // Delivery needs both the switch and a linked chat (US-074).
        allowed: linked && row.telegramAllowed,
      },
    };
  }

  /** Two quick toggles must not lose each other's change: the row is locked while the patch is applied. */
  async update(
    userId: string,
    patch: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferences> {
    if (patch.earnings !== undefined && !(await this.isCreator(userId))) {
      throw new DomainError('FORBIDDEN');
    }
    await this.prisma.$transaction(async (tx) => {
      // Create the row with the defaults first if needed, so there is always one row to lock.
      // (Prisma's upsert is find-then-create and races on UNIQUE user_id; ON CONFLICT doesn't.)
      await tx.$executeRaw`
        INSERT INTO notification_preferences (user_id, updated_at) VALUES (${userId}::uuid, ${new Date()}::timestamptz)
        ON CONFLICT (user_id) DO NOTHING`;
      await tx.$queryRaw`SELECT 1 FROM notification_preferences WHERE user_id = ${userId}::uuid FOR UPDATE`;
      // Read through Prisma (a raw enum array can come back as a '{…}' string).
      const current = await tx.notificationPreference.findUniqueOrThrow({
        where: { userId },
        select: { optOutTypes: true },
      });
      await tx.notificationPreference.update({
        where: { userId },
        data: {
          optOutTypes: applyPatch(current.optOutTypes as NotificationType[], patch),
          ...(patch.telegramAllowed !== undefined && { telegramAllowed: patch.telegramAllowed }),
        },
      });
    });
    return this.get(userId);
  }
}
