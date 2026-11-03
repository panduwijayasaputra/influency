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
  durationSeconds: 7 * 86_400,
  createdAt: '2026-11-03T00:00:00.000Z',
};

function fill(price: string, days: string) {
  fireEvent.change(screen.getByLabelText('Harga (Koin)'), { target: { value: price } });
  fireEvent.change(screen.getByLabelText('Durasi akses (hari)'), { target: { value: days } });
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
    expect(screen.getByLabelText('Durasi akses (hari)')).toHaveValue(null);
  });

  it('shows and prefills the current version', () => {
    render(<PostOfferForm postId={POST_ID} offer={offer} />);
    expect(screen.getByText('Versi 2: 5 Koin · 7 hari')).toBeVisible();
    expect(screen.getByLabelText('Harga (Koin)')).toHaveValue(5);
    expect(screen.getByLabelText('Durasi akses (hari)')).toHaveValue(7);
    expect(screen.getByText(/hanya berlaku untuk pembelian berikutnya/)).toBeVisible();
  });

  it.each([
    ['0', '7', 'Harga minimal 1 Koin.'],
    ['', '7', 'Harga minimal 1 Koin.'],
    ['5', '400', 'Durasi maksimal 365 hari.'],
    ['2.5', '7', 'Harga harus bilangan bulat Koin.'],
  ])('rejects price %j / days %j without calling the API', (price, days, message) => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response()));
    render(<PostOfferForm postId={POST_ID} offer={null} />);
    fill(price, days);
    expect(screen.getByText(message)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves with PUT and refreshes the page', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({})));
    render(<PostOfferForm postId={POST_ID} offer={null} />);
    fill('5', '7');

    expect(await screen.findByText('Tersimpan.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/creators/me/posts/${POST_ID}/offer`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ priceCoins: 5, durationDays: 7 }),
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
