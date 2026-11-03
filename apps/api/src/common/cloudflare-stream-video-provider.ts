import { z } from 'zod';
import type { Env, STREAM_VARS } from './env.js';
import type {
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
  }),
});

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
    const res = await this.request(encodeURIComponent(uid), 'GET');
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Stream getStatus failed: ${res.status}`);
    const { result } = videoSchema.parse(await res.json());
    return {
      state: toState(result.status.state, result.readyToStream === true),
      durationSeconds: result.duration && result.duration > 0 ? Math.round(result.duration) : null,
      byteSize: result.size ?? null,
    };
  }

  async delete(uid: string): Promise<void> {
    const res = await this.request(encodeURIComponent(uid), 'DELETE');
    // The docs don't specify a missing uid's response; treat 404 as already gone.
    if (!res.ok && res.status !== 404) throw new Error(`Stream delete failed: ${res.status}`);
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

function toState(state: string, readyToStream: boolean): VideoState {
  if (state === 'pendingupload') return 'pending_upload';
  if (state === 'error') return 'error';
  if (state === 'ready' && readyToStream) return 'ready';
  // downloading, queued, inprogress (and ready before readyToStream).
  return 'processing';
}
