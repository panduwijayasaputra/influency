import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { type FollowingPage, type FollowingQuery, followingQuerySchema } from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CreatorFollowsService } from './creator-follows.service.js';
import { followingCursorSchema } from './following-order.js';

const querySchema = followingQuerySchema.extend({ cursor: followingCursorSchema.optional() });

/** Diikuti (user-area US-046): signed-in only; the answer is the caller's own, so it is never cached. */
@Controller('me')
@UseGuards(SessionGuard)
export class FollowingController {
  constructor(private readonly follows: CreatorFollowsService) {}

  @Get('following')
  @Header('cache-control', 'no-store')
  get(
    @Query(new ZodValidationPipe(querySchema)) query: FollowingQuery,
    @Req() req: FastifyRequest,
  ): Promise<FollowingPage> {
    return this.follows.list(req.authSession!.userId, query);
  }
}
