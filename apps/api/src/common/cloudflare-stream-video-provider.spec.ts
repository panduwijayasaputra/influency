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

describe('CloudflareStreamVideoProvider.getThumbnail', () => {
  const HOST = 'https://customer-abc123.cloudflarestream.com';
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const ready = (thumbnail: string | undefined = `${HOST}/${UID}/thumbnails/thumbnail.jpg`) =>
    video('ready', { readyToStream: true, ...(thumbnail && { thumbnail }) });
  const token = () => Response.json({ success: true, result: { token: 'signed.tok.en' } });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('mints a short-lived token and fetches the default frame on the customer host', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T00:00:00.000Z') });
    const spy = stubFetch(ready(), token(), new Response(JPEG));
    const bytes = await new CloudflareStreamVideoProvider(CONFIG).getThumbnail(UID);
    expect(bytes).toEqual(JPEG);
    expect(spy.mock.calls[0]![0]).toBe(`${BASE}/${UID}`);
    const [tokenUrl, tokenInit] = spy.mock.calls[1]!;
    expect(tokenUrl).toBe(`${BASE}/${UID}/token`);
    expect(tokenInit?.method).toBe('POST');
    expect(JSON.parse(tokenInit?.body as string)).toEqual({
      exp: Date.parse('2026-11-04T00:05:00.000Z') / 1000,
    });
    const [thumbUrl, thumbInit] = spy.mock.calls[2]!;
    expect(thumbUrl).toBe(`${HOST}/signed.tok.en/thumbnails/thumbnail.jpg?fit=clip`);
    // The account token never goes to the delivery host.
    expect(thumbInit?.headers).toBeUndefined();
  });

  it('is null for a missing or unfinished video, without minting a token', async () => {
    const provider = new CloudflareStreamVideoProvider(CONFIG);
    let spy = stubFetch(new Response(null, { status: 404 }));
    expect(await provider.getThumbnail(UID)).toBeNull();
    spy = stubFetch(video('inprogress'));
    expect(await provider.getThumbnail(UID)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reports a failed thumbnail fetch by status only', async () => {
    stubFetch(ready(), token(), new Response('denied signed.tok.en', { status: 403 }));
    const err = (await new CloudflareStreamVideoProvider(CONFIG)
      .getThumbnail(UID)
      .catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('Stream getThumbnail failed: 403');
    expect(err.message).not.toContain('signed.tok.en');
  });

  it('rejects an oversized thumbnail', async () => {
    stubFetch(ready(), token(), new Response(new Uint8Array(10 * 1024 * 1024 + 1)));
    await expect(new CloudflareStreamVideoProvider(CONFIG).getThumbnail(UID)).rejects.toThrow(
      'too large',
    );
  });

  it('mints a non-downloadable playback token and returns the iframe player URL', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T00:00:00.000Z') });
    const spy = stubFetch(ready(), token());
    const playback = await new CloudflareStreamVideoProvider(CONFIG).createPlaybackUrl(UID, 1800);
    expect(playback).toEqual({
      url: `${HOST}/signed.tok.en/iframe`,
      player: 'iframe',
      expiresAt: new Date('2026-11-04T00:30:00.000Z'),
    });
    const [tokenUrl, tokenInit] = spy.mock.calls[1]!;
    expect(tokenUrl).toBe(`${BASE}/${UID}/token`);
    expect(JSON.parse(tokenInit?.body as string)).toEqual({
      exp: Date.parse('2026-11-04T00:30:00.000Z') / 1000,
      downloadable: false,
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('has no playback for a missing or unfinished video; token errors carry the status only', async () => {
    const provider = new CloudflareStreamVideoProvider(CONFIG);
    stubFetch(new Response(null, { status: 404 }));
    expect(await provider.createPlaybackUrl(UID, 1800)).toBeNull();
    stubFetch(video('inprogress'));
    expect(await provider.createPlaybackUrl(UID, 1800)).toBeNull();
    stubFetch(ready(), new Response('nope test-token', { status: 500 }));
    const err = (await provider.createPlaybackUrl(UID, 1800).catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('Stream token failed: 500');
  });

  it.each([
    ['a foreign host', 'https://evil.example.com/x/thumbnails/thumbnail.jpg'],
    ['plain http', 'http://customer-abc123.cloudflarestream.com/x/thumbnails/thumbnail.jpg'],
    ['no thumbnail field', undefined],
  ])('refuses %s without minting a token', async (_name, thumbnail) => {
    const spy = stubFetch(thumbnail ? ready(thumbnail) : video('ready', { readyToStream: true }));
    await expect(new CloudflareStreamVideoProvider(CONFIG).getThumbnail(UID)).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
