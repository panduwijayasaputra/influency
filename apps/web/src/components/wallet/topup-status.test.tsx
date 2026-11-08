import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopupOrder } from '@influency/shared';
import { fetchTopup } from '@/lib/api/wallet';
import { TopupStatus } from './topup-status';

vi.mock('@/lib/api/wallet', () => ({ fetchTopup: vi.fn() }));
const mocked = vi.mocked(fetchTopup);

const order = (status: TopupOrder['status'], extra: Partial<TopupOrder> = {}): TopupOrder => ({
  id: '0198a3c0-0000-7000-8000-000000000900',
  status,
  coins: 25,
  priceIdr: 25000,
  feeIdr: 0,
  totalIdr: 25000,
  createdAt: '2026-11-07T03:00:00.000Z',
  creditedAt: null,
  balanceCoins: null,
  redirectUrl: null,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  mocked.mockReset();
});
afterEach(() => vi.useRealTimers());

const show = async (ms = 0) => {
  render(<TopupStatus orderId="x" />);
  await act(() => vi.advanceTimersByTimeAsync(ms));
};

describe('TopupStatus', () => {
  it('shows pending with a continue link and polls until credited', async () => {
    mocked
      .mockResolvedValueOnce(order('PENDING', { redirectUrl: 'https://pay.example/snap' }))
      .mockResolvedValue(order('CREDITED', { balanceCoins: 145 }));
    await show();
    expect(screen.getByText('Menunggu pembayaran')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lanjutkan pembayaran' })).toHaveAttribute(
      'href',
      'https://pay.example/snap',
    );
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByText('Berhasil! +25 Koin')).toBeInTheDocument();
    expect(screen.getByText('Saldo sekarang 145 Koin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kembali ke Dompet' })).toHaveAttribute(
      'href',
      '/wallet',
    );
    const calls = mocked.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(mocked.mock.calls.length).toBe(calls); // stopped polling
  });

  it.each([
    ['FAILED', 'Pembayaran gagal'],
    ['EXPIRED', 'Pembayaran kedaluwarsa'],
    ['CANCELED', 'Pembayaran dibatalkan'],
  ] as const)('%s offers to buy again and does not poll', async (status, title) => {
    mocked.mockResolvedValue(order(status));
    await show(20_000);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beli Koin lagi' })).toHaveAttribute('href', '/wallet');
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it('shows review state and stops polling', async () => {
    mocked.mockResolvedValue(order('UNDER_REVIEW'));
    await show(20_000);
    expect(screen.getByText('Pembayaran sedang ditinjau')).toBeInTheDocument();
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it('shows not found for an unknown or foreign order', async () => {
    mocked.mockResolvedValue(null);
    await show();
    expect(screen.getByText('Pesanan tidak ditemukan.')).toBeInTheDocument();
  });

  it('keeps the last known state and keeps polling when an update fails', async () => {
    mocked.mockResolvedValueOnce(order('PENDING')).mockRejectedValueOnce(new Error('x'));
    mocked.mockResolvedValue(order('PENDING'));
    await show();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByText('Menunggu pembayaran')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Gagal memperbarui');
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is not influenced by a Midtrans query string', async () => {
    window.history.replaceState(null, '', '/wallet/topups/x?transaction_status=settlement');
    mocked.mockResolvedValue(order('PENDING'));
    await show();
    expect(screen.getByText('Menunggu pembayaran')).toBeInTheDocument();
    expect(screen.queryByText(/Berhasil/)).toBeNull();
    window.history.replaceState(null, '', '/');
  });

  it('backs off after a minute and offers a reload after 15', async () => {
    mocked.mockResolvedValue(order('PENDING'));
    await show();
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    const before = mocked.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(mocked.mock.calls.length - before).toBeLessThanOrEqual(1);
    await act(() => vi.advanceTimersByTimeAsync(15 * 60_000));
    expect(screen.getByRole('button', { name: 'Muat ulang' })).toBeInTheDocument();
  });
});
