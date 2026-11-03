import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST_COVER_MAX_BYTES } from '@influency/shared';
import { PostCover } from './post-cover';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const BASE = `/api/v1/creators/me/posts/${POST_ID}/cover`;
const COVER = { mediaId: null, previewUrl: `${BASE}/preview?v=abc` };

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn((..._args: unknown[]) =>
    Promise.resolve(responses.shift() ?? new Response()),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const choose = (file: File) =>
  fireEvent.change(screen.getByLabelText('Unggah sampul'), { target: { files: [file] } });
const sized = (size: number, type = 'image/png') =>
  Object.defineProperty(new File([new Uint8Array(10)], 'c.png', { type }), 'size', {
    value: size,
  });

describe('PostCover', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    router.refresh.mockClear();
  });

  it('shows the generated preview', () => {
    render(<PostCover postId={POST_ID} cover={COVER} />);
    expect(screen.getByRole('img', { name: 'Pratinjau sampul' })).toHaveAttribute(
      'src',
      COVER.previewUrl,
    );
    expect(screen.getByRole('button', { name: 'Hapus sampul' })).toBeInTheDocument();
  });

  it('explains the locked placeholder without a cover', () => {
    render(<PostCover postId={POST_ID} cover={null} />);
    expect(screen.getByText(/Pengunjung melihat gambar terkunci/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hapus sampul' })).not.toBeInTheDocument();
  });

  it('PUTs the raw file with its type, then refreshes', async () => {
    const fetchMock = stubFetch(Response.json({}));
    render(<PostCover postId={POST_ID} cover={null} />);
    const file = sized(100);
    choose(file);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/image`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file,
      credentials: 'include',
    });
    expect(screen.getByText('Sampul diperbarui.')).toBeInTheDocument();
  });

  it.each([
    ['an oversized file', sized(POST_COVER_MAX_BYTES + 1), 'Ukuran sampul maksimal 5 MB.'],
    ['a GIF', sized(10, 'image/gif'), 'Format file tidak didukung. Gunakan JPG, PNG, atau WebP.'],
  ])('blocks %s before uploading', (_name, file, message) => {
    const fetchMock = stubFetch();
    render(<PostCover postId={POST_ID} cover={null} />);
    choose(file);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the API error message', async () => {
    stubFetch(
      Response.json(
        {
          error: {
            code: 'COVER_REQUIRES_PREMIUM',
            message: 'Sampul hanya bisa diatur untuk post Premium.',
            requestId: 'req_1',
            details: null,
          },
        },
        { status: 409 },
      ),
    );
    render(<PostCover postId={POST_ID} cover={null} />);
    choose(sized(10));
    expect(
      await screen.findByText('Sampul hanya bisa diatur untuk post Premium.'),
    ).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('Hapus sampul sends DELETE', async () => {
    const fetchMock = stubFetch(Response.json({}));
    render(<PostCover postId={POST_ID} cover={COVER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus sampul' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(BASE, { method: 'DELETE', credentials: 'include' });
  });
});
