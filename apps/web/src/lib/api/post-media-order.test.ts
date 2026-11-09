import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveMediaOrder } from './post-media-order';

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const media = (n: number) => ({
  id: `0190a000-0000-7000-8000-00000000010${n}`,
  kind: 'IMAGE',
  status: 'READY',
  contentType: 'image/png',
  byteSize: 10,
  durationSeconds: null,
  rejectionReason: null,
  createdAt: '2026-11-03T00:00:00.000Z',
});

afterEach(() => vi.unstubAllGlobals());

describe('saveMediaOrder', () => {
  it('PUTs the ids in order and parses the saved list', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ media: [media(2), media(1)] })));
    vi.stubGlobal('fetch', fetchMock);
    const saved = await saveMediaOrder(POST_ID, [media(2).id, media(1).id]);
    expect(saved.media.map((m) => m.id)).toEqual([media(2).id, media(1).id]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/creators/me/posts/${POST_ID}/media/order`);
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ mediaIds: [media(2).id, media(1).id] });
  });

  it('rejects with the API error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { error: { code: 'POST_LOCKED', message: 'Terkunci.', requestId: 'r', details: null } },
            { status: 409 },
          ),
        ),
      ),
    );
    await expect(saveMediaOrder(POST_ID, [media(1).id])).rejects.toMatchObject({
      code: 'POST_LOCKED',
    });
  });
});
