import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type EarningsActivityPage,
  type EarningsActivityQuery,
  earningsActivityQuerySchema,
  type EarningsBalance,
} from '@influency/shared';
import { ApprovedCreatorGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { EarningsService } from './earnings.service.js';

/** The approved creator's own earnings. Every query is scoped to `req.creatorProfileId`. */
@Controller('me/earnings')
@UseGuards(ApprovedCreatorGuard)
export class EarningsController {
  constructor(private readonly earnings: EarningsService) {}

  @Get()
  @Header('cache-control', 'no-store')
  balance(@Req() req: FastifyRequest): Promise<EarningsBalance> {
    return this.earnings.balance(req.creatorProfileId!);
  }

  /** Unlocks, subscriptions and tips with their fee and net amount, newest first. */
  @Get('activity')
  @Header('cache-control', 'no-store')
  activity(
    @Req() req: FastifyRequest,
    @Query(new ZodValidationPipe(earningsActivityQuerySchema)) query: EarningsActivityQuery,
  ): Promise<EarningsActivityPage> {
    return this.earnings.activity(req.creatorProfileId!, query);
  }
}
