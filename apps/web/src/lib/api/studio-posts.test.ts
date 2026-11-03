import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ORIGIN } from './origin';
import { getMyPost, getMyPostMedia, getMyPosts } from './studio-posts';

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

const POST = {
  id: '0190a000-0000-7000-8000-000000000001',
  caption: 'Halo',
  visibility: 'FREE',
  status: 'DRAFT',
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('studio posts fetchers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cookieStore.value = undefined;
  });

  it('returns null without calling the API when there is no session cookie', async () => {
    const fetchMock = stubFetch(Response.json({ posts: [] }));
    expect(await getMyPosts()).toBeNull();
    expect(await getMyPost(POST.id)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only the session cookie, uncached', async () => {
    cookieStore.value = 'tok123';
    const fetchMock = stubFetch(Response.json({ posts: [POST] }));
    expect(await getMyPosts()).toEqual({ posts: [POST] });
    expect(fetchMock).toHaveBeenCalledWith(`${API_ORIGIN}/api/v1/creators/me/posts`, {
      headers: { cookie: 'influency_session=tok123' },
      cache: 'no-store',
    });
  });

  it('reads one post by id', async () => {
    cookieStore.value = 'tok123';
    const fetchMock = stubFetch(Response.json(POST));
    expect(await getMyPost(POST.id)).toEqual(POST);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ORIGIN}/api/v1/creators/me/posts/${POST.id}`,
      expect.anything(),
    );
  });

  it.each([401, 403])('getMyPosts returns null on %i', async (status) => {
    cookieStore.value = 'tok123';
    stubFetch(Response.json({}, { status }));
    expect(await getMyPosts()).toBeNull();
  });

  it.each([400, 401, 403, 404])('getMyPost returns null on %i', async (status) => {
    cookieStore.value = 'tok123';
    stubFetch(Response.json({}, { status }));
    expect(await getMyPost('x')).toBeNull();
  });

  it('throws on other failures', async () => {
    cookieStore.value = 'tok123';
    stubFetch(Response.json({}, { status: 500 }));
    await expect(getMyPosts()).rejects.toThrow('500');
  });

  it('reads the media of one post', async () => {
    cookieStore.value = 'tok123';
    const media = {
      id: '0190a000-0000-7000-8000-000000000002',
      kind: 'IMAGE',
      status: 'READY',
      contentType: 'image/png',
      byteSize: 10,
      createdAt: '2026-11-03T00:00:00.000Z',
    };
    const fetchMock = stubFetch(Response.json({ media: [media] }));
    expect(await getMyPostMedia(POST.id)).toEqual({ media: [media] });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ORIGIN}/api/v1/creators/me/posts/${POST.id}/media`,
      { headers: { cookie: 'influency_session=tok123' }, cache: 'no-store' },
    );
  });

  it.each([400, 401, 403, 404])('getMyPostMedia returns null on %i', async (status) => {
    cookieStore.value = 'tok123';
    stubFetch(Response.json({}, { status }));
    expect(await getMyPostMedia('x')).toBeNull();
  });

  it('getMyPostMedia throws on other failures and without a cookie skips the API', async () => {
    const fetchMock = stubFetch(Response.json({}, { status: 500 }));
    expect(await getMyPostMedia('x')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    cookieStore.value = 'tok123';
    await expect(getMyPostMedia('x')).rejects.toThrow('500');
  });
});
