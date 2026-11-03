import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfGuard } from './csrf.guard.js';
import { ENV, type Env, parseEnv } from './env.js';
import { LocalObjectStorage } from './local-object-storage.js';
import { OBJECT_STORAGE } from './object-storage.js';
import { PrismaService } from './prisma.service.js';
import { R2ObjectStorage } from './r2-object-storage.js';
import { AdminGuard, ApprovedCreatorGuard } from './role.guards.js';
import { SessionGuard } from './session.guard.js';

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
    PrismaService,
    SessionGuard,
    AdminGuard,
    ApprovedCreatorGuard,
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [ENV, OBJECT_STORAGE, PrismaService, SessionGuard, AdminGuard, ApprovedCreatorGuard],
})
export class CommonModule {}
