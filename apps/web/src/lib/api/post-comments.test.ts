import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ORIGIN } from './origin';
import { getPostComments } from './post-comments';

const cookieStore = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'influency_session' && cookieStore.value
          ? { value: cookieStore.value }
          : undefined,
    }),
}));

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const PAGE = { items: [], nextCursor: null, canComment: false };

function stubFetch(response: Response) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getPostComments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cookieStore.value = undefined;
  });

  it('fetches uncached without a cookie when logged out', async () => {
    const fetchMock = stubFetch(Response.json(PAGE));
    expect(await getPostComments(POST_ID)).toEqual(PAGE);
    expect(fetchMock).toHaveBeenCalledWith(`${API_ORIGIN}/api/v1/posts/${POST_ID}/comments`, {
      headers: {},
      cache: 'no-store',
    });
  });

  it('forwards the session cookie when logged in', async () => {
    cookieStore.value = 'tok';
    const fetchMock = stubFetch(Response.json({ ...PAGE, canComment: true }));
    expect(await getPostComments(POST_ID)).toEqual({ ...PAGE, canComment: true });
    expect(fetchMock.mock.calls[0]![1]).toEqual({
      headers: { cookie: 'influency_session=tok' },
      cache: 'no-store',
    });
  });

  it("maps 403 to 'forbidden' and 404 to null", async () => {
    stubFetch(new Response(null, { status: 403 }));
    expect(await getPostComments(POST_ID)).toBe('forbidden');
    stubFetch(new Response(null, { status: 404 }));
    expect(await getPostComments(POST_ID)).toBeNull();
  });

  it('throws on other errors', async () => {
    stubFetch(new Response(null, { status: 500 }));
    await expect(getPostComments(POST_ID)).rejects.toThrow('500');
  });
});
