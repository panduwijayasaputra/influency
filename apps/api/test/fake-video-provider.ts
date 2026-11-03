import { randomUUID } from 'node:crypto';
import type { VideoProvider, VideoStatus } from '../src/common/video-provider.js';

type Op = 'getStatus' | 'delete';

/**
 * In-memory `VideoProvider` for tests (override `VIDEO_PROVIDER`). New uploads start `pending_upload`;
 * drive them by editing `videos`. Set `failNext.<op>` to make the next call of that op reject.
 */
export function createFakeVideoProvider() {
  const videos = new Map<string, VideoStatus>();
  const deleted: string[] = [];
  const failNext: Record<Op, boolean> = { getStatus: false, delete: false };
  const run = <T>(op: Op, action: () => T): Promise<T> => {
    if (!failNext[op]) return Promise.resolve(action());
    failNext[op] = false;
    return Promise.reject(new Error(`fake video ${op} failed`));
  };
  const provider: VideoProvider = {
    createUpload: () => {
      const uid = randomUUID().replaceAll('-', '');
      videos.set(uid, { state: 'pending_upload', durationSeconds: null, byteSize: null });
      return Promise.resolve({
        uid,
        upload: { url: `fake://upload/${uid}`, method: 'POST', headers: {}, formField: 'file' },
      });
    },
    getStatus: (uid) => run('getStatus', () => videos.get(uid) ?? null),
    delete: (uid) =>
      run('delete', () => {
        videos.delete(uid);
        deleted.push(uid);
      }),
  };
  /** Sets the state (and optional duration/size) of a video. */
  const set = (uid: string, state: VideoStatus['state'], extra: Partial<VideoStatus> = {}) =>
    videos.set(uid, { state, durationSeconds: null, byteSize: null, ...extra });
  return { provider, videos, deleted, failNext, set };
}
