import { Module } from '@nestjs/common';
import { MediaAccessController } from './media-access.controller.js';
import { MediaAccessService } from './media-access.service.js';
import { PostAccessService } from './post-access.service.js';

@Module({
  controllers: [MediaAccessController],
  providers: [PostAccessService, MediaAccessService],
  exports: [PostAccessService],
})
export class EntitlementsModule {}
