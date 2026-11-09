import { Body, Controller, Delete, Get, Param, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { type SetPostCoverInput, setPostCoverSchema, type StudioPost } from '@influency/shared';
import { ApprovedCreatorGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PostCoverService } from './post-cover.service.js';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** Cover of the approved creator's own premium posts (US-048). Every route is scoped to req.creatorProfileId. */
@Controller('creators/me/posts/:id/cover')
@UseGuards(ApprovedCreatorGuard)
export class PostCoverController {
  constructor(private readonly covers: PostCoverService) {}

  @Put()
  setFromMedia(
    @Req() req: FastifyRequest,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(setPostCoverSchema)) body: SetPostCoverInput,
  ): Promise<StudioPost> {
    return this.covers.setFromMedia(req.creatorProfileId!, id, body.mediaId);
  }

  /** Raw image bytes as the body (`content-type: image/*`). */
  @Put('image')
  setFromUpload(
    @Req() req: FastifyRequest,
    @Param('id', uuidPipe) id: string,
    @Body() body: unknown,
  ): Promise<StudioPost> {
    return this.covers.setFromUpload(req.creatorProfileId!, id, body);
  }

  @Delete()
  remove(@Req() req: FastifyRequest, @Param('id', uuidPipe) id: string): Promise<StudioPost> {
    return this.covers.remove(req.creatorProfileId!, id);
  }

  @Get('preview')
  async preview(
    @Req() req: FastifyRequest,
    @Param('id', uuidPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const object = await this.covers.preview(req.creatorProfileId!, id);
    void reply.headers({
      'content-type': object.contentType,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    return Buffer.from(object.body);
  }
}
