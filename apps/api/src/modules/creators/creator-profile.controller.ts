import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type CreatorProfileResponse,
  PROFILE_IMAGE_MAX_BYTES,
  type ProfileImageKind,
  type UpdateCreatorProfileInput,
  updateCreatorProfileSchema,
} from '@influency/shared';
import { z } from 'zod';
import { ApprovedCreatorGuard } from '../../common/role.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CreatorProfileService } from './creator-profile.service.js';

const imageKindSchema = z.enum(
  Object.keys(PROFILE_IMAGE_MAX_BYTES) as [ProfileImageKind, ...ProfileImageKind[]],
);

/** Studio profile edits (`/creators/me`, always the caller's own profile) and public profile images. */
@Controller('creators')
export class CreatorProfileController {
  constructor(private readonly profiles: CreatorProfileService) {}

  /** `me` (2 chars) can never be a slug (min 3), so it never collides with `/creators/:slug`. */
  @Get('me')
  @UseGuards(ApprovedCreatorGuard)
  @Header('cache-control', 'no-store')
  mine(@Req() req: FastifyRequest): Promise<CreatorProfileResponse> {
    return this.profiles.getMine(req.creatorProfileId!);
  }

  @Patch('me')
  @UseGuards(ApprovedCreatorGuard)
  update(
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(updateCreatorProfileSchema)) body: UpdateCreatorProfileInput,
  ): Promise<CreatorProfileResponse> {
    return this.profiles.update(req.creatorProfileId!, body);
  }

  /** Raw image bytes as the body (`content-type: image/*`). */
  @Put('me/:kind')
  @UseGuards(ApprovedCreatorGuard)
  upload(
    @Req() req: FastifyRequest,
    @Param('kind', new ZodValidationPipe(imageKindSchema)) kind: ProfileImageKind,
    @Body() body: unknown,
  ): Promise<CreatorProfileResponse> {
    return this.profiles.uploadImage(req.creatorProfileId!, kind, body);
  }

  /** Public profile for /{creatorSlug}. */
  @Get(':slug')
  @Header('cache-control', 'public, max-age=60')
  publicProfile(@Param('slug') slug: string): Promise<CreatorProfileResponse> {
    return this.profiles.getPublic(slug);
  }

  /** Public. Image ids change on every upload, so responses are cached as immutable. */
  @Get(':slug/images/:imageId')
  async image(
    @Param('slug') slug: string,
    @Param('imageId') imageId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const object = await this.profiles.getPublicImage(slug, imageId);
    void reply.headers({
      'content-type': object.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    });
    return Buffer.from(object.body);
  }
}
