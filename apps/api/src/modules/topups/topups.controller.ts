import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type CreateTopupRequest,
  type CreateTopupResponse,
  createTopupRequestSchema,
  type TopupOrder,
} from '@influency/shared';
import { parseIdempotencyKey } from '../../common/idempotency.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { TopupsService } from './topups.service.js';

/** TBD placeholders: top-up creations / status reads per user per minute. */
export const TOPUP_CREATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };
export const TOPUP_READ_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

/** Koin top-ups (koin-wallet US-030). Order ownership always comes from the session. */
@Controller('wallet/topups')
// Order matters: the rate-limit key uses the session the first guard sets.
@UseGuards(SessionGuard, RateLimitGuard)
export class TopupsController {
  constructor(private readonly topups: TopupsService) {}

  @Post()
  @RateLimit(TOPUP_CREATE_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  create(
    @Body(new ZodValidationPipe(createTopupRequestSchema)) body: CreateTopupRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<CreateTopupResponse> {
    // Only the package id is read: a client-sent price or Koin amount is stripped by the schema.
    return this.topups.create(
      req.authSession!.userId,
      body.packageId,
      parseIdempotencyKey(idempotencyKey),
    );
  }

  @Get()
  @RateLimit(TOPUP_READ_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  async pending(@Req() req: FastifyRequest): Promise<{ items: TopupOrder[] }> {
    return { items: await this.topups.listPending(req.authSession!.userId) };
  }

  @Get(':id')
  @RateLimit(TOPUP_READ_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  get(@Param('id') id: string, @Req() req: FastifyRequest): Promise<TopupOrder> {
    return this.topups.getForOwner(req.authSession!.userId, id);
  }
}
