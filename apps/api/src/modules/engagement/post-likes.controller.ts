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
import type { PostLikeResponse } from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../../common/session.guard.js';
import { PostLikesService } from './post-likes.service.js';

/** Like / unlike a post (US-051). Both idempotent; CSRF is checked by the global guard. */
@Controller('posts')
@UseGuards(SessionGuard)
export class PostLikesController {
  constructor(private readonly likes: PostLikesService) {}

  @Put(':id/like')
  @Header('cache-control', 'no-store')
  like(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: FastifyRequest,
  ): Promise<PostLikeResponse> {
    return this.likes.like(id, req.authSession!.userId);
  }

  @Delete(':id/like')
  @Header('cache-control', 'no-store')
  unlike(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: FastifyRequest,
  ): Promise<PostLikeResponse> {
    return this.likes.unlike(id, req.authSession!.userId);
  }
}
