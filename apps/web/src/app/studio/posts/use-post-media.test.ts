import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST_MEDIA_MAX_PER_POST, type StudioMedia } from '@influency/shared';
import { activeMediaCount, usePostMedia } from './use-post-media';

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const BASE = `/api/v1/creators/me/posts/${POST_ID}/media`;
const item = (n: number, over: Partial<StudioMedia> = {}): StudioMedia => ({
  id: `0190a000-0000-7000-8000-00000000010${n}`,
  kind: 'IMAGE',
  status: 'READY',
  contentType: 'image/png',
  byteSize: 10,
  durationSeconds: null,
  rejectionReason: null,
  createdAt: '2026-11-03T00:00:00.000Z',
  ...over,
});
const slot = (media: StudioMedia, method: 'PUT' | 'POST' = 'PUT') =>
  Response.json(
    {
      media: { ...media, status: 'PENDING_UPLOAD' },
      upload: {
        url: 'https://acct.r2.cloudflarestorage.com/media/post-media/x?X-Amz-Signature=s',
        method,
        headers: { 'content-type': media.contentType },
        formField: method === 'POST' ? 'file' : undefined,
        expiresAt: '2026-11-03T00:05:00.000Z',
      },
    },
    { status: 201 },
  );
const apiError = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message, requestId: 'req_1', details: null } }, { status });

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn((..._args: unknown[]) =>
    Promise.resolve(responses.shift() ?? new Response()),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const png = (size = 10) => new File([new Uint8Array(size)], 'a.png', { type: 'image/png' });
const setup = (initial: StudioMedia[] = [], locked = false) => {
  const getPostId = vi.fn(() => Promise.resolve(POST_ID));
  const hook = renderHook(() => usePostMedia({ getPostId, initial, locked }));
  return { getPostId, ...hook };
};

describe('usePostMedia', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('counts only items that did not fail', () => {
    expect(activeMediaCount([item(1), item(2, { status: 'REJECTED' })])).toBe(1);
  });

  it('uploads through slot → storage → complete and appends the finished item', async () => {
    const fetchMock = stubFetch(
      slot(item(1)),
      new Response(null, { status: 200 }),
      Response.json(item(1)),
    );
    const { result } = setup();
    await act(() => result.current.add(png()));
    expect(result.current.items).toEqual([item(1)]);
    expect(result.current.error).toBeUndefined();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      BASE,
      expect.stringContaining('r2.cloudflarestorage.com'),
      `${BASE}/${item(1).id}/complete`,
    ]);
  });

  it('uploads a video to a provider POST target as multipart', async () => {
    const video = item(1, { kind: 'VIDEO', contentType: 'video/mp4' });
    const fetchMock = stubFetch(
      slot(video, 'POST'),
      new Response(null, { status: 200 }),
      Response.json({ ...video, status: 'PROCESSING' }),
    );
    const { result } = setup();
    await act(() =>
      result.current.add(new File([new Uint8Array(10)], 'v.mp4', { type: 'video/mp4' })),
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(result.current.items[0]?.status).toBe('PROCESSING');
  });

  it('asks for the post id once per add (the editor creates the draft only the first time)', async () => {
    stubFetch(slot(item(1)), new Response(), Response.json(item(1)));
    const { result, getPostId } = setup();
    await act(() => result.current.add(png()));
    expect(getPostId).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported type or size before calling anything', async () => {
    const fetchMock = stubFetch();
    const { result, getPostId } = setup();
    await act(() => result.current.add(new File(['x'], 'a.gif', { type: 'image/gif' })));
    expect(result.current.error).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getPostId).not.toHaveBeenCalled();
  });

  it('refuses a new item at the limit without calling anything', async () => {
    const fetchMock = stubFetch();
    const full = Array.from({ length: POST_MEDIA_MAX_PER_POST }, (_, i) => item(i % 10));
    const { result } = setup(full);
    await act(() => result.current.add(png()));
    expect(result.current.error).toBe(
      `Maksimal ${POST_MEDIA_MAX_PER_POST} foto atau video per post.`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the API message when the slot is refused and adds nothing', async () => {
    stubFetch(apiError(409, 'MEDIA_LIMIT_REACHED', 'Batas jumlah media per post sudah tercapai.'));
    const { result } = setup();
    await act(() => result.current.add(png()));
    expect(result.current.error).toBe('Batas jumlah media per post sudah tercapai.');
    expect(result.current.items).toEqual([]);
  });

  it('marks the item failed (and removable) when the storage upload fails', async () => {
    stubFetch(slot(item(1)), new Response(null, { status: 403 }));
    const { result } = setup();
    await act(() => result.current.add(png()));
    expect(result.current.items[0]?.status).toBe('REJECTED');
    expect(result.current.error).toBe('Gagal mengunggah. Coba lagi.');
    expect(activeMediaCount(result.current.items)).toBe(0);
  });

  it('marks the item failed with the API message when completing is refused', async () => {
    stubFetch(
      slot(item(1)),
      new Response(null, { status: 200 }),
      apiError(415, 'UNSUPPORTED_FILE_TYPE', 'Format file tidak didukung.'),
    );
    const { result } = setup();
    await act(() => result.current.add(png()));
    expect(result.current.items[0]?.status).toBe('REJECTED');
    expect(result.current.error).toBe('Format file tidak didukung.');
  });

  it('moves items and ignores out-of-range moves', () => {
    const { result } = setup([item(1), item(2), item(3)]);
    act(() => result.current.move(0, 2));
    expect(result.current.items.map((m) => m.id)).toEqual([item(2).id, item(3).id, item(1).id]);
    act(() => result.current.move(0, -1));
    act(() => result.current.move(2, 3));
    expect(result.current.items.map((m) => m.id)).toEqual([item(2).id, item(3).id, item(1).id]);
  });

  it('removes an item after the API deletes it', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    const { result } = renderHook(() =>
      usePostMedia({
        getPostId: () => Promise.resolve(POST_ID),
        initialPostId: POST_ID,
        initial: [item(1), item(2)],
        locked: false,
      }),
    );
    await act(() => result.current.remove(item(1).id));
    expect(result.current.items.map((m) => m.id)).toEqual([item(2).id]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/${item(1).id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('keeps the item and shows the error when deleting fails', async () => {
    stubFetch(apiError(409, 'POST_LOCKED', 'Post sudah terbit.'));
    const { result } = renderHook(() =>
      usePostMedia({
        getPostId: () => Promise.resolve(POST_ID),
        initialPostId: POST_ID,
        initial: [item(1)],
        locked: false,
      }),
    );
    await act(() => result.current.remove(item(1).id));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toBe('Post sudah terbit.');
  });

  describe('locked (live post)', () => {
    it('cannot add, move or remove a ready item', async () => {
      const fetchMock = stubFetch();
      const { result } = renderHook(() =>
        usePostMedia({
          getPostId: () => Promise.resolve(POST_ID),
          initialPostId: POST_ID,
          initial: [item(1), item(2)],
          locked: true,
        }),
      );
      await act(() => result.current.add(png()));
      act(() => result.current.move(0, 1));
      await act(() => result.current.remove(item(1).id));
      expect(result.current.items.map((m) => m.id)).toEqual([item(1).id, item(2).id]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('can still remove a failed item', async () => {
      stubFetch(new Response(null, { status: 204 }));
      const { result } = renderHook(() =>
        usePostMedia({
          getPostId: () => Promise.resolve(POST_ID),
          initialPostId: POST_ID,
          initial: [item(1), item(2, { status: 'REJECTED' })],
          locked: true,
        }),
      );
      await act(() => result.current.remove(item(2).id));
      expect(result.current.items.map((m) => m.id)).toEqual([item(1).id]);
    });
  });

  it('re-checks a processing video and keeps the local order', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const processing = item(2, { kind: 'VIDEO', contentType: 'video/mp4', status: 'PROCESSING' });
    stubFetch(
      Response.json({
        media: [item(1), { ...processing, status: 'READY', durationSeconds: 12 }],
      }),
    );
    const { result } = renderHook(() =>
      usePostMedia({
        getPostId: () => Promise.resolve(POST_ID),
        initialPostId: POST_ID,
        initial: [processing, item(1)],
        locked: false,
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    await waitFor(() => expect(result.current.items[0]?.status).toBe('READY'));
    // Server order is item 1 first, but the creator's order (video first) is kept.
    expect(result.current.items.map((m) => m.id)).toEqual([item(2).id, item(1).id]);
    expect(result.current.items[0]?.durationSeconds).toBe(12);
  });
});
