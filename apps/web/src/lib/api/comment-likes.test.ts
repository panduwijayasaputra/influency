import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCommentLike } from './comment-likes';

const URL = '/api/v1/posts/p1/comments/c1/likes';
afterEach(() => vi.unstubAllGlobals());

function stub(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('setCommentLike', () => {
  it('POSTs a like and DELETEs an unlike, returning the parsed result', async () => {
    const fetchMock = stub(() => Promise.resolve(Response.json({ liked: true, likeCount: 4 })));
    expect(await setCommentLike('p1', 'c1', true)).toEqual({ liked: true, likeCount: 4 });
    expect(fetchMock).toHaveBeenLastCalledWith(URL, { method: 'POST' });
    await setCommentLike('p1', 'c1', false);
    expect(fetchMock).toHaveBeenLastCalledWith(URL, { method: 'DELETE' });
  });

  it('returns null on a 404, a 500, a network error and a malformed body', async () => {
    stub(() => Promise.resolve(new Response(null, { status: 404 })));
    expect(await setCommentLike('p1', 'c1', true)).toBeNull();
    stub(() => Promise.resolve(new Response(null, { status: 500 })));
    expect(await setCommentLike('p1', 'c1', true)).toBeNull();
    stub(() => Promise.reject(new Error('offline')));
    expect(await setCommentLike('p1', 'c1', true)).toBeNull();
    stub(() => Promise.resolve(Response.json({ liked: 'x' })));
    expect(await setCommentLike('p1', 'c1', true)).toBeNull();
  });
});
