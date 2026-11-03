import { readFileSync } from 'node:fs';
import { POST_VIDEO_MAX_BYTES } from '@influency/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../test/memory-storage.js';
import { StubVideoProvider } from './stub-video-provider.js';

const SAMPLE = new Uint8Array(
  readFileSync(new URL('../../test/fixtures/sample.mp4', import.meta.url)),
);

/** Slot + simulated browser PUT; returns the uid and storage key. */
async function uploaded(
  provider: StubVideoProvider,
  objects: Map<string, unknown>,
  body?: Uint8Array,
) {
  const { uid, upload } = await provider.createUpload({
    contentType: 'video/mp4',
    maxDurationSeconds: 600,
    expiresInSeconds: 1800,
  });
  const key = `post-video/${uid}`;
  if (body) objects.set(key, { body, contentType: 'video/mp4' });
  return { uid, key, upload };
}

describe('StubVideoProvider', () => {
  afterEach(() => vi.useRealTimers());

  it('hands out a presigned PUT for a private post-video key', async () => {
    const { storage, objects } = createMemoryStorage();
    const { uid, upload } = await uploaded(new StubVideoProvider(storage), objects);
    expect(upload).toEqual({
      url: `memory://upload/post-video/${uid}`,
      method: 'PUT',
      headers: { 'content-type': 'video/mp4' },
    });
  });

  it('is pending until uploaded, processing for processingMs, then ready with the size', async () => {
    vi.useFakeTimers();
    const { storage, objects } = createMemoryStorage();
    const provider = new StubVideoProvider(storage, 5000);
    const { uid, key } = await uploaded(provider, objects);
    expect((await provider.getStatus(uid)).state).toBe('pending_upload');
    objects.set(key, { body: SAMPLE, contentType: 'video/mp4' });
    expect((await provider.getStatus(uid)).state).toBe('processing');
    const get = vi.spyOn(storage, 'get');
    vi.advanceTimersByTime(5000);
    expect(await provider.getStatus(uid)).toEqual({
      state: 'ready',
      durationSeconds: null,
      byteSize: SAMPLE.length,
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('reports error for bytes that are not a video', async () => {
    const { storage, objects } = createMemoryStorage();
    const provider = new StubVideoProvider(storage, 0);
    const { uid } = await uploaded(provider, objects, new TextEncoder().encode('%PDF-1.7'));
    expect((await provider.getStatus(uid)).state).toBe('error');
  });

  it('reports error for an oversized upload without downloading it', async () => {
    const { storage, objects } = createMemoryStorage();
    const provider = new StubVideoProvider(storage, 0);
    const { uid } = await uploaded(provider, objects, SAMPLE);
    vi.spyOn(storage, 'head').mockResolvedValueOnce({
      size: POST_VIDEO_MAX_BYTES + 1,
      contentType: 'video/mp4',
    });
    const get = vi.spyOn(storage, 'get');
    expect((await provider.getStatus(uid)).state).toBe('error');
    expect(get).not.toHaveBeenCalled();
  });

  it('delete removes the object and forgets the video', async () => {
    const { storage, objects } = createMemoryStorage();
    const provider = new StubVideoProvider(storage, 0);
    const { uid, key } = await uploaded(provider, objects, SAMPLE);
    expect((await provider.getStatus(uid)).state).toBe('ready');
    await provider.delete(uid);
    expect(objects.has(key)).toBe(false);
    expect((await provider.getStatus(uid)).state).toBe('pending_upload');
  });
});
