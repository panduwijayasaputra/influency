import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CreateMediaUploadInput,
  type MediaUploadResponse,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
  POST_MEDIA_MAX_PER_POST,
  type StudioMedia,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { detectImageType } from '../../common/image-type.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from '../../common/object-storage.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { MediaAsset } from '../../generated/prisma/client.js';

const KEY_PREFIX = 'post-media/';

/**
 * Images of the caller's own posts: presigned upload slot → client PUT → complete (size + magic-byte check).
 * Every query is scoped to the creator profile, so a foreign post or media id is the same NOT_FOUND as an unknown one.
 */
// shortcut: abandoned PENDING_UPLOAD rows/objects (incl. oversized ones never completed) stay in storage; add a cleanup job with the worker (Phase 5).
@Injectable()
export class PostMediaService {
  private readonly logger = new Logger(PostMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createUpload(
    creatorProfileId: string,
    postId: string,
    input: CreateMediaUploadInput,
  ): Promise<MediaUploadResponse> {
    const ttl = this.env.UPLOAD_URL_TTL_SECONDS;
    const row = await this.prisma.$transaction(async (tx) => {
      // Lock the post row so concurrent slot requests can't exceed the per-post limit.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM posts
        WHERE id = ${postId}::uuid AND creator_profile_id = ${creatorProfileId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) throw new DomainError('NOT_FOUND');
      const now = new Date();
      const used = await tx.mediaAsset.count({
        where: {
          postId,
          OR: [{ status: 'READY' }, { status: 'PENDING_UPLOAD', uploadExpiresAt: { gt: now } }],
        },
      });
      if (used >= POST_MEDIA_MAX_PER_POST) {
        throw new DomainError('MEDIA_LIMIT_REACHED', { max: POST_MEDIA_MAX_PER_POST });
      }
      return tx.mediaAsset.create({
        data: {
          postId,
          kind: 'IMAGE',
          objectKey: KEY_PREFIX + randomUUID(),
          contentType: input.contentType,
          byteSize: input.byteSize,
          uploadExpiresAt: new Date(now.getTime() + ttl * 1000),
        },
      });
    });
    const upload = await this.storage.createUploadUrl(row.objectKey, row.contentType, ttl);
    return {
      media: toStudioMedia(row),
      upload: {
        url: upload.url,
        method: 'PUT',
        headers: upload.headers,
        expiresAt: row.uploadExpiresAt.toISOString(),
      },
    };
  }

  /** Accepts the uploaded object only if its real size and magic bytes pass; otherwise deletes it. Idempotent once READY. */
  async complete(creatorProfileId: string, postId: string, mediaId: string): Promise<StudioMedia> {
    const row = await this.findOwned(creatorProfileId, postId, mediaId);
    if (row.status === 'READY') return toStudioMedia(row);
    // A rejected upload can't be retried; the client asks for a new slot.
    if (row.status === 'REJECTED') throw new DomainError('MEDIA_UPLOAD_MISSING');

    // Expired slots stop counting toward the limit, so completing one late could exceed it.
    if (row.uploadExpiresAt <= new Date()) {
      await this.reject(row);
      throw new DomainError('MEDIA_UPLOAD_MISSING');
    }
    const head = await this.storage.head(row.objectKey);
    if (!head) throw new DomainError('MEDIA_UPLOAD_MISSING');
    // R2 presigned PUTs can't cap the size: check before downloading anything.
    if (head.size > POST_IMAGE_MAX_BYTES) {
      await this.reject(row);
      throw new DomainError('FILE_TOO_LARGE', { maxBytes: POST_IMAGE_MAX_BYTES });
    }
    const object = await this.storage.get(row.objectKey);
    if (!object) throw new DomainError('MEDIA_UPLOAD_MISSING');
    const type = detectImageType(object.body);
    if (!type || !(POST_IMAGE_TYPES as readonly string[]).includes(type)) {
      await this.reject(row);
      throw new DomainError('UNSUPPORTED_FILE_TYPE');
    }
    // The presigned URL stays valid until it expires, so the checked bytes move to a key the client can't write to.
    const finalKey = KEY_PREFIX + randomUUID();
    await this.storage.put(finalKey, object.body, type);
    // Conditional transition: a concurrent complete or delete that won first is not overwritten.
    const { count } = await this.prisma.mediaAsset.updateMany({
      where: { id: row.id, status: 'PENDING_UPLOAD' },
      data: {
        status: 'READY',
        objectKey: finalKey,
        contentType: type,
        byteSize: object.body.length,
      },
    });
    this.deleteObject(count === 0 ? finalKey : row.objectKey);
    return toStudioMedia(await this.findOwned(creatorProfileId, postId, mediaId));
  }

  async list(creatorProfileId: string, postId: string): Promise<StudioMedia[]> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, creatorProfileId },
      select: { id: true },
    });
    if (!post) throw new DomainError('NOT_FOUND');
    const rows = await this.prisma.mediaAsset.findMany({
      where: { postId, status: 'READY' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toStudioMedia);
  }

  /** Owner preview: the bytes of a READY image, typed by the detected (stored) content type. */
  async content(creatorProfileId: string, postId: string, mediaId: string): Promise<StoredObject> {
    const row = await this.findOwned(creatorProfileId, postId, mediaId);
    if (row.status !== 'READY') throw new DomainError('NOT_FOUND');
    const object = await this.storage.get(row.objectKey);
    if (!object) throw new DomainError('NOT_FOUND');
    return { body: object.body, contentType: row.contentType };
  }

  // Edit/delete rules for published or purchased posts arrive with US-019.
  async remove(creatorProfileId: string, postId: string, mediaId: string): Promise<void> {
    const row = await this.findOwned(creatorProfileId, postId, mediaId);
    const { count } = await this.prisma.mediaAsset.deleteMany({ where: { id: row.id } });
    if (count === 0) throw new DomainError('NOT_FOUND');
    this.deleteObject(row.objectKey);
  }

  private async findOwned(
    creatorProfileId: string,
    postId: string,
    mediaId: string,
  ): Promise<MediaAsset> {
    const row = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, post: { id: postId, creatorProfileId } },
    });
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }

  private async reject(row: MediaAsset): Promise<void> {
    await this.prisma.mediaAsset.updateMany({
      where: { id: row.id, status: 'PENDING_UPLOAD' },
      data: { status: 'REJECTED' },
    });
    this.deleteObject(row.objectKey);
  }

  /** Best effort: the row is already gone/rejected; an orphaned private object is harmless. */
  private deleteObject(key: string): void {
    this.storage.delete(key).catch((err: unknown) => {
      this.logger.warn(`post media cleanup failed for ${key}: ${(err as Error).message}`);
    });
  }
}

function toStudioMedia(row: MediaAsset): StudioMedia {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    contentType: row.contentType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
  };
}
