import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CreateMediaUploadInput,
  isPostEditable,
  mediaKindOf,
  type PostStatus,
  type MediaUploadResponse,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
  POST_MEDIA_MAX_PER_POST,
  POST_VIDEO_MAX_DURATION_SECONDS,
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
import {
  VIDEO_PROVIDER,
  type VideoProvider,
  type VideoStatus,
  type VideoUpload,
} from '../../common/video-provider.js';
import type { MediaAsset, Prisma } from '../../generated/prisma/client.js';

const KEY_PREFIX = 'post-media/';

/**
 * Media of the caller's own posts. Images: presigned upload slot → client PUT → complete (size + magic-byte check).
 * Videos: provider upload slot → client upload → complete/list poll the provider (PROCESSING → READY | REJECTED).
 * Every query is scoped to the creator profile, so a foreign post or media id is the same NOT_FOUND as an unknown one.
 */
// shortcut: abandoned PENDING_UPLOAD rows/objects (incl. oversized ones never completed) stay in storage; add a cleanup job with the worker (Phase 5).
// shortcut: a video stuck in PROCESSING keeps counting toward the limit until deleted; add a sweeper or Stream webhook with the worker (Phase 5).
@Injectable()
export class PostMediaService {
  private readonly logger = new Logger(PostMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createUpload(
    creatorProfileId: string,
    postId: string,
    input: CreateMediaUploadInput,
  ): Promise<MediaUploadResponse> {
    const kind = mediaKindOf(input.contentType);
    const ttl =
      kind === 'VIDEO' ? this.env.VIDEO_UPLOAD_TTL_SECONDS : this.env.UPLOAD_URL_TTL_SECONDS;
    let video: VideoUpload | undefined;
    const row = await this.prisma
      .$transaction(
        async (tx) => {
          // Lock the post row so concurrent slot requests can't exceed the per-post limit.
          await lockEditablePost(tx, creatorProfileId, postId);
          const now = new Date();
          const used = await tx.mediaAsset.count({
            where: {
              postId,
              OR: [
                { status: { in: ['READY', 'PROCESSING'] } },
                { status: 'PENDING_UPLOAD', uploadExpiresAt: { gt: now } },
              ],
            },
          });
          if (used >= POST_MEDIA_MAX_PER_POST) {
            throw new DomainError('MEDIA_LIMIT_REACHED', { max: POST_MEDIA_MAX_PER_POST });
          }
          // Inside the lock, so a slot is only created at the provider when the limit allows it.
          if (kind === 'VIDEO') {
            video = await this.video.createUpload({
              contentType: input.contentType,
              maxDurationSeconds: POST_VIDEO_MAX_DURATION_SECONDS,
              expiresInSeconds: ttl,
            });
          }
          return tx.mediaAsset.create({
            data: {
              postId,
              kind,
              ...(video ? { videoUid: video.uid } : { objectKey: KEY_PREFIX + randomUUID() }),
              contentType: input.contentType,
              byteSize: input.byteSize,
              uploadExpiresAt: new Date(now.getTime() + ttl * 1000),
            },
          });
        },
        // Room for one provider call while the post row is locked.
        { timeout: 15_000 },
      )
      .catch((err: unknown) => {
        if (video) this.deleteVideo(video.uid);
        throw err;
      });
    let upload: VideoUpload['upload'];
    if (video) upload = video.upload;
    else {
      const { url, headers } = await this.storage.createUploadUrl(
        row.objectKey!,
        row.contentType,
        ttl,
      );
      upload = { url, method: 'PUT', headers };
    }
    return {
      media: toStudioMedia(row),
      upload: { ...upload, expiresAt: row.uploadExpiresAt.toISOString() },
    };
  }

  /**
   * Images: accepted only if the real size and magic bytes pass; otherwise deleted. Videos: moved to the provider's state.
   * Idempotent once READY.
   */
  async complete(creatorProfileId: string, postId: string, mediaId: string): Promise<StudioMedia> {
    const row = await this.findOwned(creatorProfileId, postId, mediaId);
    if (row.status === 'READY') return toStudioMedia(row);
    // shortcut: unlocked status read; a complete racing a publish can add media to the creator's own live post. Lock the post row if that matters.
    if (!isPostEditable(row.post.status)) throw new DomainError('POST_LOCKED');
    // A rejected upload can't be retried; the client asks for a new slot.
    if (row.status === 'REJECTED') throw new DomainError('MEDIA_UPLOAD_MISSING');

    // Expired slots stop counting toward the limit, so completing one late could exceed it.
    if (row.status === 'PENDING_UPLOAD' && row.uploadExpiresAt <= new Date()) {
      await this.reject(row);
      throw new DomainError('MEDIA_UPLOAD_MISSING');
    }
    if (row.kind === 'VIDEO') {
      const status = await this.video.getStatus(row.videoUid!);
      if (status?.state === 'pending_upload') throw new DomainError('MEDIA_UPLOAD_MISSING');
      if (!(await this.applyVideoStatus(row, status))) {
        throw new DomainError('VIDEO_PROCESSING_FAILED');
      }
      return toStudioMedia(await this.findOwned(creatorProfileId, postId, mediaId));
    }
    const head = await this.storage.head(row.objectKey!);
    if (!head) throw new DomainError('MEDIA_UPLOAD_MISSING');
    // R2 presigned PUTs can't cap the size: check before downloading anything.
    if (head.size > POST_IMAGE_MAX_BYTES) {
      await this.reject(row);
      throw new DomainError('FILE_TOO_LARGE', { maxBytes: POST_IMAGE_MAX_BYTES });
    }
    const object = await this.storage.get(row.objectKey!);
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
    this.deleteObject(count === 0 ? finalKey : row.objectKey!);
    return toStudioMedia(await this.findOwned(creatorProfileId, postId, mediaId));
  }

  async list(creatorProfileId: string, postId: string): Promise<StudioMedia[]> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, creatorProfileId },
      select: { id: true },
    });
    if (!post) throw new DomainError('NOT_FOUND');
    const processing = await this.prisma.mediaAsset.findMany({
      where: { postId, kind: 'VIDEO', status: 'PROCESSING' },
    });
    // A provider outage leaves rows PROCESSING; the list itself still answers.
    await Promise.all(
      processing.map((row) =>
        this.video
          .getStatus(row.videoUid!)
          .then((status) => this.applyVideoStatus(row, status))
          .catch((err: unknown) => {
            this.logger.warn(
              `video status check failed for media ${row.id}: ${(err as Error).message}`,
            );
          }),
      ),
    );
    const rows = await this.prisma.mediaAsset.findMany({
      where: { postId, status: { in: ['READY', 'PROCESSING'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toStudioMedia);
  }

  /** Owner preview: the bytes of a READY image, typed by the detected (stored) content type. Video playback is US-021. */
  async content(creatorProfileId: string, postId: string, mediaId: string): Promise<StoredObject> {
    const row = await this.findOwned(creatorProfileId, postId, mediaId);
    if (row.status !== 'READY' || row.kind !== 'IMAGE') throw new DomainError('NOT_FOUND');
    const object = await this.storage.get(row.objectKey!);
    if (!object) throw new DomainError('NOT_FOUND');
    return { body: object.body, contentType: row.contentType };
  }

  /** Under the post-row lock, so a concurrent publish never ends up with a live post missing its media. */
  async remove(creatorProfileId: string, postId: string, mediaId: string): Promise<void> {
    const row = await this.prisma.$transaction(async (tx) => {
      await lockEditablePost(tx, creatorProfileId, postId);
      const media = await tx.mediaAsset.findFirst({ where: { id: mediaId, postId } });
      if (!media) throw new DomainError('NOT_FOUND');
      await tx.mediaAsset.delete({ where: { id: media.id } });
      return media;
    });
    this.cleanup(row);
  }

  private async findOwned(
    creatorProfileId: string,
    postId: string,
    mediaId: string,
  ): Promise<MediaAsset & { post: { status: PostStatus } }> {
    const row = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, post: { id: postId, creatorProfileId } },
      include: { post: { select: { status: true } } },
    });
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }

  /**
   * Moves a video row to the provider's state with conditional updates, so a concurrent delete/complete wins cleanly.
   * A missing or failed video is rejected; returns false then.
   */
  private async applyVideoStatus(row: MediaAsset, status: VideoStatus | null): Promise<boolean> {
    if (!status || status.state === 'error') {
      await this.reject(row);
      return false;
    }
    if (status.state === 'ready') {
      await this.prisma.mediaAsset.updateMany({
        where: { id: row.id, status: { in: ['PENDING_UPLOAD', 'PROCESSING'] } },
        data: {
          status: 'READY',
          durationSeconds: status.durationSeconds,
          byteSize: status.byteSize ?? row.byteSize,
        },
      });
    } else if (status.state === 'processing') {
      await this.prisma.mediaAsset.updateMany({
        where: { id: row.id, status: 'PENDING_UPLOAD' },
        data: { status: 'PROCESSING' },
      });
    }
    return true;
  }

  private async reject(row: MediaAsset): Promise<void> {
    await this.prisma.mediaAsset.updateMany({
      where: { id: row.id, status: { in: ['PENDING_UPLOAD', 'PROCESSING'] } },
      data: { status: 'REJECTED' },
    });
    this.cleanup(row);
  }

  /** Best effort removal of a removed/rejected row's bytes. */
  private cleanup(row: MediaAsset): void {
    if (row.kind === 'VIDEO') this.deleteVideo(row.videoUid!, row.id);
    else this.deleteObject(row.objectKey!);
  }

  /** Best effort, like deleteObject; logs the media id, not the provider uid. */
  private deleteVideo(uid: string, mediaId = 'without row'): void {
    this.video.delete(uid).catch((err: unknown) => {
      this.logger.warn(`post video cleanup failed for media ${mediaId}: ${(err as Error).message}`);
    });
  }

  /** Best effort: the row is already gone/rejected; an orphaned private object is harmless. */
  private deleteObject(key: string): void {
    this.storage.delete(key).catch((err: unknown) => {
      this.logger.warn(`post media cleanup failed for ${key}: ${(err as Error).message}`);
    });
  }
}

/** Locks the owned post row; NOT_FOUND when foreign or unknown, POST_LOCKED while it is live. */
async function lockEditablePost(
  tx: Prisma.TransactionClient,
  creatorProfileId: string,
  postId: string,
): Promise<void> {
  const locked = await tx.$queryRaw<{ status: PostStatus }[]>`
    SELECT status::text AS status FROM posts
    WHERE id = ${postId}::uuid AND creator_profile_id = ${creatorProfileId}::uuid
    FOR UPDATE`;
  if (locked.length === 0) throw new DomainError('NOT_FOUND');
  if (!isPostEditable(locked[0]!.status)) throw new DomainError('POST_LOCKED');
}

function toStudioMedia(row: MediaAsset): StudioMedia {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    contentType: row.contentType,
    byteSize: row.byteSize,
    durationSeconds: row.durationSeconds,
    createdAt: row.createdAt.toISOString(),
  };
}
