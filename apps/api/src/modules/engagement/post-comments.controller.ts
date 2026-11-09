import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type CreatePostCommentInput,
  createPostCommentSchema,
  type PostComment,
  type PostCommentList,
  type PostReply,
  type PostReplyList,
  type UpdatePostCommentInput,
  updatePostCommentSchema,
} from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { OptionalSessionGuard, SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { topCursorSchema } from './comment-order.js';
import { PostCommentsService } from './post-comments.service.js';

/** Comments on a post (US-052). CSRF on POST/DELETE is checked by the global guard. */
@Controller('posts')
export class PostCommentsController {
  constructor(private readonly comments: PostCommentsService) {}

  @Get(':id/comments')
  @UseGuards(OptionalSessionGuard)
  @Header('cache-control', 'no-store') // deletes and canDelete/canEdit/canPin depend on the viewer
  list(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('cursor', new ZodValidationPipe(topCursorSchema.optional())) cursor: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<PostCommentList> {
    return this.comments.list(id, req.authSession?.userId ?? null, cursor);
  }

  @Get(':id/comments/:commentId/replies')
  @UseGuards(OptionalSessionGuard)
  @Header('cache-control', 'no-store') // canDelete/canEdit depend on the viewer
  listReplies(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Query('cursor', new ZodValidationPipe(z.uuid().optional())) cursor: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<PostReplyList> {
    return this.comments.listReplies(id, commentId, req.authSession?.userId ?? null, cursor);
  }

  @Post(':id/comments')
  @UseGuards(SessionGuard)
  @Header('cache-control', 'no-store')
  create(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(createPostCommentSchema)) body: CreatePostCommentInput,
    @Req() req: FastifyRequest,
  ): Promise<PostComment> {
    return this.comments.create(id, req.authSession!.userId, body);
  }

  @Patch(':id/comments/:commentId')
  @UseGuards(SessionGuard)
  @Header('cache-control', 'no-store')
  edit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body(new ZodValidationPipe(updatePostCommentSchema)) body: UpdatePostCommentInput,
    @Req() req: FastifyRequest,
  ): Promise<PostReply> {
    return this.comments.edit(id, commentId, req.authSession!.userId, body);
  }

  // Author, post creator or admin; a moderation delete of someone else's comment is audited (US-021).
  @Delete(':id/comments/:commentId')
  @UseGuards(SessionGuard)
  @HttpCode(204)
  async delete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.comments.delete(id, commentId, req.authSession!.userId);
  }
}
