import { timingSafeEqual } from 'node:crypto';
import { Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { TelegramLinkResponse } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { TELEGRAM_BOT, type TelegramBot } from '../../common/telegram-bot.js';
import { TelegramLinkService } from './telegram-link.service.js';

export const TELEGRAM_LINK_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };
export const TELEGRAM_WEBHOOK_RATE_LIMIT = { max: 120, timeWindow: '1 minute' };
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

const sameSecret = (given: unknown, expected: string) => {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Telegram notifications (US-074): consent link + the bot webhook. Off (409 / 404) without a configured bot. */
@Controller()
export class TelegramController {
  constructor(
    private readonly links: TelegramLinkService,
    @Inject(ENV) private readonly env: Env,
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot | null,
  ) {}

  @Post('me/telegram/link')
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(TELEGRAM_LINK_RATE_LIMIT)
  @HttpCode(200)
  link(@Req() req: FastifyRequest): Promise<TelegramLinkResponse> {
    return this.links.createLink(req.authSession!.userId);
  }

  /** Register with setWebhook + secret_token (docs/telegram-bot.md). Always 200 after the secret, so Telegram doesn't retry. */
  @Post('webhooks/telegram')
  @UseGuards(RateLimitGuard)
  @RateLimit(TELEGRAM_WEBHOOK_RATE_LIMIT)
  @HttpCode(200)
  async webhook(@Req() req: FastifyRequest): Promise<object> {
    const secret = this.env.TELEGRAM_BOT_WEBHOOK_SECRET;
    if (!this.bot || !secret) throw new DomainError('NOT_FOUND');
    if (!sameSecret(req.headers[SECRET_HEADER], secret)) throw new DomainError('FORBIDDEN');
    await this.links.handleUpdate(req.body);
    return {};
  }
}
