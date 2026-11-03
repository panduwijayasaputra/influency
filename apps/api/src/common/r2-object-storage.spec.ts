import { afterEach, describe, expect, it, vi } from 'vitest';
import { R2ObjectStorage } from './r2-object-storage.js';

const CONFIG = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'AKIDEXAMPLE',
  R2_SECRET_ACCESS_KEY: 'r2-s3cret',
  R2_BUCKET: 'media',
};
const KEY = 'post-media/0190a000-0000-7000-8000-0000001d0f01';

describe('R2ObjectStorage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requires the R2 configuration', () => {
    expect(() => new R2ObjectStorage({ ...CONFIG, R2_BUCKET: undefined })).toThrow(
      'R2 configuration missing',
    );
  });

  it('puts with SigV4 auth and the content type to the bucket URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await new R2ObjectStorage(CONFIG).put(KEY, new Uint8Array([1, 2]), 'image/png');
    const request = (fetchSpy.mock.calls[0] as [Request])[0];
    expect(request.method).toBe('PUT');
    expect(request.url).toBe(`https://acct123.r2.cloudflarestorage.com/media/${KEY}`);
    expect(request.headers.get('content-type')).toBe('image/png');
    expect(request.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it('encodes each key segment', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
    await new R2ObjectStorage(CONFIG).get('profile-images/a b');
    expect((fetchSpy.mock.calls[0] as [Request])[0].url).toBe(
      'https://acct123.r2.cloudflarestorage.com/media/profile-images/a%20b',
    );
  });

  it('gets bytes and content type, 404 → null', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([7, 8]), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
    const storage = new R2ObjectStorage(CONFIG);
    expect(await storage.get(KEY)).toEqual({
      body: new Uint8Array([7, 8]),
      contentType: 'image/webp',
    });
    expect(await storage.get(KEY)).toBeNull();
  });

  it('treats a 404 delete as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(new R2ObjectStorage(CONFIG).delete(KEY)).resolves.toBeUndefined();
  });

  it('throws on a failed put without leaking the URL or signature', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const error = await new R2ObjectStorage(CONFIG)
      .put(KEY, new Uint8Array([1]), 'image/png')
      .catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('R2 put failed: 500');
  });

  it('presigns a PUT with expiry and signed content-type without a network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const upload = await new R2ObjectStorage(CONFIG).createUploadUrl(KEY, 'image/png', 300);
    const url = new URL(upload.url);
    expect(url.host).toBe('acct123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/media/${KEY}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain('content-type');
    expect(upload.url).not.toContain('r2-s3cret');
    expect(upload.headers).toEqual({ 'content-type': 'image/png' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps HEAD responses to size and type, 404 to null, and errors to the status only', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-length': '1234', 'content-type': 'image/png' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchSpy);
    const storage = new R2ObjectStorage(CONFIG);

    expect(await storage.head(KEY)).toEqual({ size: 1234, contentType: 'image/png' });
    expect(await storage.head(KEY)).toBeNull();
    await expect(storage.head(KEY)).rejects.toThrow(/^R2 head failed: 403$/);
    expect((fetchSpy.mock.calls[0] as [Request])[0].method).toBe('HEAD');
  });
});
