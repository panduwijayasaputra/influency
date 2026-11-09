import { randomUUID } from 'node:crypto';
import { POST_VIDEO_MAX_BYTES } from '@influency/shared';
import sharp from 'sharp';
import { detectVideoType } from './image-type.js';
import type { ObjectStorage } from './object-storage.js';
import type {
  VideoPlayback,
  VideoProvider,
  VideoStatus,
  VideoUpload,
  VideoUploadInput,
} from './video-provider.js';

const KEY_PREFIX = 'post-video/';
const THUMB_PREFIX = 'post-video-thumb/';

/**
 * Development/test stand-in for Cloudflare Stream: the upload goes to private object storage through a presigned PUT;
 * once the bytes pass the size and container check, the video reports `processing` for `processingMs`, then `ready`.
 */
// shortcut: validation state is in memory per process (a restart re-validates once); dev/test only, never production (env rule).
// shortcut: the presigned PUT stays valid after validation, so bytes can be swapped; Stream upload URLs are one-time.
export class StubVideoProvider implements VideoProvider {
  private readonly validated = new Map<string, { readyAt: number; byteSize: number }>();

  constructor(
    private readonly storage: ObjectStorage,
    private readonly processingMs = 5000,
  ) {}

  async createUpload(input: VideoUploadInput): Promise<VideoUpload> {
    const uid = randomUUID();
    const upload = await this.storage.createUploadUrl(
      KEY_PREFIX + uid,
      input.contentType,
      input.expiresInSeconds,
    );
    return { uid, upload: { url: upload.url, method: 'PUT', headers: upload.headers } };
  }

  async getStatus(uid: string): Promise<VideoStatus> {
    let entry = this.validated.get(uid);
    if (!entry) {
      const key = KEY_PREFIX + uid;
      const head = await this.storage.head(key);
      if (!head) return status('pending_upload');
      if (head.size > POST_VIDEO_MAX_BYTES) return status('error');
      // Downloads the whole object once (dev only; local files or a dev bucket).
      const object = await this.storage.get(key);
      if (!object) return status('pending_upload');
      if (!detectVideoType(object.body)) return status('error');
      entry = { readyAt: Date.now() + this.processingMs, byteSize: object.body.length };
      this.validated.set(uid, entry);
    }
    if (Date.now() < entry.readyAt) return status('processing');
    return { state: 'ready', durationSeconds: null, byteSize: entry.byteSize };
  }

  /** The stub can't decode video: once ready, a generated gray frame stands in for the thumbnail (dev only). */
  async getThumbnail(uid: string): Promise<Uint8Array | null> {
    if ((await this.getStatus(uid)).state !== 'ready') return null;
    return sharp({ create: { width: 640, height: 360, channels: 3, background: '#808080' } })
      .jpeg()
      .toBuffer();
  }

  /** Short-lived storage download URLs for the file and its generated poster (stored privately once; dev only). */
  async createPlaybackUrl(uid: string, expiresInSeconds: number): Promise<VideoPlayback | null> {
    if ((await this.getStatus(uid)).state !== 'ready') return null;
    const thumbKey = `${THUMB_PREFIX}${uid}.jpg`;
    if (!(await this.storage.head(thumbKey))) {
      await this.storage.put(thumbKey, (await this.getThumbnail(uid))!, 'image/jpeg');
    }
    const download = await this.storage.createDownloadUrl(KEY_PREFIX + uid, expiresInSeconds);
    const poster = await this.storage.createDownloadUrl(thumbKey, expiresInSeconds);
    return { ...download, posterUrl: poster.url, player: 'video' };
  }

  async delete(uid: string): Promise<void> {
    this.validated.delete(uid);
    await this.storage.delete(KEY_PREFIX + uid);
    await this.storage.delete(`${THUMB_PREFIX}${uid}.jpg`);
  }
}

const status = (state: VideoStatus['state']): VideoStatus => ({
  state,
  durationSeconds: null,
  byteSize: null,
});
