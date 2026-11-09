import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  type CreatePayoutInput,
  createPayoutSchema,
  type Payout,
  type PayoutListQuery,
  payoutListQuerySchema,
  type PayoutPage,
  type PayoutQuote,
  type PayoutQuoteQuery,
  payoutQuoteQuerySchema,
} from '@influency/shared';
import { parseIdempotencyKey } from '../../common/idempotency.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { ApprovedCreatorGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PayoutsService } from './payouts.service.js';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** [TBD] examples: payout requests (and cancels) and quotes per creator per minute. */
export const PAYOUT_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };
export const PAYOUT_QUOTE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };

/** The approved creator's own payouts. The creator always comes from the session, never from the request. */
@Controller('me/payouts')
@UseGuards(ApprovedCreatorGuard)
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  /** A preview of the fee and the net amount. The fee is from server config. */
  @Get('quote')
  @UseGuards(RateLimitGuard)
  @RateLimit(PAYOUT_QUOTE_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  quote(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(payoutQuoteQuerySchema)) query: PayoutQuoteQuery,
  ): Promise<PayoutQuote> {
    return this.payouts.quote(req.creatorProfileId!, query.amountIdr);
  }

  /** Requests a payout and reserves the amount. 201 for a new payout, 200 for a replay of the same request. */
  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit(PAYOUT_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  async request(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(createPayoutSchema)) body: CreatePayoutInput,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Payout> {
    const { payout, replay } = await this.payouts.request(
      req.authSession!.userId,
      req.creatorProfileId!,
      parseIdempotencyKey(idempotencyKey),
      body,
    );
    void reply.status(replay ? 200 : 201);
    return payout;
  }

  /** The caller's payouts, newest first. */
  @Get()
  @Header('cache-control', 'no-store')
  list(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(payoutListQuerySchema)) query: PayoutListQuery,
  ): Promise<PayoutPage> {
    return this.payouts.list(req.creatorProfileId!, query.cursor);
  }

  /** Cancels a REQUESTED payout and releases its reservation. */
  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit(PAYOUT_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  cancel(@Req() req: FastifyRequest, @Param('id', uuidPipe) id: string): Promise<Payout> {
    return this.payouts.cancel(req.authSession!.userId, req.creatorProfileId!, id);
  }
}
