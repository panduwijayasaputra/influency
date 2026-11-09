import {
  Controller,
  Delete,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CommentPinResponse } from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../../common/session.guard.js';
import { CommentPinsService } from './comment-pins.service.js';

/** Pin / unpin a top-level comment (US-020). Both idempotent; CSRF is checked by the global guard. */
@Controller('posts')
@UseGuards(SessionGuard)
export class CommentPinsController {
  constructor(private readonly pins: CommentPinsService) {}

  @Put(':id/comments/:commentId/pin')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  pin(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Req() req: FastifyRequest,
  ): Promise<CommentPinResponse> {
    return this.pins.pin(id, commentId, req.authSession!.userId);
  }

  @Delete(':id/comments/:commentId/pin')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  unpin(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Req() req: FastifyRequest,
  ): Promise<CommentPinResponse> {
    return this.pins.unpin(id, commentId, req.authSession!.userId);
  }
}
