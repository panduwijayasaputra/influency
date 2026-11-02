import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { type HealthResult, HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Public; 503 with the same body when the database is down. */
  @Get()
  async get(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResult> {
    const result = await this.healthService.check();
    if (result.status !== 'ok') void reply.status(503);
    return result;
  }
}
