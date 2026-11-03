import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostOffer } from '@influency/shared';
import { PostOfferForm } from './post-offer-form';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const offer: PostOffer = {
  version: 2,
  priceCoins: 5,
  createdAt: '2026-11-03T00:00:00.000Z',
};

function fill(price: string) {
  fireEvent.change(screen.getByLabelText('Harga (Koin)'), { target: { value: price } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan harga' }));
}

describe('PostOfferForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('asks for a price when there is no offer yet', () => {
    render(<PostOfferForm postId={POST_ID} offer={null} />);
    expect(screen.getByText(/Belum ada harga/)).toBeVisible();
    expect(screen.getByLabelText('Harga (Koin)')).toHaveValue(null);
    // Unlocks are permanent: there is no access-duration input.
    expect(screen.queryByLabelText(/durasi/i)).toBeNull();
  });

  it('shows and prefills the current version', () => {
    render(<PostOfferForm postId={POST_ID} offer={offer} />);
    expect(screen.getByText('Versi 2: 5 Koin · akses permanen')).toBeVisible();
    expect(screen.getByLabelText('Harga (Koin)')).toHaveValue(5);
    expect(screen.getByText(/Pembeli mendapat akses permanen/)).toBeVisible();
    expect(screen.getByText(/hanya berlaku untuk pembelian berikutnya/)).toBeVisible();
  });

  it.each([
    ['4', 'Harga minimal 5 Koin.'],
    ['', 'Harga minimal 5 Koin.'],
    ['1001', 'Harga maksimal 1000 Koin.'],
    ['2.5', 'Harga harus bilangan bulat Koin.'],
  ])('rejects price %j without calling the API', (price, message) => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<PostOfferForm postId={POST_ID} offer={null} />);
    fill(price);
    expect(screen.getByText(message)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves with PUT and refreshes the page', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({})));
    render(<PostOfferForm postId={POST_ID} offer={null} />);
    fill('1000');

    expect(await screen.findByText('Tersimpan.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/creators/me/posts/${POST_ID}/offer`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceCoins: 1000 }),
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('shows the API error message', async () => {
    stubFetch(() =>
      Promise.resolve(
        Response.json(
          {
            error: {
              code: 'OFFER_REQUIRES_PREMIUM',
              message: 'Harga hanya bisa diatur untuk post Premium.',
              requestId: 'req_1',
              details: null,
            },
          },
          { status: 409 },
        ),
      ),
    );
    render(<PostOfferForm postId={POST_ID} offer={offer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan harga' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Harga hanya bisa diatur untuk post Premium.',
      ),
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
