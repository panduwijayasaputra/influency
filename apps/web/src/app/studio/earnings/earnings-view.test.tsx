import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EarningsActivityPage,
  EarningsBalance,
  PayoutAccount,
  PayoutPage,
} from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { fetchEarnings, fetchEarningsActivity } from '@/lib/api/earnings';
import { fetchPayoutAccounts } from '@/lib/api/payout-accounts';
import { ApiError } from '@/lib/api/errors';
import { cancelPayout, fetchPayouts, quotePayout } from '@/lib/api/payouts';
import { EarningsView } from './earnings-view';

vi.mock('@/lib/api/earnings', () => ({ fetchEarnings: vi.fn(), fetchEarningsActivity: vi.fn() }));
vi.mock('@/lib/api/payouts', () => ({
  fetchPayouts: vi.fn(),
  cancelPayout: vi.fn(),
  quotePayout: vi.fn(),
  requestPayout: vi.fn(),
}));
vi.mock('@/lib/api/payout-accounts', () => ({ fetchPayoutAccounts: vi.fn() }));

const BALANCE: EarningsBalance = {
  pendingIdr: 63_750,
  availableIdr: 248_500,
  reservedIdr: 0,
  paidOutIdr: 0,
  nextMaturityAt: '2026-11-14T05:00:00.000Z',
  nextMaturityIdr: 40_000,
};
const ACCOUNT: PayoutAccount = {
  id: '0190a000-0000-7000-8000-000000000401',
  bankCode: 'BCA',
  bankName: 'BCA',
  last4: '4821',
  holderName: 'Nadia Kirana',
  active: true,
  createdAt: '2026-10-01T03:00:00.000Z',
};
const item = (n: number, over: Record<string, unknown> = {}) => ({
  id: `0190a000-0000-7000-8000-00000000020${n}`,
  type: 'unlock' as const,
  kind: 'SALE' as const,
  occurredAt: '2026-11-03T05:00:00.000Z',
  buyerName: `Pembeli${n}`,
  postCaption: null,
  grossKoin: 25,
  feeBps: 2000,
  netIdr: 20_000,
  status: 'PENDING' as const,
  availableAt: '2026-11-17T05:00:00.000Z',
  ...over,
});
const ACTIVITY: EarningsActivityPage = {
  items: [
    item(1, { type: 'subscription', feeBps: 1500, grossKoin: 150, netIdr: 127_500 }),
    item(2),
    item(3, { type: 'tip', feeBps: 0, grossKoin: 10, netIdr: 10_000, status: 'AVAILABLE' }),
    item(4, { type: 'subscription', kind: 'REVERSAL', feeBps: 1500, netIdr: -127_500 }),
  ],
  nextCursor: null,
};
const PAYOUTS: PayoutPage = {
  items: [
    {
      id: '0190a000-0000-7000-8000-000000000301',
      amountIdr: 150_000,
      feeIdr: 2_500,
      netIdr: 147_500,
      feeIsPlaceholder: true,
      status: 'REQUESTED',
      destination: { bankCode: 'BCA', bankName: 'BCA', last4: '4821', holderName: 'Nadia Kirana' },
      requestedAt: '2026-11-08T05:00:00.000Z',
      updatedAt: '2026-11-08T05:00:00.000Z',
    },
  ],
  nextCursor: null,
};

beforeEach(() => {
  vi.mocked(fetchEarnings).mockResolvedValue(BALANCE);
  vi.mocked(fetchEarningsActivity).mockResolvedValue(ACTIVITY);
  vi.mocked(fetchPayoutAccounts).mockResolvedValue([ACCOUNT]);
  vi.mocked(fetchPayouts).mockResolvedValue(PAYOUTS);
  vi.mocked(quotePayout).mockImplementation((amountIdr) =>
    Promise.resolve({
      amountIdr,
      feeIdr: 2_500,
      netIdr: amountIdr - 2_500,
      feeIsPlaceholder: true,
      availableIdr: 248_500,
      destination: ACCOUNT,
    }),
  );
});
afterEach(() => vi.clearAllMocks());

const renderView = () => render(<EarningsView />, { wrapper: Toaster });
const requestButton = () => screen.findByRole('button', { name: 'Ajukan pencairan' });

describe('EarningsView balance', () => {
  it('shows available, pending with its maturity date, and the 14-day note', async () => {
    renderView();
    expect(await screen.findByText('Rp248.500')).toBeVisible();
    expect(screen.getByText('Saldo tersedia')).toBeVisible();
    expect(screen.getByText('Tertunda', { selector: 'span.font-semibold' })).toBeVisible();
    expect(screen.getByText(/Rp63\.750/)).toBeVisible();
    expect(screen.getByText(/Tersedia mulai 14 Nov 2026/)).toBeVisible();
    expect(
      screen.getByText('Penghasilan tertunda selama 14 hari sebelum bisa dicairkan.'),
    ).toBeVisible();
  });

  it('hides "Dalam pencairan" at zero and shows it when money is reserved', async () => {
    const { unmount } = renderView();
    await screen.findByText('Rp248.500');
    expect(screen.queryByText('Dalam pencairan')).toBeNull();
    unmount();
    vi.mocked(fetchEarnings).mockResolvedValue({ ...BALANCE, reservedIdr: 150_000 });
    renderView();
    expect(await screen.findByText('Dalam pencairan')).toBeVisible();
    expect(screen.getAllByText(/Rp150\.000/).length).toBeGreaterThan(0);
  });

  it('enables Ajukan pencairan at exactly Rp100.000', async () => {
    vi.mocked(fetchEarnings).mockResolvedValue({ ...BALANCE, availableIdr: 100_000 });
    renderView();
    expect(await requestButton()).toBeEnabled();
    expect(screen.queryByText('Minimal pencairan Rp100.000.')).toBeNull();
  });

  it('disables it one rupiah below the minimum, with the hint', async () => {
    vi.mocked(fetchEarnings).mockResolvedValue({ ...BALANCE, availableIdr: 99_999 });
    renderView();
    expect(await requestButton()).toBeDisabled();
    expect(screen.getByText('Minimal pencairan Rp100.000.')).toBeVisible();
  });

  it('disables it without an active account and links to add one', async () => {
    vi.mocked(fetchPayoutAccounts).mockResolvedValue([]);
    renderView();
    await waitFor(async () => expect(await requestButton()).toBeDisabled());
    expect(screen.getByText('Tambahkan rekening pencairan dulu.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tambah rekening' })).toHaveAttribute(
      'href',
      '/studio/payout-accounts?from=earnings',
    );
  });

  it('retries a balance that failed to load', async () => {
    vi.mocked(fetchEarnings).mockRejectedValueOnce(new Error('down'));
    renderView();
    expect(await screen.findByText('Penghasilan belum bisa dimuat.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('Rp248.500')).toBeVisible();
  });
});

describe('EarningsView payout account', () => {
  it('shows the active account masked, with Kelola', async () => {
    renderView();
    expect(await screen.findByText('BCA •••• 4821')).toBeVisible();
    expect(screen.getByText('a.n. Nadia Kirana')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Kelola' })).toHaveAttribute(
      'href',
      '/studio/payout-accounts?from=earnings',
    );
  });
});

describe('EarningsView riwayat', () => {
  it('describes each row by type with date, Koin, fee and the net amount', async () => {
    renderView();
    expect(await screen.findByText('Pembeli1 berlangganan')).toBeVisible();
    expect(screen.getByText('+Rp127.500')).toBeVisible();
    expect(screen.getByText(/150 Koin · biaya 15%/)).toBeVisible();
    expect(screen.getByText('Pembeli2 membuka post')).toBeVisible();
    expect(screen.getByText(/25 Koin · biaya 20%/)).toBeVisible();
    expect(screen.getByText('Pembeli3 mengirim tip')).toBeVisible();
    expect(screen.getByText(/10 Koin · tanpa biaya/)).toBeVisible();
  });

  it('marks a reversal as negative and labels pending vs available', async () => {
    renderView();
    expect(await screen.findByText('Langganan dibatalkan · Pembeli4')).toBeVisible();
    expect(screen.getByText('−Rp127.500')).toBeVisible();
    expect(screen.getAllByText('Tersedia', { selector: 'span.rounded-full' })).toHaveLength(1);
    expect(screen.getAllByText('Tertunda', { selector: 'span.rounded-full' })).toHaveLength(3);
  });

  it('reloads with the chosen type', async () => {
    renderView();
    await screen.findByText('Pembeli1 berlangganan');
    fireEvent.click(screen.getByRole('button', { name: 'Tip' }));
    await waitFor(() =>
      expect(fetchEarningsActivity).toHaveBeenLastCalledWith({ type: 'tip', cursor: undefined }),
    );
    expect(screen.getByRole('button', { name: 'Tip' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the empty state', async () => {
    vi.mocked(fetchEarningsActivity).mockResolvedValue({ items: [], nextCursor: null });
    renderView();
    expect(await screen.findByText('Belum ada penghasilan.')).toBeVisible();
  });

  it('shows an error with a retry', async () => {
    vi.mocked(fetchEarningsActivity).mockRejectedValueOnce(new Error('down'));
    renderView();
    const alert = await screen.findByText('Gagal memuat. Periksa koneksi lalu coba lagi.');
    fireEvent.click(within(alert.parentElement as HTMLElement).getByRole('button'));
    expect(await screen.findByText('Pembeli1 berlangganan')).toBeVisible();
  });

  it('explains the fees and the Koin rate in the footer', async () => {
    renderView();
    expect(
      await screen.findByText(/15% langganan, 20% unlock, 0% tip\. 1 Koin = Rp1\.000\./),
    ).toBeVisible();
  });
});

describe('EarningsView pencairan', () => {
  it('lists payouts with their status label', async () => {
    renderView();
    const section = (await screen.findByRole('heading', { name: 'Pencairan' })).closest(
      'section',
    ) as HTMLElement;
    expect(await within(section).findByText('Rp150.000')).toBeVisible();
    expect(within(section).getByText('Diajukan')).toBeVisible();
    expect(within(section).getByText(/BCA •••• 4821/)).toBeVisible();
  });

  it('shows the empty state', async () => {
    vi.mocked(fetchPayouts).mockResolvedValue({ items: [], nextCursor: null });
    renderView();
    expect(await screen.findByText('Belum ada pencairan.')).toBeVisible();
  });
});

describe('EarningsView payout request and cancel', () => {
  it('opens the request sheet from Ajukan pencairan', async () => {
    renderView();
    fireEvent.click(await requestButton());
    const dialog = await screen.findByRole('dialog', { name: 'Ajukan pencairan' });
    expect(within(dialog).getByLabelText('Jumlah pencairan (Rp)')).toHaveValue('248500');
  });

  it('asks before cancelling a requested payout and keeps it on "Tidak"', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Batalkan pencairan Rp150.000' }));
    const dialog = await screen.findByRole('dialog', { name: 'Batalkan pencairan?' });
    expect(within(dialog).getByText('Saldo Rp150.000 kembali tersedia.')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tidak' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cancelPayout).not.toHaveBeenCalled();
  });

  it('cancels after confirming, then reloads the balance and the list', async () => {
    vi.mocked(cancelPayout).mockResolvedValue({ ...PAYOUTS.items[0]!, status: 'CANCELED' });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Batalkan pencairan Rp150.000' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ya, batalkan' }));
    await waitFor(() => expect(cancelPayout).toHaveBeenCalledWith(PAYOUTS.items[0]!.id));
    expect(await screen.findByText('Pencairan dibatalkan')).toBeVisible();
    await waitFor(() => expect(fetchEarnings).toHaveBeenCalledTimes(2));
    expect(fetchPayouts).toHaveBeenCalledTimes(2);
  });

  it('shows the API message when the payout can no longer be cancelled, and still reloads', async () => {
    vi.mocked(cancelPayout).mockRejectedValue(
      new ApiError('PAYOUT_NOT_CANCELABLE', 'Pencairan ini sudah tidak bisa dibatalkan.'),
    );
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Batalkan pencairan Rp150.000' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ya, batalkan' }));
    expect(await screen.findByText('Pencairan ini sudah tidak bisa dibatalkan.')).toBeVisible();
    await waitFor(() => expect(fetchPayouts).toHaveBeenCalledTimes(2));
  });

  it('offers no cancel on a paid payout', async () => {
    vi.mocked(fetchPayouts).mockResolvedValue({
      items: [{ ...PAYOUTS.items[0]!, status: 'PAID_OUT' }],
      nextCursor: null,
    });
    renderView();
    await screen.findByText('Dibayar');
    expect(screen.queryByRole('button', { name: /Batalkan pencairan/ })).toBeNull();
  });
});

describe('EarningsView older payouts', () => {
  const OLDER = {
    ...PAYOUTS.items[0]!,
    id: '0190a000-0000-7000-8000-000000000310',
    amountIdr: 120_000,
    status: 'PAID_OUT' as const,
  };

  it('offers Muat lagi only when there is another page, and appends it', async () => {
    vi.mocked(fetchPayouts)
      .mockResolvedValueOnce({ items: PAYOUTS.items, nextCursor: '1762000000000_abc' })
      .mockResolvedValueOnce({ items: [OLDER], nextCursor: null });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Muat lagi' }));
    expect(await screen.findByText('Rp120.000')).toBeVisible();
    expect(fetchPayouts).toHaveBeenLastCalledWith('1762000000000_abc');
    expect(screen.getByText('Rp150.000')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Muat lagi' })).toBeNull();
  });

  it('has no Muat lagi on a single page', async () => {
    renderView();
    await screen.findByText('Diajukan');
    expect(screen.queryByRole('button', { name: 'Muat lagi' })).toBeNull();
  });

  it('keeps the loaded rows and says so when the next page fails', async () => {
    vi.mocked(fetchPayouts)
      .mockResolvedValueOnce({ items: PAYOUTS.items, nextCursor: '1762000000000_abc' })
      .mockRejectedValueOnce(new Error('down'));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Muat lagi' }));
    expect(await screen.findByText('Gagal memuat. Coba lagi.')).toBeVisible();
    expect(screen.getByText('Rp150.000')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Muat lagi' })).toBeEnabled();
  });
});
