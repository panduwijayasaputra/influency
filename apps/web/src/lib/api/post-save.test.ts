import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSaved } from './post-save';

afterEach(() => vi.unstubAllGlobals());

describe('setSaved', () => {
  it('PUTs a save and DELETEs an unsave, returning the server state', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ saved: true })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await setSaved('p1', true)).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/posts/p1/save', { method: 'PUT' });
    fetchMock.mockResolvedValueOnce(Response.json({ saved: false }));
    expect(await setSaved('p1', false)).toBe(false);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/posts/p1/save', { method: 'DELETE' });
  });

  it('returns null on an error status, a network error and a malformed body', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 500 })));
    expect(await setSaved('p1', true)).toBeNull();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    expect(await setSaved('p1', true)).toBeNull();
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ saved: 'x' })));
    expect(await setSaved('p1', true)).toBeNull();
  });
});
