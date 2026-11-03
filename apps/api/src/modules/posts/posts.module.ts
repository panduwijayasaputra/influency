import { Module } from '@nestjs/common';
import { PostMediaController } from './post-media.controller.js';
import { PostMediaService } from './post-media.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  controllers: [PostsController, PostMediaController],
  providers: [PostsService, PostMediaService],
})
export class PostsModule {}
