import { Module } from '@nestjs/common';
import { PostMediaController } from './post-media.controller.js';
import { PostMediaService } from './post-media.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { PublicPostsController } from './public-posts.controller.js';
import { PublicPostsService } from './public-posts.service.js';

@Module({
  controllers: [PostsController, PostMediaController, PublicPostsController],
  providers: [PostsService, PostMediaService, PublicPostsService],
})
export class PostsModule {}
