import { Controller, Delete, Get, Header, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { FollowState } from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { OptionalSessionGuard, SessionGuard } from '../../common/session.guard.js';
import { CreatorFollowsService } from './creator-follows.service.js';

/** TBD placeholder: follow toggles per user per minute. */
export const FOLLOW_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

/** Follow state kept out of the cached public profile (US-024). CSRF is checked by the global guard. */
@Controller('creators')
export class CreatorFollowsController {
  constructor(private readonly follows: CreatorFollowsService) {}

  @Get(':slug/follow')
  @UseGuards(OptionalSessionGuard)
  @Header('cache-control', 'no-store')
  state(@Param('slug') slug: string, @Req() req: FastifyRequest): Promise<FollowState> {
    return this.follows.state(slug, req.authSession?.userId ?? null);
  }

  @Put(':slug/follow')
  // Order matters: the rate-limit key uses the session the first guard sets.
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(FOLLOW_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  follow(@Param('slug') slug: string, @Req() req: FastifyRequest): Promise<FollowState> {
    return this.follows.follow(slug, req.authSession!.userId);
  }

  @Delete(':slug/follow')
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(FOLLOW_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  unfollow(@Param('slug') slug: string, @Req() req: FastifyRequest): Promise<FollowState> {
    return this.follows.unfollow(slug, req.authSession!.userId);
  }
}
