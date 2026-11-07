import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { HomeFeedPage } from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { feedCursorSchema } from './feed-order.js';
import { PublicPostsService } from './public-posts.service.js';

/** Home feed (US-025): signed-in only; the answer depends on the viewer, so it is never cached. */
@Controller('feed')
@UseGuards(SessionGuard)
export class FeedController {
  constructor(private readonly posts: PublicPostsService) {}

  @Get()
  @Header('cache-control', 'no-store')
  get(
    @Query('cursor', new ZodValidationPipe(feedCursorSchema.optional())) cursor: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<HomeFeedPage> {
    return this.posts.feed(req.authSession!.userId, cursor ?? null);
  }
}
