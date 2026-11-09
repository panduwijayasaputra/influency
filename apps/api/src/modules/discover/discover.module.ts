import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { CreatorSearchService } from './creator-search.service.js';
import { DiscoverController } from './discover.controller.js';

@Module({
  imports: [PostsModule],
  controllers: [DiscoverController],
  providers: [CreatorSearchService],
})
export class DiscoverModule {}
