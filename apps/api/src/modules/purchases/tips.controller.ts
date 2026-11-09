import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { type TipRequest, type TipResponse, tipRequestSchema } from '@influency/shared';
import { parseIdempotencyKey } from '../../common/idempotency.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { TipsService } from './tips.service.js';

/** TBD placeholder: tips per user per minute. */
export const TIP_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

/** CSRF is checked by the global guard. The tipper always comes from the session. */
@Controller()
export class TipsController {
  constructor(private readonly tips: TipsService) {}

  @Post('creators/:slug/tips')
  @HttpCode(200)
  // Order matters: the rate-limit key uses the session the first guard sets.
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(TIP_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  tipCreator(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(tipRequestSchema)) body: TipRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<TipResponse> {
    return this.tips.tipCreator(
      req.authSession!.userId,
      slug,
      body.amountCoins,
      parseIdempotencyKey(idempotencyKey),
    );
  }

  @Post('posts/:id/tips')
  @HttpCode(200)
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(TIP_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  tipPost(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tipRequestSchema)) body: TipRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<TipResponse> {
    return this.tips.tipPost(
      req.authSession!.userId,
      id,
      body.amountCoins,
      parseIdempotencyKey(idempotencyKey),
    );
  }
}
