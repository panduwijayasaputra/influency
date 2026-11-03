import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioPost } from '@influency/shared';
import { PostStatusActions } from './post-status-actions';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function stubFetch(response: Response) {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const post = (status: StudioPost['status']): StudioPost => ({
  id: '0190a000-0000-7000-8000-000000000001',
  caption: 'Halo',
  visibility: 'PREMIUM',
  status,
  offer: null,
  cover: null,
  publishedAt: null,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
});

describe('PostStatusActions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('publishes a draft and refreshes the page', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));
    render(<PostStatusActions post={post('DRAFT')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/creators/me/posts/0190a000-0000-7000-8000-000000000001/publish',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('shows the API message when an action is refused', async () => {
    stubFetch(
      Response.json(
        {
          error: {
            code: 'POST_STATUS_CONFLICT',
            message: 'Status post tidak memungkinkan tindakan ini.',
            requestId: 'req_1',
            details: null,
          },
        },
        { status: 409 },
      ),
    );
    render(<PostStatusActions post={post('ARCHIVED')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pulihkan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Status post tidak memungkinkan tindakan ini.',
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('archives a published post', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));
    render(<PostStatusActions post={post('PUBLISHED')} />);
    expect(screen.getByText('Post tampil di halaman publik Anda.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Arsipkan' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/archive$/), expect.anything());
  });

  it('restores an archived post', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));
    render(<PostStatusActions post={post('ARCHIVED')} />);
    expect(screen.getByText(/Post diarsipkan: tidak tampil di halaman publik/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pulihkan' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/restore$/), expect.anything());
  });

  it('explains a post under admin review (or hold) without an action', () => {
    render(<PostStatusActions post={post('PENDING_REVIEW')} />);
    expect(screen.getByText('Sedang ditinjau admin; tidak terlihat publik.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('explains a removed post and offers nothing', () => {
    render(<PostStatusActions post={post('REMOVED')} />);
    expect(
      screen.getByText('Dihapus oleh admin karena melanggar aturan. Tidak terlihat publik.'),
    ).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
