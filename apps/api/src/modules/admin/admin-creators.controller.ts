import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  type AdminCreatorApplication,
  type CreatorReviewResult,
  type RejectCreatorApplicationInput,
  rejectCreatorApplicationSchema,
} from '@influency/shared';
import { AdminGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AdminCreatorsService } from './admin-creators.service.js';

const profileIdPipe = new ZodValidationPipe(z.uuid());

@Controller('admin/creators')
@UseGuards(AdminGuard)
export class AdminCreatorsController {
  constructor(private readonly creators: AdminCreatorsService) {}

  @Get('applications')
  @Header('cache-control', 'no-store')
  async applications(): Promise<{ applications: AdminCreatorApplication[] }> {
    return { applications: await this.creators.listPending() };
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @Req() req: FastifyRequest,
    @Param('id', profileIdPipe) id: string,
  ): Promise<CreatorReviewResult> {
    return this.creators.approve(id, req.authSession!.userId);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Req() req: FastifyRequest,
    @Param('id', profileIdPipe) id: string,
    @Body(new ZodValidationPipe(rejectCreatorApplicationSchema))
    body: RejectCreatorApplicationInput,
  ): Promise<CreatorReviewResult> {
    return this.creators.reject(id, req.authSession!.userId, body.reason);
  }
}
