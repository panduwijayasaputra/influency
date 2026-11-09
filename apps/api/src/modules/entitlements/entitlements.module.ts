import { Module } from '@nestjs/common';
import { MediaAccessController } from './media-access.controller.js';
import { MediaAccessService } from './media-access.service.js';
import { PaidAccessService } from './paid-access.service.js';
import { PostAccessService } from './post-access.service.js';

@Module({
  controllers: [MediaAccessController],
  providers: [PostAccessService, PaidAccessService, MediaAccessService],
  exports: [PostAccessService, PaidAccessService],
})
export class EntitlementsModule {}
