import { Controller, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../../common/session.guard.js';
import { AuthService } from './auth.service.js';

@Controller('me/onboarding')
export class OnboardingController {
  constructor(private readonly auth: AuthService) {}

  /** Marks the welcome stepper finished or skipped for the caller. Idempotent. CSRF is enforced globally. */
  @Post('complete')
  @UseGuards(SessionGuard)
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  async complete(@Req() req: FastifyRequest): Promise<void> {
    await this.auth.completeOnboarding(req.authSession!.userId);
  }
}
