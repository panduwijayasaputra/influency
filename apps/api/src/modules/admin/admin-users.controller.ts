import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type ModerationActionInput,
  moderationActionInputSchema,
  type ModerationUserResult,
} from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { AdminGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ModerationService } from './moderation.service.js';

const bodyPipe = new ZodValidationPipe(moderationActionInputSchema);

/** Account suspension for users and creators (US-042). */
@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly moderation: ModerationService) {}

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(bodyPipe) body: ModerationActionInput,
  ): Promise<ModerationUserResult> {
    return this.moderation.setUserStatus(id, req.authSession!.userId, 'SUSPENDED', body.note);
  }

  @Post(':id/unsuspend')
  @HttpCode(200)
  unsuspend(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(bodyPipe) body: ModerationActionInput,
  ): Promise<ModerationUserResult> {
    return this.moderation.setUserStatus(id, req.authSession!.userId, 'ACTIVE', body.note);
  }
}
