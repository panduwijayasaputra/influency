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
import {
  type CancelScheduledResponse,
  type SubscribeRequest,
  type SubscribeResponse,
  subscribeRequestSchema,
} from '@influency/shared';
import { parseIdempotencyKey } from '../../common/idempotency.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PURCHASE_RATE_LIMIT } from '../purchases/purchase-rate-limit.js';
import { SubscriptionPeriodsService } from './subscription-periods.service.js';

/** CSRF is checked by the global guard. The subscriber always comes from the session. */
@Controller('subscription-periods')
export class SubscriptionPeriodCancelController {
  constructor(private readonly periods: SubscriptionPeriodsService) {}

  /** Idempotent by nature (a repeat answers the same result), so it needs no Idempotency-Key. */
  @Post(':id/cancel-scheduled')
  @HttpCode(200)
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(PURCHASE_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  cancel(@Param('id') id: string, @Req() req: FastifyRequest): Promise<CancelScheduledResponse> {
    return this.periods.cancelScheduled(req.authSession!.userId, id);
  }
}

/** CSRF is checked by the global guard. The subscriber always comes from the session. */
@Controller('creators')
export class SubscriptionPeriodsController {
  constructor(private readonly periods: SubscriptionPeriodsService) {}

  @Post(':slug/subscribe')
  @HttpCode(200)
  // Order matters: the rate-limit key uses the session the first guard sets.
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(PURCHASE_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  subscribe(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(subscribeRequestSchema)) body: SubscribeRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<SubscribeResponse> {
    return this.periods.subscribe(
      req.authSession!.userId,
      slug,
      body.expectedPriceCoins,
      parseIdempotencyKey(idempotencyKey),
    );
  }
}
