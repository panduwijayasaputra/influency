import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletTransaction } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import {
  fetchCoinPackages,
  fetchPendingTopups,
  fetchWallet,
  fetchWalletTransactions,
} from '@/lib/api/wallet';
import { WalletView } from './wallet-view';

vi.mock('@/lib/api/wallet', () => ({
  fetchWallet: vi.fn(),
  fetchCoinPackages: vi.fn(),
  fetchWalletTransactions: vi.fn(),
  fetchPendingTopups: vi.fn(),
}));

const id = (n: number) => `0198a3c0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const PACKAGES = [10, 25, 50, 100, 250].map((coins, i) => ({
  id: id(i + 1),
  coins,
  priceIdr: coins * 1000,
}));
const tx = (n: number, amountCoins = 50): WalletTransaction => ({
  id: id(100 + n),
  type: 'TOPUP_CREDIT',
  amountCoins,
  createdAt: '2026-11-03T05:00:00.000Z',
  topupOrderId: id(200 + n),
  detail: null,
  href: null,
});

beforeEach(() => {
  vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 120 });
  vi.mocked(fetchCoinPackages).mockResolvedValue(PACKAGES);
  vi.mocked(fetchWalletTransactions).mockResolvedValue({ items: [tx(1)], nextCursor: null });
  vi.mocked(fetchPendingTopups).mockResolvedValue([]);
});

const renderView = () => render(<WalletView />, { wrapper: Toaster });

describe('WalletView', () => {
  it('shows a skeleton, then the balance, packages and activity', async () => {
    renderView();
    expect(screen.getByLabelText('Memuat dompet')).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Saldo Koin' });
    expect(card).toHaveTextContent('120');
    expect(card).toHaveTextContent('≈ Rp120.000 · 1 Koin = Rp1.000');
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(4);
    expect(screen.getByText('Isi ulang · 50 Koin')).toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();
  });

  it('shows an empty activity state', async () => {
    vi.mocked(fetchWalletTransactions).mockResolvedValue({ items: [], nextCursor: null });
    renderView();
    expect(await screen.findByText('Belum ada aktivitas.')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    vi.mocked(fetchWallet).mockRejectedValueOnce(new Error('x'));
    renderView();
    expect(await screen.findByText('Gagal memuat dompet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('region', { name: 'Saldo Koin' })).toBeInTheDocument();
  });

  it('appends the next page and keeps loaded rows when a page fails', async () => {
    vi.mocked(fetchWalletTransactions)
      .mockResolvedValueOnce({ items: [tx(1)], nextCursor: 'c1' })
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ items: [tx(2, 10)], nextCursor: null });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Muat lagi' }));
    expect(await screen.findByText('Gagal memuat aktivitas.')).toBeInTheDocument();
    expect(screen.getByText('Isi ulang · 50 Koin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('Isi ulang · 10 Koin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Muat lagi' })).toBeNull();
  });

  it('links pending top-ups to their status page', async () => {
    vi.mocked(fetchPendingTopups).mockResolvedValue([
      {
        id: id(900),
        status: 'PENDING',
        coins: 25,
        priceIdr: 25000,
        feeIdr: 0,
        totalIdr: 25000,
        createdAt: '2026-11-07T03:00:00.000Z',
        creditedAt: null,
        balanceCoins: null,
        redirectUrl: null,
      },
    ]);
    renderView();
    const section = await screen.findByRole('region', { name: 'Menunggu pembayaran' });
    expect(within(section).getByRole('link')).toHaveAttribute('href', `/wallet/topups/${id(900)}`);
  });

  it('still renders when pending top-ups fail to load', async () => {
    vi.mocked(fetchPendingTopups).mockRejectedValue(new Error('x'));
    renderView();
    expect(await screen.findByRole('region', { name: 'Saldo Koin' })).toBeInTheDocument();
  });

  it('selects a package and updates the buy button', async () => {
    renderView();
    const buy = await screen.findByRole('button', { name: 'Beli 25 Koin · Rp25.000' });
    const tile = screen.getByRole('button', { name: /^100/ });
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tile);
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(buy).toHaveTextContent('Beli 100 Koin · Rp100.000');
  });

  it('opens the confirmation sheet for the selected package', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /^100/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Beli 100 Koin/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Beli Koin' });
    expect(dialog).toHaveTextContent('Rp100.000');
  });
});
