import { Module } from '@nestjs/common';
import { AdminCreatorsController } from './admin-creators.controller.js';
import { AdminCreatorsService } from './admin-creators.service.js';

@Module({
  controllers: [AdminCreatorsController],
  providers: [AdminCreatorsService],
})
export class AdminModule {}
