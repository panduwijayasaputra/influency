import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareStreamVideoProvider } from './cloudflare-stream-video-provider.js';

const CONFIG = {
  CLOUDFLARE_STREAM_ACCOUNT_ID: 'acct123',
  CLOUDFLARE_STREAM_TOKEN: 'stream-s3cret',
};
const BASE = 'https://api.cloudflare.com/client/v4/accounts/acct123/stream';
const UID = 'ea95132c15732412d22c1476fa83f27a';

const stubFetch = (...responses: Response[]) => {
  const spy = vi.fn<typeof fetch>();
  for (const res of responses) spy.mockResolvedValueOnce(res);
  vi.stubGlobal('fetch', spy);
  return spy;
};
const video = (state: string, extra: object = {}) =>
  Response.json({ success: true, result: { uid: UID, status: { state }, ...extra } });

describe('CloudflareStreamVideoProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('requires the Stream configuration', () => {
    expect(
      () => new CloudflareStreamVideoProvider({ ...CONFIG, CLOUDFLARE_STREAM_TOKEN: undefined }),
    ).toThrow('Cloudflare Stream configuration missing');
  });

  it('creates a direct upload that requires signed playback', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-03T00:00:00.000Z') });
    const spy = stubFetch(
      Response.json({
        success: true,
        result: { uid: UID, uploadURL: `https://upload.videodelivery.net/${UID}` },
      }),
    );
    const upload = await new CloudflareStreamVideoProvider(CONFIG).createUpload({
      contentType: 'video/mp4',
      maxDurationSeconds: 600,
      expiresInSeconds: 1800,
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/direct_upload`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer stream-s3cret' });
    expect(JSON.parse(init?.body as string)).toEqual({
      maxDurationSeconds: 600,
      expiry: '2026-11-03T00:30:00.000Z',
      requireSignedURLs: true,
    });
    expect(upload).toEqual({
      uid: UID,
      upload: {
        url: `https://upload.videodelivery.net/${UID}`,
        method: 'POST',
        headers: {},
        formField: 'file',
      },
    });
  });

  it.each([
    ['pendingupload', {}, 'pending_upload'],
    ['downloading', {}, 'processing'],
    ['queued', {}, 'processing'],
    ['inprogress', {}, 'processing'],
    ['ready', { readyToStream: false }, 'processing'],
    ['ready', { readyToStream: true }, 'ready'],
    ['error', {}, 'error'],
  ])('maps state %s %j to %s', async (state, extra, expected) => {
    stubFetch(video(state, extra));
    const status = await new CloudflareStreamVideoProvider(CONFIG).getStatus(UID);
    expect(status?.state).toBe(expected);
  });

  it('reads duration and size; unknown duration (-1) is null; 404 is null', async () => {
    const spy = stubFetch(
      video('ready', { readyToStream: true, duration: 12.4, size: 4321 }),
      video('inprogress', { duration: -1 }),
      new Response(null, { status: 404 }),
    );
    const provider = new CloudflareStreamVideoProvider(CONFIG);
    expect(await provider.getStatus(UID)).toEqual({
      state: 'ready',
      durationSeconds: 12,
      byteSize: 4321,
    });
    expect(await provider.getStatus(UID)).toEqual({
      state: 'processing',
      durationSeconds: null,
      byteSize: null,
    });
    expect(await provider.getStatus(UID)).toBeNull();
    expect(spy.mock.calls[0]![0]).toBe(`${BASE}/${UID}`);
  });

  it('deletes, treating 404 as already gone', async () => {
    const spy = stubFetch(new Response(null, { status: 200 }), new Response(null, { status: 404 }));
    const provider = new CloudflareStreamVideoProvider(CONFIG);
    await provider.delete(UID);
    await provider.delete(UID);
    expect(spy.mock.calls[0]![1]?.method).toBe('DELETE');
  });

  it('throws with the status only, never the token or URL', async () => {
    stubFetch(
      new Response('upstream detail', { status: 500 }),
      new Response(null, { status: 500 }),
      new Response(null, { status: 500 }),
    );
    const provider = new CloudflareStreamVideoProvider(CONFIG);
    const errors = await Promise.all([
      provider
        .createUpload({ contentType: 'video/mp4', maxDurationSeconds: 1, expiresInSeconds: 120 })
        .catch((e: unknown) => e as Error),
      provider.getStatus(UID).catch((e: unknown) => e as Error),
      provider.delete(UID).catch((e: unknown) => e as Error),
    ]);
    expect(errors.map((e) => (e as Error).message)).toEqual([
      'Stream createUpload failed: 500',
      'Stream getStatus failed: 500',
      'Stream delete failed: 500',
    ]);
  });
});
