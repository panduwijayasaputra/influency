import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type CreatorSearchQuery,
  creatorSearchQuerySchema,
  type CreatorSearchResponse,
  type DiscoverVideosPage,
} from '@influency/shared';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { OptionalSessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { feedCursorSchema } from '../posts/feed-order.js';
import { PublicPostsService } from '../posts/public-posts.service.js';
import { CreatorSearchService } from './creator-search.service.js';

/** Placeholder limit for the public Jelajahi reads ([TBD], like FOLLOW_RATE_LIMIT). */
export const DISCOVER_RATE_LIMIT = { max: 120, timeWindow: '1 minute' };
/** Placeholder per-IP limit for creator search ([TBD]). */
export const CREATOR_SEARCH_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

/** Jelajahi (discover-notifications-settings): public, viewer-aware reads. Never cached. */
@Controller('discover')
export class DiscoverController {
  constructor(
    private readonly posts: PublicPostsService,
    private readonly creatorSearch: CreatorSearchService,
  ) {}

  /** US-069: free creator videos, newest first. Playback goes through GET /posts/:id/media-access. */
  @Get('videos')
  @UseGuards(OptionalSessionGuard, RateLimitGuard)
  @RateLimit(DISCOVER_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  videos(
    @Query('cursor', new ZodValidationPipe(feedCursorSchema.optional())) cursor: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<DiscoverVideosPage> {
    return this.posts.discoverVideos(req.authSession?.userId ?? null, cursor ?? null);
  }

  /** US-070: visible creators by name or slug. The answer doesn't depend on the viewer, so no session is read. */
  @Get('creators')
  @UseGuards(RateLimitGuard)
  @RateLimit(CREATOR_SEARCH_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  creators(
    @Query(new ZodValidationPipe(creatorSearchQuerySchema)) query: CreatorSearchQuery,
  ): Promise<CreatorSearchResponse> {
    return this.creatorSearch.search(query.q);
  }
}
