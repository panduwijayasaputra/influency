import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';

export const DB_CHECK_TIMEOUT_MS = 2000;

export interface HealthResult {
  status: 'ok' | 'degraded';
  // Redis arrives with BullMQ in Phase 5; until then it is reported, never checked.
  checks: { database: 'up' | 'down'; redis: 'disabled' };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResult> {
    const database = (await this.isDatabaseUp()) ? 'up' : 'down';
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      checks: { database, redis: 'disabled' },
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('database check timed out')), DB_CHECK_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch (error) {
      // Code + message only (Prisma's message alone hides the cause); never the connection string.
      const { code, message } = error as Error & { code?: string };
      this.logger.warn(`Database health check failed: ${code ?? 'UNKNOWN'} ${message.trim()}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
