import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type CreatePostReportInput,
  createPostReportSchema,
  type PostReportResponse,
} from '@influency/shared';
import type { FastifyRequest } from 'fastify';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PostReportsService } from './post-reports.service.js';

/** TBD placeholder: reports per user per hour. */
export const POST_REPORT_RATE_LIMIT = { max: 10, timeWindow: '1 hour' };

/** Report a post (US-042). CSRF is checked by the global guard. */
@Controller('posts')
export class PostReportsController {
  constructor(private readonly reports: PostReportsService) {}

  @Post(':id/report')
  // Order matters: the rate-limit key uses the session the first guard sets.
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit(POST_REPORT_RATE_LIMIT)
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  report(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(createPostReportSchema)) body: CreatePostReportInput,
    @Req() req: FastifyRequest,
  ): Promise<PostReportResponse> {
    return this.reports.report(id, req.authSession!.userId, body);
  }
}
