import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  type CreateMediaUploadInput,
  createMediaUploadSchema,
  type MediaUploadResponse,
  type ReorderPostMediaInput,
  reorderPostMediaSchema,
  type StudioMedia,
  type StudioMediaList,
} from '@influency/shared';
import { ApprovedCreatorGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PostMediaService } from './post-media.service.js';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** Media of the approved creator's own posts. Every route is scoped to req.creatorProfileId. */
@Controller('creators/me/posts/:postId/media')
@UseGuards(ApprovedCreatorGuard)
export class PostMediaController {
  constructor(private readonly media: PostMediaService) {}

  /** Upload slot: a pending item + presigned PUT URL (never logged). */
  @Post()
  @Header('cache-control', 'no-store')
  createUpload(
    @Req() req: FastifyRequest,
    @Param('postId', uuidPipe) postId: string,
    @Body(new ZodValidationPipe(createMediaUploadSchema)) body: CreateMediaUploadInput,
  ): Promise<MediaUploadResponse> {
    return this.media.createUpload(req.creatorProfileId!, postId, body);
  }

  @Post(':mediaId/complete')
  @HttpCode(200)
  complete(
    @Req() req: FastifyRequest,
    @Param('postId', uuidPipe) postId: string,
    @Param('mediaId', uuidPipe) mediaId: string,
  ): Promise<StudioMedia> {
    return this.media.complete(req.creatorProfileId!, postId, mediaId);
  }

  @Get()
  @Header('cache-control', 'no-store')
  async list(
    @Req() req: FastifyRequest,
    @Param('postId', uuidPipe) postId: string,
  ): Promise<StudioMediaList> {
    return { media: await this.media.list(req.creatorProfileId!, postId) };
  }

  /** The creator's order. Only while the post is a draft, like every other media change. */
  @Put('order')
  @Header('cache-control', 'no-store')
  async reorder(
    @Req() req: FastifyRequest,
    @Param('postId', uuidPipe) postId: string,
    @Body(new ZodValidationPipe(reorderPostMediaSchema)) body: ReorderPostMediaInput,
  ): Promise<StudioMediaList> {
    return { media: await this.media.reorder(req.creatorProfileId!, postId, body.mediaIds) };
  }

  @Get(':mediaId/content')
  async content(
    @Req() req: FastifyRequest,
    @Param('postId', uuidPipe) postId: string,
    @Param('mediaId', uuidPipe) mediaId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const object = await this.media.content(req.creatorProfileId!, postId, mediaId);
    void reply.headers({
      'content-type': object.contentType,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    });
    return Buffer.from(object.body);
  }

  @Delete(':mediaId')
  @HttpCode(204)
  remove(
    @Req() req: FastifyRequest,
    @Param('postId', uuidPipe) postId: string,
    @Param('mediaId', uuidPipe) mediaId: string,
  ): Promise<void> {
    return this.media.remove(req.creatorProfileId!, postId, mediaId);
  }
}
