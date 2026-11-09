import { Body, Controller, Get, Header, Put, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type NotificationPreferences,
  type UpdateNotificationPreferencesInput,
  updateNotificationPreferencesSchema,
} from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';

/** Pengaturan → Notifikasi toggles (US-073). Never cached. */
@Controller('me/notification-preferences')
@UseGuards(SessionGuard)
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  @Header('cache-control', 'no-store')
  get(@Req() req: FastifyRequest): Promise<NotificationPreferences> {
    return this.preferences.get(req.authSession!.userId);
  }

  @Put()
  @Header('cache-control', 'no-store')
  update(
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema))
    body: UpdateNotificationPreferencesInput,
    @Req() req: FastifyRequest,
  ): Promise<NotificationPreferences> {
    return this.preferences.update(req.authSession!.userId, body);
  }
}
