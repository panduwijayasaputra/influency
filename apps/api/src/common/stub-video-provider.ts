import { randomUUID } from 'node:crypto';
import { POST_VIDEO_MAX_BYTES } from '@influency/shared';
import { detectVideoType } from './image-type.js';
import type { ObjectStorage } from './object-storage.js';
import type {
  VideoProvider,
  VideoStatus,
  VideoUpload,
  VideoUploadInput,
} from './video-provider.js';

const KEY_PREFIX = 'post-video/';

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

  async delete(uid: string): Promise<void> {
    this.validated.delete(uid);
    await this.storage.delete(KEY_PREFIX + uid);
  }
}

const status = (state: VideoStatus['state']): VideoStatus => ({
  state,
  durationSeconds: null,
  byteSize: null,
});
