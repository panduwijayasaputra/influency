import { Controller, Get, Header, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PublicPostDetail, PublicPostList } from '@influency/shared';
import { OptionalSessionGuard } from '../../common/session.guard.js';
import { PublicPostsService } from './public-posts.service.js';

/** Public creator feed and post detail. Safe preview only; media goes through the access-checked path (US-021). */
@Controller('creators')
export class PublicPostsController {
  constructor(private readonly posts: PublicPostsService) {}

  @Get(':slug/posts')
  @UseGuards(OptionalSessionGuard)
  @Header('cache-control', 'no-store') // hidden posts must disappear immediately; the answer depends on the viewer
  async list(@Param('slug') slug: string, @Req() req: FastifyRequest): Promise<PublicPostList> {
    return { posts: await this.posts.list(slug, req.authSession?.userId ?? null) };
  }

  @Get(':slug/posts/:postId')
  @UseGuards(OptionalSessionGuard)
  @Header('cache-control', 'no-store') // owner/admin see non-public posts; status changes must show immediately
  get(
    @Param('slug') slug: string,
    @Param('postId') postId: string,
    @Req() req: FastifyRequest,
  ): Promise<PublicPostDetail> {
    return this.posts.get(slug, postId, req.authSession?.userId ?? null);
  }

  /** Public cover preview (already blurred). The id changes with every cover change, so it is cached as immutable. */
  @Get(':slug/posts/:postId/preview/:previewId')
  async preview(
    @Param('slug') slug: string,
    @Param('postId') postId: string,
    @Param('previewId') previewId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const object = await this.posts.getPreview(slug, postId, previewId);
    void reply.headers({
      'content-type': object.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    return Buffer.from(object.body);
  }
}
