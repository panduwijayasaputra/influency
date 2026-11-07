import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { FeedController } from './feed.controller.js';
import { MediaSweeper } from './media-sweeper.js';
import { PostCoverController } from './post-cover.controller.js';
import { PostCoverService } from './post-cover.service.js';
import { PostMediaController } from './post-media.controller.js';
import { PostMediaService } from './post-media.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { PublicPostsController } from './public-posts.controller.js';
import { PublicPostsService } from './public-posts.service.js';
import { VideoWebhookController } from './video-webhook.controller.js';

@Module({
  imports: [EntitlementsModule],
  controllers: [
    PostsController,
    PostMediaController,
    PostCoverController,
    PublicPostsController,
    FeedController,
    VideoWebhookController,
  ],
  providers: [PostsService, PostMediaService, PostCoverService, PublicPostsService, MediaSweeper],
})
export class PostsModule {}
