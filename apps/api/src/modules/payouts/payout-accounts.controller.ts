import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  type PayoutAccount,
  type PayoutAccountInput,
  type PayoutAccountList,
  payoutAccountInputSchema,
} from '@influency/shared';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { ApprovedCreatorGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PayoutAccountsService } from './payout-accounts.service.js';

const uuidPipe = new ZodValidationPipe(z.uuid());
/** [TBD] example: writes to payout accounts per creator per minute. */
export const PAYOUT_ACCOUNT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

/**
 * The approved creator's payout accounts. Every query is scoped to `req.creatorProfileId`. Responses carry the bank and
 * the last 4 digits only: the full number is write-only and is not logged (the request log keeps method and path).
 */
@Controller('me/payout-accounts')
@UseGuards(ApprovedCreatorGuard)
export class PayoutAccountsController {
  constructor(private readonly accounts: PayoutAccountsService) {}

  @Get()
  @Header('cache-control', 'no-store')
  async list(@Req() req: FastifyRequest): Promise<PayoutAccountList> {
    return { accounts: await this.accounts.list(req.creatorProfileId!) };
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit(PAYOUT_ACCOUNT_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  create(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(payoutAccountInputSchema)) body: PayoutAccountInput,
  ): Promise<PayoutAccount> {
    return this.accounts.create(req.creatorProfileId!, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit(PAYOUT_ACCOUNT_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  async activate(
    @Req() req: FastifyRequest,
    @Param('id', uuidPipe) id: string,
  ): Promise<PayoutAccountList> {
    return { accounts: await this.accounts.activate(req.creatorProfileId!, id) };
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RateLimitGuard)
  @RateLimit(PAYOUT_ACCOUNT_RATE_LIMIT)
  remove(@Req() req: FastifyRequest, @Param('id', uuidPipe) id: string): Promise<void> {
    return this.accounts.remove(req.creatorProfileId!, id);
  }
}
