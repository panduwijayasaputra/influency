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
  type PurchasePostRequest,
  type PurchasePostResponse,
  purchasePostRequestSchema,
} from '@influency/shared';
import { parseIdempotencyKey } from '../../common/idempotency.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PostPurchasesService } from './post-purchases.service.js';
import { PURCHASE_RATE_LIMIT } from './purchase-rate-limit.js';

/** CSRF is checked by the global guard. The buyer always comes from the session. */
@Controller('posts')
export class PostPurchasesController {
  constructor(private readonly purchases: PostPurchasesService) {}

  @Post(':id/purchase')
  @HttpCode(200)
  // Order matters: the rate-limit key uses the session the first guard sets.
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(PURCHASE_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  purchase(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(purchasePostRequestSchema)) body: PurchasePostRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<PurchasePostResponse> {
    return this.purchases.purchase(
      req.authSession!.userId,
      id,
      body.expectedPriceCoins,
      parseIdempotencyKey(idempotencyKey),
    );
  }
}
