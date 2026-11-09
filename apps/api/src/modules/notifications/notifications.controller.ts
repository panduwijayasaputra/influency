import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type MarkNotificationsReadInput,
  markNotificationsReadSchema,
  type NotificationsPage,
  type UnreadCount,
} from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ledgerCursorSchema } from '../wallets/ledger-cursor.js';
import { NotificationsService } from './notifications.service.js';

/** The caller's notification inbox (US-071). Never cached. */
@Controller('me/notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('cache-control', 'no-store')
  list(
    @Query('cursor', new ZodValidationPipe(ledgerCursorSchema.optional()))
    cursor: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<NotificationsPage> {
    return this.notifications.list(req.authSession!.userId, cursor ?? null);
  }

  @Get('unread-count')
  @Header('cache-control', 'no-store')
  async unreadCount(@Req() req: FastifyRequest): Promise<UnreadCount> {
    return { count: await this.notifications.unreadCount(req.authSession!.userId) };
  }

  @Post('read')
  @HttpCode(204)
  markRead(
    @Body(new ZodValidationPipe(markNotificationsReadSchema)) body: MarkNotificationsReadInput,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    return this.notifications.markRead(req.authSession!.userId, body.upToId);
  }
}
