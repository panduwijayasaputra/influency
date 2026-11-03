import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CreatorsModule } from './modules/creators/creators.module.js';
import { DevStorageModule } from './modules/dev-storage/dev-storage.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PostsModule } from './modules/posts/posts.module.js';

@Module({
  imports: [
    CommonModule,
    HealthModule,
    AuthModule,
    CreatorsModule,
    PostsModule,
    AdminModule,
    DevStorageModule,
  ],
})
export class AppModule {}
