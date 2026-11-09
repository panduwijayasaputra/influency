import { Body, Controller, Get, Header, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type CreatorSubscriptionState,
  type OwnSubscriptionPlanResponse,
  type PutSubscriptionPlanRequest,
  putSubscriptionPlanRequestSchema,
} from '@influency/shared';
import { ApprovedCreatorGuard } from '../../common/role.guards.js';
import { OptionalSessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { SubscriptionPlansService } from './subscription-plans.service.js';

/** CSRF is checked by the global guard. `me/...` has a static segment, so it never collides with `:slug/...`. */
@Controller('creators')
export class SubscriptionPlansController {
  constructor(private readonly plans: SubscriptionPlansService) {}

  @Get('me/subscription-plan')
  @UseGuards(ApprovedCreatorGuard)
  @Header('cache-control', 'no-store')
  mine(@Req() req: FastifyRequest): Promise<OwnSubscriptionPlanResponse> {
    return this.plans.getOwn(req.creatorProfileId!);
  }

  @Put('me/subscription-plan')
  @UseGuards(ApprovedCreatorGuard)
  @Header('cache-control', 'no-store')
  setMine(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(putSubscriptionPlanRequestSchema)) body: PutSubscriptionPlanRequest,
  ): Promise<OwnSubscriptionPlanResponse> {
    return this.plans.putOwn(req.creatorProfileId!, body);
  }

  /** Kept out of the cached public profile, like the follow state. */
  @Get(':slug/subscription')
  @UseGuards(OptionalSessionGuard)
  @Header('cache-control', 'no-store')
  state(
    @Param('slug') slug: string,
    @Req() req: FastifyRequest,
  ): Promise<CreatorSubscriptionState> {
    return this.plans.stateFor(slug, req.authSession?.userId ?? null);
  }
}
