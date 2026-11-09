import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CreateMediaUploadInput,
  isPostEditable,
  mediaKindOf,
  type MediaRejectionReason,
  type MediaStatus,
  type PostStatus,
  type MediaUploadResponse,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
  POST_MEDIA_MAX_PER_POST,
  POST_VIDEO_MAX_BYTES,
  POST_VIDEO_MAX_DURATION_SECONDS,
  type StudioMedia,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { MEDIA_ORDER } from '../../common/media-order.js';
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
  type VideoUpload,
} from '../../common/video-provider.js';
import type { MediaAsset, Prisma } from '../../generated/prisma/client.js';

const KEY_PREFIX = 'post-media/';
/** Max stale rows handled per sweep run; the next run picks up the rest. */
const SWEEP_BATCH = 100;

/** A row's state after a refresh. */
interface Refreshed {
  status: MediaStatus;
  reason?: MediaRejectionReason;
}

/**
 * Media of the caller's own posts. Images: presigned upload slot → client PUT → complete (size + magic-byte check).
 * Videos: provider upload slot → client upload → complete/list poll the provider (PROCESSING → READY | REJECTED).
 * Every query is scoped to the creator profile, so a foreign post or media id is the same NOT_FOUND as an unknown one.
 * Expired slots and videos stuck in PROCESSING are rejected (bytes deleted) by `refresh`, which complete, list, the
 * stale-upload sweep and the provider webhook share (US-049). Rows only move forward; READY and REJECTED are final.
 */
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
          // The new item goes last. Under the post-row lock, so two uploads can never share a position.
          const { _max } = await tx.mediaAsset.aggregate({
            where: { postId },
            _max: { position: true },
          });
          return tx.mediaAsset.create({
            data: {
              postId,
              kind,
              ...(video ? { videoUid: video.uid } : { objectKey: KEY_PREFIX + randomUUID() }),
              contentType: input.contentType,
              byteSize: input.byteSize,
              uploadExpiresAt: new Date(now.getTime() + ttl * 1000),
              position: (_max.position ?? -1) + 1,
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

    // Expired slots stop counting toward the limit, so completing one late could exceed it: refresh rejects them.
    const refreshed = await this.refresh(row, new Date());
    if (refreshed.status === 'REJECTED') throw rejectionError(refreshed.reason);
    if (row.kind === 'VIDEO') {
      if (refreshed.status === 'PENDING_UPLOAD') throw new DomainError('MEDIA_UPLOAD_MISSING');
      return toStudioMedia(await this.findOwned(creatorProfileId, postId, mediaId));
    }
    const head = await this.storage.head(row.objectKey!);
    if (!head) throw new DomainError('MEDIA_UPLOAD_MISSING');
    // R2 presigned PUTs can't cap the size: check before downloading anything.
    if (head.size > POST_IMAGE_MAX_BYTES) {
      await this.reject(row, 'TOO_LARGE');
      throw new DomainError('FILE_TOO_LARGE', { maxBytes: POST_IMAGE_MAX_BYTES });
    }
    const object = await this.storage.get(row.objectKey!);
    if (!object) throw new DomainError('MEDIA_UPLOAD_MISSING');
    const type = detectImageType(object.body);
    if (!type || !(POST_IMAGE_TYPES as readonly string[]).includes(type)) {
      await this.reject(row, 'UNSUPPORTED_TYPE');
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
    const now = new Date();
    const stale = await this.prisma.mediaAsset.findMany({
      where: {
        postId,
        OR: [
          { kind: 'VIDEO', status: 'PROCESSING' },
          { status: 'PENDING_UPLOAD', uploadExpiresAt: { lte: now } },
        ],
      },
    });
    // A provider outage leaves rows PROCESSING; the list itself still answers.
    await Promise.all(
      stale.map((row) =>
        this.refresh(row, now).catch((err: unknown) => {
          this.logger.warn(
            `video status check failed for media ${row.id}: ${(err as Error).message}`,
          );
        }),
      ),
    );
    // In-flight PENDING_UPLOAD rows stay hidden; failed ones are listed so the creator can remove or retry them.
    const rows = await this.prisma.mediaAsset.findMany({
      where: { postId, status: { in: ['READY', 'PROCESSING', 'REJECTED'] } },
      orderBy: MEDIA_ORDER,
    });
    return rows.map(toStudioMedia);
  }

  /**
   * Sets the order of a draft's media. Under the post-row lock (the same one uploads and deletes take), so an upload
   * can't slip in between the check and the write. Every item the studio list shows must be listed; an id that is not
   * this post's (foreign or unknown) or a repeated id is refused. In-flight uploads the list hides may be left out:
   * they follow the listed items.
   */
  async reorder(
    creatorProfileId: string,
    postId: string,
    mediaIds: string[],
  ): Promise<StudioMedia[]> {
    const invalid = () =>
      new DomainError('VALIDATION_FAILED', {
        issues: [{ path: 'mediaIds', message: 'Urutan media tidak sesuai.' }],
      });
    await this.prisma.$transaction(async (tx) => {
      await lockEditablePost(tx, creatorProfileId, postId);
      const rows = await tx.mediaAsset.findMany({
        where: { postId },
        orderBy: MEDIA_ORDER,
        select: { id: true, status: true },
      });
      const known = new Set(rows.map((r) => r.id));
      const listed = new Set(mediaIds);
      if (listed.size !== mediaIds.length) throw invalid();
      if (mediaIds.some((id) => !known.has(id))) throw invalid();
      const hidden = (status: string) => status === 'PENDING_UPLOAD';
      if (rows.some((r) => !hidden(r.status) && !listed.has(r.id))) throw invalid();
      const order = [...mediaIds, ...rows.filter((r) => !listed.has(r.id)).map((r) => r.id)];
      for (const [position, id] of order.entries()) {
        await tx.mediaAsset.update({ where: { id }, data: { position } });
      }
    });
    return this.list(creatorProfileId, postId);
  }

  /** Owner preview: the bytes of a READY image, typed by the detected (stored) content type. Video playback is US-021. */
  async content(creatorProfileId: string, postId: string, mediaId: string): Promise<StoredObject> {
    const row = await this.findOwned(creatorProfileId, postId, mediaId);
    if (row.status !== 'READY' || row.kind !== 'IMAGE') throw new DomainError('NOT_FOUND');
    const object = await this.storage.get(row.objectKey!);
    if (!object) throw new DomainError('NOT_FOUND');
    return { body: object.body, contentType: row.contentType };
  }

  /**
   * Under the post-row lock, so a concurrent publish never ends up with a live post missing its media.
   * A REJECTED item may be removed in any post status: viewers never see it (US-049).
   * Deleting the cover's source also clears the cover and its preview (US-048).
   */
  async remove(creatorProfileId: string, postId: string, mediaId: string): Promise<void> {
    const { row, previewKey } = await this.prisma.$transaction(async (tx) => {
      const status = await lockOwnedPost(tx, creatorProfileId, postId);
      const media = await tx.mediaAsset.findFirst({ where: { id: mediaId, postId } });
      if (!media) throw new DomainError('NOT_FOUND');
      if (media.status !== 'REJECTED' && !isPostEditable(status)) {
        throw new DomainError('POST_LOCKED');
      }
      const cover = await tx.post.findFirst({
        where: { id: postId, coverMediaId: media.id },
        select: { previewKey: true },
      });
      if (cover) {
        await tx.post.update({
          where: { id: postId },
          data: { coverMediaId: null, previewKey: null },
        });
      }
      await tx.mediaAsset.delete({ where: { id: media.id } });
      return { row: media, previewKey: cover?.previewKey ?? null };
    });
    this.cleanup(row);
    if (previewKey) this.deleteObject(previewKey);
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
   * A verified provider event for `uid`: re-reads the provider's state through refresh, so duplicate, replayed or
   * out-of-order events never regress a row. Unknown videos are acknowledged. Provider errors propagate (500, retry).
   */
  async handleVideoEvent(uid: string): Promise<void> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { videoUid: uid } });
    if (!row) {
      this.logger.log('stream webhook for an unknown video');
      return;
    }
    const { status } = await this.refresh(row, new Date());
    this.logger.log(`stream webhook for media ${row.id}: ${status}`);
  }

  /**
   * Marks stale uploads failed and deletes their bytes: expired upload slots, and videos still PROCESSING
   * VIDEO_PROCESSING_TIMEOUT_SECONDS after their slot expired (the provider is asked once more first).
   * System job, not creator-scoped. Returns the rows handled; a provider error skips that row until the next run.
   */
  async sweep(now = new Date()): Promise<number> {
    const timeoutMs = this.env.VIDEO_PROCESSING_TIMEOUT_SECONDS * 1000;
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        OR: [
          { status: 'PENDING_UPLOAD', uploadExpiresAt: { lte: now } },
          {
            kind: 'VIDEO',
            status: 'PROCESSING',
            uploadExpiresAt: { lte: new Date(now.getTime() - timeoutMs) },
          },
        ],
      },
      orderBy: [{ uploadExpiresAt: 'asc' }, { id: 'asc' }],
      take: SWEEP_BATCH,
    });
    // Sequential: keeps provider calls flat.
    for (const row of rows) {
      try {
        await this.refresh(row, now);
      } catch (err) {
        this.logger.warn(`stale media sweep failed for media ${row.id}: ${(err as Error).message}`);
      }
    }
    return rows.length;
  }

  /**
   * Moves a row to its next state with conditional updates, so concurrent callers (complete, list, sweep, webhook)
   * never regress it. Expired slots are rejected without asking the provider; a video follows the provider's state,
   * re-checked against the size/duration limits and the processing timeout. Provider errors propagate, row unchanged.
   */
  private async refresh(row: MediaAsset, now: Date): Promise<Refreshed> {
    if (row.status === 'READY' || row.status === 'REJECTED') {
      return { status: row.status, reason: row.rejectionReason ?? undefined };
    }
    if (row.status === 'PENDING_UPLOAD' && row.uploadExpiresAt <= now) {
      return this.rejected(row, 'UPLOAD_EXPIRED');
    }
    if (row.kind === 'IMAGE') return { status: row.status };
    const status = await this.video.getStatus(row.videoUid!);
    if (!status || status.state === 'error') return this.rejected(row, 'PROCESSING_FAILED');
    if (status.state === 'pending_upload') return { status: row.status };
    if (status.state === 'ready') {
      if (
        status.durationSeconds != null &&
        status.durationSeconds > POST_VIDEO_MAX_DURATION_SECONDS
      ) {
        return this.rejected(row, 'TOO_LONG');
      }
      if (status.byteSize != null && status.byteSize > POST_VIDEO_MAX_BYTES) {
        return this.rejected(row, 'TOO_LARGE');
      }
      await this.prisma.mediaAsset.updateMany({
        where: { id: row.id, status: { in: ['PENDING_UPLOAD', 'PROCESSING'] } },
        data: {
          status: 'READY',
          durationSeconds: status.durationSeconds,
          byteSize: status.byteSize ?? row.byteSize,
        },
      });
      return { status: 'READY' };
    }
    const deadline =
      row.uploadExpiresAt.getTime() + this.env.VIDEO_PROCESSING_TIMEOUT_SECONDS * 1000;
    if (deadline <= now.getTime()) return this.rejected(row, 'PROCESSING_TIMEOUT');
    await this.prisma.mediaAsset.updateMany({
      where: { id: row.id, status: 'PENDING_UPLOAD' },
      data: { status: 'PROCESSING' },
    });
    return { status: 'PROCESSING' };
  }

  private async rejected(row: MediaAsset, reason: MediaRejectionReason): Promise<Refreshed> {
    await this.reject(row, reason);
    return { status: 'REJECTED', reason };
  }

  /** Conditional; only the caller whose update won deletes the bytes (a concurrent poll may have just made it READY). */
  private async reject(row: MediaAsset, reason: MediaRejectionReason): Promise<void> {
    const { count } = await this.prisma.mediaAsset.updateMany({
      where: { id: row.id, status: { in: ['PENDING_UPLOAD', 'PROCESSING'] } },
      data: { status: 'REJECTED', rejectionReason: reason },
    });
    if (count === 1) this.cleanup(row);
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

/** Locks the owned post row and returns its status; NOT_FOUND when foreign or unknown. */
async function lockOwnedPost(
  tx: Prisma.TransactionClient,
  creatorProfileId: string,
  postId: string,
): Promise<PostStatus> {
  const locked = await tx.$queryRaw<{ status: PostStatus }[]>`
    SELECT status::text AS status FROM posts
    WHERE id = ${postId}::uuid AND creator_profile_id = ${creatorProfileId}::uuid
    FOR UPDATE`;
  if (locked.length === 0) throw new DomainError('NOT_FOUND');
  return locked[0]!.status;
}

/** lockOwnedPost, plus POST_LOCKED while the post is live. */
async function lockEditablePost(
  tx: Prisma.TransactionClient,
  creatorProfileId: string,
  postId: string,
): Promise<void> {
  if (!isPostEditable(await lockOwnedPost(tx, creatorProfileId, postId))) {
    throw new DomainError('POST_LOCKED');
  }
}

/** The complete() error for an upload that ended up REJECTED. */
function rejectionError(reason: MediaRejectionReason | undefined): DomainError {
  switch (reason) {
    case 'TOO_LONG':
      return new DomainError('VIDEO_TOO_LONG', { maxSeconds: POST_VIDEO_MAX_DURATION_SECONDS });
    case 'TOO_LARGE':
      return new DomainError('FILE_TOO_LARGE', { maxBytes: POST_VIDEO_MAX_BYTES });
    case 'UPLOAD_EXPIRED':
      return new DomainError('MEDIA_UPLOAD_MISSING');
    default:
      return new DomainError('VIDEO_PROCESSING_FAILED');
  }
}

function toStudioMedia(row: MediaAsset): StudioMedia {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    contentType: row.contentType,
    byteSize: row.byteSize,
    durationSeconds: row.durationSeconds,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
  };
}
