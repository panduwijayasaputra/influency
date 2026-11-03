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

  it('shows the API message when publishing is refused', async () => {
    stubFetch(
      Response.json(
        {
          error: {
            code: 'OFFER_REQUIRED',
            message: 'Atur harga sebelum mempublikasikan post Premium.',
            requestId: 'req_1',
            details: null,
          },
        },
        { status: 409 },
      ),
    );
    render(<PostStatusActions post={post('HIDDEN')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Atur harga sebelum mempublikasikan post Premium.',
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('hides a published post', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));
    render(<PostStatusActions post={post('PUBLISHED')} />);
    expect(screen.getByText('Post tampil di halaman publik Anda.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/hide$/), expect.anything());
  });

  it('explains a post waiting for review', () => {
    render(<PostStatusActions post={post('PENDING_REVIEW')} />);
    expect(screen.getByText('Menunggu tinjauan admin sebelum tampil.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sembunyikan' })).toBeVisible();
  });

  it('offers nothing for a removed post', () => {
    render(<PostStatusActions post={post('REMOVED')} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
