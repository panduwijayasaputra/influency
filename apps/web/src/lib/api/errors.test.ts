import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, postJson } from './errors';

afterEach(() => vi.unstubAllGlobals());

const schema = { parse: (d: unknown) => d as { ok: boolean } };

describe('postJson', () => {
  it('sends the Idempotency-Key and parses the answer', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    const out = await postJson('/x', schema, { body: { a: 1 }, idempotencyKey: 'key-12345678' });
    expect(out).toEqual({ ok: true });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'key-12345678' });
    expect(init.body).toBe('{"a":1}');
  });

  it('maps an error body to ApiError with code and details', async () => {
    const error = {
      code: 'INSUFFICIENT_COINS',
      message: 'm',
      requestId: 'r',
      details: { required: 5, available: 3 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error }, { status: 402 }))),
    );
    await expect(postJson('/x', schema)).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
      details: { required: 5, available: 3 },
    });
    expect(new ApiError('A', 'b').details).toBeNull();
  });
});
