import { Module } from '@nestjs/common';
import { CreatorProfileController } from './creator-profile.controller.js';
import { CreatorProfileService } from './creator-profile.service.js';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

@Module({
  controllers: [CreatorsController, CreatorProfileController],
  providers: [CreatorsService, CreatorProfileService],
})
export class CreatorsModule {}
