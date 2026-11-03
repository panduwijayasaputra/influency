import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST_MEDIA_MAX_PER_POST, type StudioMedia } from '@influency/shared';
import { PostImages } from './post-images';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const BASE = `/api/v1/creators/me/posts/${POST_ID}/media`;
const item = (n: number): StudioMedia => ({
  id: `0190a000-0000-7000-8000-00000000010${n}`,
  kind: 'IMAGE',
  status: 'READY',
  contentType: 'image/png',
  byteSize: 10,
  createdAt: '2026-11-03T00:00:00.000Z',
});
const slotResponse = () =>
  Response.json(
    {
      media: { ...item(9), status: 'PENDING_UPLOAD' },
      upload: {
        url: 'https://acct.r2.cloudflarestorage.com/media/post-media/x?X-Amz-Signature=s',
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
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

const choose = (file: File) =>
  fireEvent.change(screen.getByLabelText('Tambah gambar'), { target: { files: [file] } });
const png = (size = 10) => new File([new Uint8Array(size)], 'a.png', { type: 'image/png' });

describe('PostImages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders each image from the owner-only content URL with a numbered alt', () => {
    render(<PostImages postId={POST_ID} media={[item(1), item(2)]} />);
    expect(screen.getByAltText('Gambar 1')).toHaveAttribute('src', `${BASE}/${item(1).id}/content`);
    expect(screen.getByAltText('Gambar 2')).toBeVisible();
    expect(screen.getByText(/2\/10/)).toBeVisible();
  });

  it.each([
    [
      new File(['GIF89a'], 'a.gif', { type: 'image/gif' }),
      'Format gambar harus JPEG, PNG, atau WebP.',
    ],
    [png(11 * 1024 * 1024), 'Ukuran gambar maksimal 10 MB.'],
  ])('rejects %s before calling the API', (file, message) => {
    const fetchMock = stubFetch();
    render(<PostImages postId={POST_ID} media={[]} />);
    choose(file);
    expect(screen.getByText(message)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests a slot, PUTs the file to the presigned URL, completes, then refreshes', async () => {
    const fetchMock = stubFetch(
      slotResponse(),
      new Response(null, { status: 200 }),
      Response.json(item(9)),
    );
    render(<PostImages postId={POST_ID} media={[]} />);
    const file = png();
    choose(file);
    expect(screen.getByLabelText('Tambah gambar')).toBeDisabled();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());

    expect(fetchMock.mock.calls).toEqual([
      [
        BASE,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contentType: 'image/png', byteSize: 10 }),
        },
      ],
      [
        'https://acct.r2.cloudflarestorage.com/media/post-media/x?X-Amz-Signature=s',
        { method: 'PUT', headers: { 'content-type': 'image/png' }, body: file },
      ],
      [`${BASE}/${item(9).id}/complete`, { method: 'POST', credentials: 'include' }],
    ]);
    expect(screen.getByLabelText('Tambah gambar')).toBeEnabled();
  });

  it('shows the API message when the slot is refused', async () => {
    stubFetch(apiError(409, 'MEDIA_LIMIT_REACHED', 'Batas jumlah media per post sudah tercapai.'));
    render(<PostImages postId={POST_ID} media={[]} />);
    choose(png());
    expect(await screen.findByText('Batas jumlah media per post sudah tercapai.')).toBeVisible();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('skips complete when the storage PUT fails', async () => {
    const fetchMock = stubFetch(slotResponse(), new Response(null, { status: 403 }));
    render(<PostImages postId={POST_ID} media={[]} />);
    choose(png());
    expect(await screen.findByText('Gagal mengunggah. Coba lagi.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the byte-check error from complete', async () => {
    stubFetch(
      slotResponse(),
      new Response(null, { status: 200 }),
      apiError(
        415,
        'UNSUPPORTED_FILE_TYPE',
        'Format file tidak didukung. Gunakan JPG, PNG, atau WebP.',
      ),
    );
    render(<PostImages postId={POST_ID} media={[]} />);
    choose(png());
    expect(
      await screen.findByText('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.'),
    ).toBeVisible();
  });

  it('disables the input at the per-post limit', () => {
    const media = Array.from({ length: POST_MEDIA_MAX_PER_POST }, (_, i) => ({
      ...item(0),
      id: `id-${i}`,
    }));
    render(<PostImages postId={POST_ID} media={media} />);
    expect(screen.getByLabelText('Tambah gambar')).toBeDisabled();
  });

  it('deletes an image and refreshes', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    render(<PostImages postId={POST_ID} media={[item(1)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus gambar 1' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/${item(1).id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  });
});
