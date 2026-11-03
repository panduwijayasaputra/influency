import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioPost } from '@influency/shared';
import { PostForm } from './post-form';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const apiError = (status: number, code: string, message: string, details: unknown = null) =>
  Response.json({ error: { code, message, requestId: 'req_1', details } }, { status });

const post: StudioPost = {
  id: '0190a000-0000-7000-8000-000000000001',
  caption: 'Halo',
  visibility: 'FREE',
  status: 'DRAFT',
  offer: null,
  publishedAt: null,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
};

describe('PostForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requires a visibility on create without calling the API', () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<PostForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Buat draf' }));
    expect(screen.getByText('Pilih Gratis atau Premium.')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a draft and opens its edit page', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        Response.json({ ...post, caption: 'Baru', visibility: 'PREMIUM' }, { status: 201 }),
      ),
    );
    render(<PostForm />);
    fireEvent.change(screen.getByLabelText('Caption (opsional)'), { target: { value: 'Baru' } });
    fireEvent.click(screen.getByLabelText('Premium'));
    fireEvent.click(screen.getByRole('button', { name: 'Buat draf' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/studio/posts/${post.id}`));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/creators/me/posts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caption: 'Baru', visibility: 'PREMIUM' }),
    });
    expect(screen.getByRole('button', { name: 'Menyimpan…' })).toBeDisabled();
  });

  it('edits an existing post with PATCH', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({ ...post, caption: 'Ubah' })));
    render(<PostForm post={post} />);
    expect(screen.getByLabelText('Gratis')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Caption (opsional)'), { target: { value: 'Ubah' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('Tersimpan.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/creators/me/posts/${post.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caption: 'Ubah', visibility: 'FREE' }),
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('shows API validation issues under the matching field', async () => {
    stubFetch(() =>
      Promise.resolve(
        apiError(400, 'VALIDATION_FAILED', 'Data yang dikirim tidak valid.', {
          issues: [{ path: 'caption', message: 'Caption maksimal 2000 karakter.' }],
        }),
      ),
    );
    render(<PostForm post={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Caption maksimal 2000 karakter.')).toBeVisible();
    expect(screen.getByLabelText('Caption (opsional)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows other API errors as a form message and re-enables the button', async () => {
    stubFetch(() => Promise.resolve(apiError(404, 'NOT_FOUND', 'Data tidak ditemukan.')));
    render(<PostForm post={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Data tidak ditemukan.');
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeEnabled();
  });

  it('locks the visibility of a live post but still saves its caption', async () => {
    const live: StudioPost = { ...post, status: 'PUBLISHED' };
    const fetchMock = stubFetch(() => Promise.resolve(Response.json(live)));
    render(<PostForm post={live} />);
    expect(screen.getByLabelText('Gratis')).toBeDisabled();
    expect(screen.getByLabelText('Premium')).toBeDisabled();
    expect(screen.getByText('Sembunyikan post dulu untuk mengubah jenis post.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Caption (opsional)'), { target: { value: 'Baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('Tersimpan.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/creators/me/posts/${post.id}`,
      expect.objectContaining({ body: JSON.stringify({ caption: 'Baru', visibility: 'FREE' }) }),
    );
  });
});
