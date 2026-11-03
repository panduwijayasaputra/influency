import { Controller, Get, Header, Param } from '@nestjs/common';
import type { PublicPostList } from '@influency/shared';
import { PublicPostsService } from './public-posts.service.js';

/** Public creator feed. Safe preview only; media goes through the access-checked path (US-021). */
@Controller('creators')
export class PublicPostsController {
  constructor(private readonly posts: PublicPostsService) {}

  @Get(':slug/posts')
  @Header('cache-control', 'no-store') // hidden posts must disappear immediately
  async list(@Param('slug') slug: string): Promise<PublicPostList> {
    return { posts: await this.posts.list(slug) };
  }
}
