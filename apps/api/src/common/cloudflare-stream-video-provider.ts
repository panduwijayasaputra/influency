import { POST_IMAGE_MAX_BYTES } from '@influency/shared';
import { z } from 'zod';
import type { Env, STREAM_VARS } from './env.js';
import type {
  VideoPlayback,
  VideoProvider,
  VideoState,
  VideoStatus,
  VideoUpload,
  VideoUploadInput,
} from './video-provider.js';

type StreamConfig = Pick<Env, (typeof STREAM_VARS)[number]>;

const directUploadSchema = z.object({ result: z.object({ uid: z.string(), uploadURL: z.url() }) });
const videoSchema = z.object({
  result: z.object({
    readyToStream: z.boolean().nullish(),
    status: z.object({ state: z.string() }),
    // -1 while unknown.
    duration: z.number().nullish(),
    size: z.number().nullish(),
    // Full thumbnail URL on the account's customer-<code>.cloudflarestream.com host (not in the reviewed docs pages).
    thumbnail: z.url().nullish(),
  }),
});
const tokenSchema = z.object({ result: z.object({ token: z.string().min(1) }) });
/** Signed thumbnail tokens only need to outlive one fetch. */
const THUMBNAIL_TOKEN_TTL_SECONDS = 300;
const THUMBNAIL_TIMEOUT_MS = 10_000;

/**
 * Cloudflare Stream: direct creator uploads (basic POST, ≤ 200 MB) with signed playback required.
 * Errors carry the HTTP status only — never the token, upload URL or response body.
 */
export class CloudflareStreamVideoProvider implements VideoProvider {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: StreamConfig) {
    const { CLOUDFLARE_STREAM_ACCOUNT_ID, CLOUDFLARE_STREAM_TOKEN } = config;
    // parseEnv requires these when VIDEO_DRIVER=stream.
    if (!CLOUDFLARE_STREAM_ACCOUNT_ID || !CLOUDFLARE_STREAM_TOKEN) {
      throw new Error('Cloudflare Stream configuration missing');
    }
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_STREAM_ACCOUNT_ID)}/stream`;
    this.token = CLOUDFLARE_STREAM_TOKEN;
  }

  async createUpload(input: VideoUploadInput): Promise<VideoUpload> {
    const res = await this.request('direct_upload', 'POST', {
      maxDurationSeconds: input.maxDurationSeconds,
      expiry: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      requireSignedURLs: true,
    });
    if (!res.ok) throw new Error(`Stream createUpload failed: ${res.status}`);
    const { result } = directUploadSchema.parse(await res.json());
    return {
      uid: result.uid,
      upload: { url: result.uploadURL, method: 'POST', headers: {}, formField: 'file' },
    };
  }

  async getStatus(uid: string): Promise<VideoStatus | null> {
    const result = await this.details(uid);
    if (!result) return null;
    return {
      state: toState(result.status.state, result.readyToStream === true),
      durationSeconds: result.duration && result.duration > 0 ? Math.round(result.duration) : null,
      byteSize: result.size ?? null,
    };
  }

  /**
   * requireSignedURLs videos: mint a short-lived token (POST /stream/:uid/token, `exp` in unix seconds) and use it in
   * place of the uid on the customer host. Default frame is the first one (`time` 0s); `fit=clip` keeps the whole frame.
   */
  async getThumbnail(uid: string): Promise<Uint8Array | null> {
    const signed = await this.signed(uid, 'getThumbnail', {
      exp: expIn(THUMBNAIL_TOKEN_TTL_SECONDS),
    });
    if (!signed) return null;
    const res = await fetch(`${signed.base}/thumbnails/thumbnail.jpg?fit=clip`, {
      signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Stream getThumbnail failed: ${res.status}`);
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.length > POST_IMAGE_MAX_BYTES)
      throw new Error('Stream getThumbnail failed: too large');
    return body;
  }

  /** The Stream player page for a signed, non-downloadable token. */
  // shortcut: one details + one /token call per mint; switch to a local signing key (RS256) above ~10k tokens/day.
  async createPlaybackUrl(uid: string, expiresInSeconds: number): Promise<VideoPlayback | null> {
    const exp = expIn(expiresInSeconds);
    const signed = await this.signed(uid, 'createPlaybackUrl', { exp, downloadable: false });
    if (!signed) return null;
    return { url: `${signed.base}/iframe`, player: 'iframe', expiresAt: new Date(exp * 1000) };
  }

  async delete(uid: string): Promise<void> {
    const res = await this.request(encodeURIComponent(uid), 'DELETE');
    // The docs don't specify a missing uid's response; treat 404 as already gone.
    if (!res.ok && res.status !== 404) throw new Error(`Stream delete failed: ${res.status}`);
  }

  private async details(uid: string) {
    const res = await this.request(encodeURIComponent(uid), 'GET');
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Stream getStatus failed: ${res.status}`);
    return videoSchema.parse(await res.json()).result;
  }

  /**
   * Mints a token for a ready video and returns `<customer host>/<token>`; null while missing or not ready.
   * The customer host comes from the video's own thumbnail URL and must be https on cloudflarestream.com.
   */
  private async signed(
    uid: string,
    op: string,
    tokenBody: object,
  ): Promise<{ base: string } | null> {
    const result = await this.details(uid);
    if (!result || toState(result.status.state, result.readyToStream === true) !== 'ready') {
      return null;
    }
    if (!result.thumbnail) throw new Error(`Stream ${op} failed: no thumbnail host`);
    const origin = new URL(result.thumbnail);
    if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.cloudflarestream.com')) {
      throw new Error(`Stream ${op} failed: unexpected thumbnail host`);
    }
    const tokenRes = await this.request(`${encodeURIComponent(uid)}/token`, 'POST', tokenBody);
    if (!tokenRes.ok) throw new Error(`Stream token failed: ${tokenRes.status}`);
    const { token } = tokenSchema.parse(await tokenRes.json()).result;
    return { base: `${origin.origin}/${encodeURIComponent(token)}` };
  }

  private request(path: string, method: string, body?: object): Promise<Response> {
    return fetch(`${this.baseUrl}/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body && { 'content-type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
    });
  }
}

/** Token `exp` in unix seconds. */
const expIn = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

function toState(state: string, readyToStream: boolean): VideoState {
  if (state === 'pendingupload') return 'pending_upload';
  if (state === 'error') return 'error';
  if (state === 'ready' && readyToStream) return 'ready';
  // downloading, queued, inprogress (and ready before readyToStream).
  return 'processing';
}
