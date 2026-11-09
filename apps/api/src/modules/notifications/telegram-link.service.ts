import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TelegramLinkResponse } from '@influency/shared';
import { z } from 'zod';
import { sha256hex } from '../../common/crypto.js';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TELEGRAM_BOT, type TelegramBot } from '../../common/telegram-bot.js';

/** A /start link works once, for this long. */
export const LINK_TOKEN_TTL_MS = 15 * 60_000;

/** Only what we use from a Telegram update: a private chat's id and text. Anything else is ignored. */
const updateSchema = z.object({
  message: z.object({
    chat: z.object({ id: z.number().int(), type: z.string() }),
    text: z.string().max(4096).optional(),
  }),
});

const START = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/;
const STOP = /^\/stop(?:@\w+)?\s*$/;

export const REPLIES = {
  linked: 'Notifikasi Influency aktif. Ketik /stop untuk berhenti.',
  invalid: 'Tautan tidak valid atau kedaluwarsa. Buka Pengaturan di Influency untuk mencoba lagi.',
  howTo: 'Buka Pengaturan di Influency lalu tekan "Hubungkan" untuk menerima notifikasi.',
  stopped: 'Notifikasi dimatikan. Aktifkan lagi lewat Pengaturan di Influency.',
} as const;

/** Telegram consent through the official bot's /start deep link (US-074, ADR 0001). */
@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot | null,
  ) {}

  /** A one-time https://t.me/<bot>?start=<token> link for the caller. Only the token's hash is stored. */
  async createLink(userId: string): Promise<TelegramLinkResponse> {
    const username = this.env.TELEGRAM_BOT_USERNAME;
    if (!this.bot || !username) throw new DomainError('TELEGRAM_UNAVAILABLE');
    const token = randomBytes(32).toString('base64url'); // 43 chars, within the 64-char start parameter
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MS);
    await this.prisma.$executeRaw`
      INSERT INTO notification_preferences (user_id, link_token_hash, link_token_expires_at, updated_at)
      VALUES (${userId}::uuid, ${sha256hex(token)}, ${expiresAt}::timestamptz, ${now}::timestamptz)
      ON CONFLICT (user_id) DO UPDATE
      SET link_token_hash = EXCLUDED.link_token_hash,
          link_token_expires_at = EXCLUDED.link_token_expires_at,
          updated_at = EXCLUDED.updated_at`;
    return { url: `https://t.me/${username}?start=${token}`, expiresAt: expiresAt.toISOString() };
  }

  /** Handles one webhook update (after the secret check). Never throws for bad input: Telegram must not retry it. */
  async handleUpdate(body: unknown): Promise<void> {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return;
    const { chat, text } = parsed.data.message;
    if (chat.type !== 'private' || !text) return;
    const chatId = BigInt(chat.id);
    const start = START.exec(text);
    if (start) {
      await this.reply(chatId, start[1] ? await this.link(chatId, start[1]) : REPLIES.howTo);
    } else if (STOP.test(text)) {
      await this.prisma.notificationPreference.updateMany({
        where: { telegramChat: chatId },
        data: { telegramAllowed: false },
      });
      await this.reply(chatId, REPLIES.stopped);
    }
  }

  /** Single use: the token is cleared. A chat belongs to one user: linking it elsewhere unlinks it from the old one. */
  private async link(chatId: bigint, token: string): Promise<string> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.notificationPreference.findFirst({
        where: { linkTokenHash: sha256hex(token), linkTokenExpiresAt: { gt: now } },
        select: { userId: true },
      });
      if (!row) return REPLIES.invalid;
      await tx.notificationPreference.updateMany({
        where: { telegramChat: chatId, userId: { not: row.userId } },
        data: { telegramChat: null, telegramAllowed: false, telegramLinkedAt: null },
      });
      await tx.notificationPreference.update({
        where: { userId: row.userId },
        data: {
          telegramChat: chatId,
          telegramLinkedAt: now,
          telegramAllowed: true,
          linkTokenHash: null,
          linkTokenExpiresAt: null,
        },
      });
      return REPLIES.linked;
    });
  }

  private async reply(chatId: bigint, text: string): Promise<void> {
    const res = await this.bot?.sendMessage(chatId, text);
    if (res && !res.ok) this.logger.warn(`telegram reply failed: ${res.code}`);
  }
}
