import { Module } from '@nestjs/common';
import { DevStorageController } from './dev-storage.controller.js';

@Module({
  controllers: [DevStorageController],
})
export class DevStorageModule {}
