import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  MODERATION_POST_ACTIONS,
  type ModerationActionInput,
  moderationActionInputSchema,
  type ModerationPostAction,
  type ModerationPostResult,
  type ModerationQueue,
} from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ModerationService } from './moderation.service.js';

const actionPipe = new ZodValidationPipe(z.enum(MODERATION_POST_ACTIONS));

/** Moderation queue + post actions (US-042). */
@Controller('admin/moderation')
@UseGuards(AdminGuard)
export class AdminModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  @Header('cache-control', 'no-store')
  async queue(): Promise<ModerationQueue> {
    return { items: await this.moderation.queue() };
  }

  /** dismiss | hide | unhide | remove */
  @Post('posts/:id/:action')
  @HttpCode(200)
  act(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('action', actionPipe) action: ModerationPostAction,
    @Body(new ZodValidationPipe(moderationActionInputSchema)) body: ModerationActionInput,
  ): Promise<ModerationPostResult> {
    return this.moderation.actOnPost(id, req.authSession!.userId, action, body.note);
  }
}
