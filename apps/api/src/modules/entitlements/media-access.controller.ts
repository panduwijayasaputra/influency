import { Controller, Get, Header, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import type { MediaAccessResponse } from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { OptionalSessionGuard } from '../../common/session.guard.js';
import { MediaAccessService } from './media-access.service.js';

/** TBD placeholder: per user (or IP when anonymous) per minute. */
export const MEDIA_ACCESS_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

/** The only way to get viewable post media: short-lived URLs after the server-side access check. */
@Controller('posts')
export class MediaAccessController {
  constructor(private readonly media: MediaAccessService) {}

  @Get(':id/media-access')
  // Order matters: the rate-limit key uses the session the first guard sets.
  @UseGuards(OptionalSessionGuard, RateLimitGuard)
  @RateLimit(MEDIA_ACCESS_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: FastifyRequest,
  ): Promise<MediaAccessResponse> {
    return this.media.mint(id, req.authSession);
  }
}
