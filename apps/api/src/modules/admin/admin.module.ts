import { Module } from '@nestjs/common';
import { AdminCreatorsController } from './admin-creators.controller.js';
import { AdminCreatorsService } from './admin-creators.service.js';
import { AdminModerationController } from './admin-moderation.controller.js';
import { AdminUsersController } from './admin-users.controller.js';
import { ModerationService } from './moderation.service.js';

@Module({
  controllers: [AdminCreatorsController, AdminModerationController, AdminUsersController],
  providers: [AdminCreatorsService, ModerationService],
})
export class AdminModule {}
