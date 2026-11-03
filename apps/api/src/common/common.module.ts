import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CloudflareStreamVideoProvider } from './cloudflare-stream-video-provider.js';
import { CsrfGuard } from './csrf.guard.js';
import { ENV, type Env, parseEnv } from './env.js';
import { LocalObjectStorage } from './local-object-storage.js';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.js';
import { PreviewGenerator } from './preview-generator.js';
import { PrismaService } from './prisma.service.js';
import { R2ObjectStorage } from './r2-object-storage.js';
import { AdminGuard, ApprovedCreatorGuard } from './role.guards.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { OptionalSessionGuard, SessionGuard } from './session.guard.js';
import { StubVideoProvider } from './stub-video-provider.js';
import { VIDEO_PROVIDER } from './video-provider.js';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => parseEnv(process.env) },
    {
      provide: OBJECT_STORAGE,
      useFactory: (env: Env) =>
        env.STORAGE_DRIVER === 'r2'
          ? new R2ObjectStorage(env)
          : new LocalObjectStorage(env.LOCAL_STORAGE_DIR),
      inject: [ENV],
    },
    {
      provide: VIDEO_PROVIDER,
      useFactory: (env: Env, storage: ObjectStorage) =>
        env.VIDEO_DRIVER === 'stream'
          ? new CloudflareStreamVideoProvider(env)
          : new StubVideoProvider(storage),
      inject: [ENV, OBJECT_STORAGE],
    },
    PrismaService,
    PreviewGenerator,
    SessionGuard,
    OptionalSessionGuard,
    RateLimitGuard,
    AdminGuard,
    ApprovedCreatorGuard,
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [
    ENV,
    OBJECT_STORAGE,
    VIDEO_PROVIDER,
    PrismaService,
    PreviewGenerator,
    SessionGuard,
    OptionalSessionGuard,
    RateLimitGuard,
    AdminGuard,
    ApprovedCreatorGuard,
  ],
})
export class CommonModule {}
