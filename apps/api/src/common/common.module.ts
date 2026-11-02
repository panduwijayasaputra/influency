import { Global, Module } from '@nestjs/common';
import { ENV, parseEnv } from './env.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }, PrismaService],
  exports: [ENV, PrismaService],
})
export class CommonModule {}
