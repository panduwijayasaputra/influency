import {
  Controller,
  Delete,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { PostSaveResponse } from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { PostSavesService } from './post-saves.service.js';

/** TBD placeholder: save toggles per user per minute. */
export const POST_SAVE_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

/** Save / unsave a post (user-area US-044). Both idempotent; CSRF is checked by the global guard. */
@Controller('posts')
export class PostSavesController {
  constructor(private readonly saves: PostSavesService) {}

  @Put(':id/save')
  // Order matters: the rate-limit key uses the session the first guard sets.
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(POST_SAVE_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  save(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: FastifyRequest,
  ): Promise<PostSaveResponse> {
    return this.saves.save(id, req.authSession!.userId);
  }

  @Delete(':id/save')
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(POST_SAVE_RATE_LIMIT)
  @Header('cache-control', 'no-store')
  unsave(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: FastifyRequest,
  ): Promise<PostSaveResponse> {
    return this.saves.unsave(id, req.authSession!.userId);
  }
}
