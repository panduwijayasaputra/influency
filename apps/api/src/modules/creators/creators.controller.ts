import { Body, Controller, Get, Header, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type CreatorApplicationInput,
  type CreatorApplicationResponse,
  creatorApplicationSchema,
} from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CreatorsService } from './creators.service.js';

@Controller('creators')
@UseGuards(SessionGuard)
export class CreatorsController {
  constructor(private readonly creators: CreatorsService) {}

  /** Submits (or, after a rejection, resubmits) the caller's creator application. */
  @Post('apply')
  apply(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(creatorApplicationSchema)) body: CreatorApplicationInput,
  ): Promise<CreatorApplicationResponse> {
    return this.creators.apply(req.authSession!.userId, body);
  }

  /** Two segments deep so it never collides with the public `GET /creators/:slug`. */
  @Get('me/application')
  @Header('cache-control', 'no-store')
  async myApplication(
    @Req() req: FastifyRequest,
  ): Promise<{ application: CreatorApplicationResponse | null }> {
    return { application: await this.creators.findMine(req.authSession!.userId) };
  }
}
