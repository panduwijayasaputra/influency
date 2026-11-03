import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { POST_COVER_MAX_BYTES, POST_IMAGE_TYPES, type StudioPost } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { detectImageType } from '../../common/image-type.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from '../../common/object-storage.js';
import { PreviewGenerator } from '../../common/preview-generator.js';
import { PrismaService } from '../../common/prisma.service.js';
import { VIDEO_PROVIDER, type VideoProvider } from '../../common/video-provider.js';
import { lockPost, PostsService, PREVIEW_KEY_PREFIX } from './posts.service.js';

/**
 * Premium post covers (US-048). Only a generated preview is stored and served; the source (a post image, a video's
 * provider thumbnail or a dedicated upload) is never copied or referenced publicly. Any post status may change its cover.
 */
// shortcut: preview generated in the request; move to the worker (Phase 5) if cover changes get slow.
// shortcut: a crash between put and commit orphans one private preview; US-049 cleanup can sweep unreferenced post-previews/ keys.
@Injectable()
export class PostCoverService {
  private readonly logger = new Logger(PostCoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly generator: PreviewGenerator,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** A READY image or video of this post. Post media is premium content, so its preview is always blurred. */
  async setFromMedia(
    creatorProfileId: string,
    postId: string,
    mediaId: string,
  ): Promise<StudioPost> {
    await this.findPremium(creatorProfileId, postId);
    const media = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, postId, status: 'READY' },
    });
    if (!media) throw new DomainError('NOT_FOUND');
    let source: Uint8Array | null;
    if (media.kind === 'IMAGE') {
      source = (await this.storage.get(media.objectKey!))?.body ?? null;
    } else {
      source = await this.video.getThumbnail(media.videoUid!).catch((err: unknown) => {
        // The media id, never the provider uid.
        this.logger.warn(`cover thumbnail failed for media ${media.id}: ${(err as Error).message}`);
        return null;
      });
    }
    if (!source) throw new DomainError('COVER_SOURCE_UNAVAILABLE');
    return this.swap(creatorProfileId, postId, await this.generate(source, false), media.id);
  }

  /** Raw image bytes (`content-type: image/*`). Clear only when PREMIUM_COVER_CLEAR_ALLOWED; blurred otherwise. */
  async setFromUpload(
    creatorProfileId: string,
    postId: string,
    body: unknown,
  ): Promise<StudioPost> {
    // Non-image content types (e.g. JSON) arrive parsed, not as a Buffer.
    if (!Buffer.isBuffer(body)) throw new DomainError('UNSUPPORTED_FILE_TYPE');
    const type = detectImageType(body);
    if (!type || !(POST_IMAGE_TYPES as readonly string[]).includes(type)) {
      throw new DomainError('UNSUPPORTED_FILE_TYPE');
    }
    if (body.length > POST_COVER_MAX_BYTES) {
      throw new DomainError('FILE_TOO_LARGE', { maxBytes: POST_COVER_MAX_BYTES });
    }
    await this.findPremium(creatorProfileId, postId);
    const preview = await this.generate(body, this.env.PREMIUM_COVER_CLEAR_ALLOWED);
    return this.swap(creatorProfileId, postId, preview, null);
  }

  /** Idempotent; allowed for any visibility so a leftover cover can always be cleared. */
  async remove(creatorProfileId: string, postId: string): Promise<StudioPost> {
    const old = await this.prisma.$transaction(async (tx) => {
      await lockPost(tx, creatorProfileId, postId);
      const { previewKey } = await tx.post.findUniqueOrThrow({
        where: { id: postId },
        select: { previewKey: true },
      });
      if (previewKey) {
        await tx.post.update({
          where: { id: postId },
          data: { coverMediaId: null, previewKey: null },
        });
      }
      return previewKey;
    });
    if (old) this.deleteObject(old);
    return this.posts.get(creatorProfileId, postId);
  }

  /** Owner view of exactly what visitors see. */
  async preview(creatorProfileId: string, postId: string): Promise<StoredObject> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, creatorProfileId },
      select: { previewKey: true },
    });
    if (!post?.previewKey) throw new DomainError('NOT_FOUND');
    const object = await this.storage.get(post.previewKey);
    if (!object) throw new DomainError('NOT_FOUND');
    return { body: object.body, contentType: 'image/webp' };
  }

  /** Early check so nothing is processed for a foreign or FREE post; repeated under the lock in swap. */
  private async findPremium(creatorProfileId: string, postId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, creatorProfileId },
      select: { visibility: true },
    });
    if (!post) throw new DomainError('NOT_FOUND');
    if (post.visibility !== 'PREMIUM') throw new DomainError('COVER_REQUIRES_PREMIUM');
  }

  private async generate(source: Uint8Array, clear: boolean): Promise<Buffer> {
    try {
      return await (clear ? this.generator.clear(source) : this.generator.blurred(source));
    } catch {
      // Valid magic bytes but undecodable content.
      throw new DomainError('UNSUPPORTED_FILE_TYPE');
    }
  }

  /**
   * Stores the new preview, then swaps the post's cover under the post-row lock: concurrent swaps serialize, and each
   * deletes the key it replaced, so no preview is orphaned. Storage I/O stays outside the lock.
   */
  private async swap(
    creatorProfileId: string,
    postId: string,
    preview: Buffer,
    mediaId: string | null,
  ): Promise<StudioPost> {
    const key = PREVIEW_KEY_PREFIX + randomUUID();
    await this.storage.put(key, preview, 'image/webp');
    let old: string | null;
    try {
      old = await this.prisma.$transaction(async (tx) => {
        const post = await lockPost(tx, creatorProfileId, postId);
        if (post.visibility !== 'PREMIUM') throw new DomainError('COVER_REQUIRES_PREMIUM');
        // Media delete takes the same lock, so the source can't disappear after this check.
        if (mediaId) {
          const media = await tx.mediaAsset.findFirst({
            where: { id: mediaId, postId, status: 'READY' },
            select: { id: true },
          });
          if (!media) throw new DomainError('NOT_FOUND');
        }
        const { previewKey } = await tx.post.findUniqueOrThrow({
          where: { id: postId },
          select: { previewKey: true },
        });
        await tx.post.update({
          where: { id: postId },
          data: { coverMediaId: mediaId, previewKey: key },
        });
        return previewKey;
      });
    } catch (err) {
      this.deleteObject(key);
      throw err;
    }
    if (old) this.deleteObject(old);
    return this.posts.get(creatorProfileId, postId);
  }

  /** Best effort: the row no longer references the key; an orphaned private preview is harmless. */
  private deleteObject(key: string): void {
    this.storage.delete(key).catch((err: unknown) => {
      this.logger.warn(`post preview cleanup failed for ${key}: ${(err as Error).message}`);
    });
  }
}
