import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  type CreatePostInput,
  createPostSchema,
  type SetPostOfferInput,
  setPostOfferSchema,
  type StudioPost,
  type StudioPostList,
  type UpdatePostInput,
  updatePostSchema,
} from '@influency/shared';
import { ApprovedCreatorGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PostsService } from './posts.service.js';

const postIdPipe = new ZodValidationPipe(z.uuid());

/** The approved creator's own posts. Every route is scoped to req.creatorProfileId. */
@Controller('creators/me/posts')
@UseGuards(ApprovedCreatorGuard)
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  create(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput,
  ): Promise<StudioPost> {
    return this.posts.create(req.creatorProfileId!, body);
  }

  @Get()
  @Header('cache-control', 'no-store')
  async list(@Req() req: FastifyRequest): Promise<StudioPostList> {
    return { posts: await this.posts.list(req.creatorProfileId!) };
  }

  @Get(':id')
  @Header('cache-control', 'no-store')
  get(@Req() req: FastifyRequest, @Param('id', postIdPipe) id: string): Promise<StudioPost> {
    return this.posts.get(req.creatorProfileId!, id);
  }

  @Patch(':id')
  update(
    @Req() req: FastifyRequest,
    @Param('id', postIdPipe) id: string,
    @Body(new ZodValidationPipe(updatePostSchema)) body: UpdatePostInput,
  ): Promise<StudioPost> {
    return this.posts.update(req.creatorProfileId!, id, body);
  }

  @Put(':id/offer')
  setOffer(
    @Req() req: FastifyRequest,
    @Param('id', postIdPipe) id: string,
    @Body(new ZodValidationPipe(setPostOfferSchema)) body: SetPostOfferInput,
  ): Promise<StudioPost> {
    return this.posts.setOffer(req.creatorProfileId!, id, body);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Req() req: FastifyRequest, @Param('id', postIdPipe) id: string): Promise<StudioPost> {
    return this.posts.publish(req.creatorProfileId!, id);
  }

  @Post(':id/hide')
  @HttpCode(200)
  hide(@Req() req: FastifyRequest, @Param('id', postIdPipe) id: string): Promise<StudioPost> {
    return this.posts.hide(req.creatorProfileId!, id);
  }
}
