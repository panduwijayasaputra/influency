import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { CreatorFollowsController } from './creator-follows.controller.js';
import { CreatorFollowsService } from './creator-follows.service.js';
import { CommentPinsController } from './comment-pins.controller.js';
import { CommentPinsService } from './comment-pins.service.js';
import { CommentLikesController } from './comment-likes.controller.js';
import { CommentLikesService } from './comment-likes.service.js';
import { PostCommentsController } from './post-comments.controller.js';
import { PostCommentsService } from './post-comments.service.js';
import { PostLikesController } from './post-likes.controller.js';
import { PostLikesService } from './post-likes.service.js';
import { PostReportsController } from './post-reports.controller.js';
import { PostReportsService } from './post-reports.service.js';

/** Post engagement: likes (US-051), comments (US-052) reports (US-042) and creator follows (US-024). */
@Module({
  imports: [EntitlementsModule],
  controllers: [
    PostLikesController,
    PostCommentsController,
    PostReportsController,
    CommentLikesController,
    CommentPinsController,
    CreatorFollowsController,
  ],
  providers: [
    PostLikesService,
    PostCommentsService,
    PostReportsService,
    CommentLikesService,
    CommentPinsService,
    CreatorFollowsService,
  ],
})
export class EngagementModule {}
