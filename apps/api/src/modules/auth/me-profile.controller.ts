import { Body, Controller, Header, Patch, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type MeResponse,
  type UpdateMyProfileInput,
  updateMyProfileSchema,
} from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

@Controller('me/profile')
export class MeProfileController {
  constructor(private readonly auth: AuthService) {}

  /** Updates the caller's own display name and bio. The schema is strict, so nothing else can be sent. */
  @Patch()
  @UseGuards(SessionGuard)
  @Header('cache-control', 'no-store')
  update(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(updateMyProfileSchema)) body: UpdateMyProfileInput,
  ): Promise<MeResponse> {
    return this.auth.updateProfile(req.authSession!.userId, body);
  }
}
