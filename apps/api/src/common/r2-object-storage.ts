import { AwsClient } from 'aws4fetch';
import type { Env, R2_VARS } from './env.js';
import type {
  DownloadUrl,
  ObjectHead,
  ObjectStorage,
  StoredObject,
  UploadUrl,
} from './object-storage.js';

type R2Config = Pick<Env, (typeof R2_VARS)[number]>;

/**
 * Cloudflare R2 through its S3 API (SigV4 via aws4fetch). The bucket stays private.
 * Errors carry the HTTP status only: request URLs and headers hold signatures.
 */
// shortcut: get() buffers whole objects (profile images ≤5 MiB; post images are size-checked with head() first); the stub video driver reads videos once in dev; Stream holds real video.
export class R2ObjectStorage implements ObjectStorage {
  private readonly client: AwsClient;
  private readonly baseUrl: string;

  constructor(config: R2Config) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = config;
    // parseEnv requires these when STORAGE_DRIVER=r2.
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
      throw new Error('R2 configuration missing');
    }
    this.client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
      // Default is 10 retries with backoff on 5xx/429; keep request latency bounded.
      retries: 2,
    });
    this.baseUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeURIComponent(R2_BUCKET)}/`;
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body,
      headers: { 'content-type': contentType },
    });
    if (!res.ok) throw new Error(`R2 put failed: ${res.status}`);
  }

  async get(key: string): Promise<StoredObject | null> {
    const res = await this.client.fetch(this.url(key), { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 get failed: ${res.status}`);
    return {
      body: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    const res = await this.client.fetch(this.url(key), { method: 'HEAD' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 head failed: ${res.status}`);
    return {
      size: Number(res.headers.get('content-length') ?? 0),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: ${res.status}`);
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<UploadUrl> {
    const url = new URL(this.url(key));
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
    const headers = { 'content-type': contentType };
    // Query signing (presigned URL); allHeaders puts content-type into the signature.
    const signed = await this.client.sign(url.toString(), {
      method: 'PUT',
      headers,
      aws: { signQuery: true, allHeaders: true },
    });
    return { url: signed.url, headers, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  }

  async createDownloadUrl(key: string, expiresInSeconds: number): Promise<DownloadUrl> {
    const url = new URL(this.url(key));
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
    const signed = await this.client.sign(url.toString(), {
      method: 'GET',
      aws: { signQuery: true },
    });
    return { url: signed.url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  }

  private url(key: string): string {
    return this.baseUrl + key.split('/').map(encodeURIComponent).join('/');
  }
}
