import {
  Controller,
  Delete,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CommentLikeResponse } from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../../common/session.guard.js';
import { CommentLikesService } from './comment-likes.service.js';

/** Like / unlike a comment or reply (US-018). Both idempotent; CSRF is checked by the global guard. */
@Controller('posts')
@UseGuards(SessionGuard)
export class CommentLikesController {
  constructor(private readonly likes: CommentLikesService) {}

  @Post(':id/comments/:commentId/likes')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  like(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Req() req: FastifyRequest,
  ): Promise<CommentLikeResponse> {
    return this.likes.like(id, commentId, req.authSession!.userId);
  }

  @Delete(':id/comments/:commentId/likes')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  unlike(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Req() req: FastifyRequest,
  ): Promise<CommentLikeResponse> {
    return this.likes.unlike(id, commentId, req.authSession!.userId);
  }
}
