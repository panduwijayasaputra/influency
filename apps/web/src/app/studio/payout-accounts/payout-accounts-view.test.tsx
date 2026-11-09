import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayoutAccountsFake } from '@/test-support/payout-accounts-fake';
import { PAYOUT_ACCOUNT_MAX } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { fetchPayoutAccounts } from '@/lib/api/payout-accounts';
import { PayoutAccountsView } from './payout-accounts-view';

// The accounts client is faked in memory: these tests run whole flows; the real API is tested in apps/api.
const fake = vi.hoisted(() => ({ api: null as PayoutAccountsFake | null }));
vi.mock('@/lib/api/payout-accounts', async () => {
  const { createPayoutAccountsFake } = await import('@/test-support/payout-accounts-fake');
  const api = createPayoutAccountsFake();
  fake.api = api;
  return {
    fetchPayoutAccounts: api.fetchPayoutAccounts,
    createPayoutAccount: api.createPayoutAccount,
    activatePayoutAccount: api.activatePayoutAccount,
    deletePayoutAccount: api.deletePayoutAccount,
  };
});

const renderView = () =>
  render(<PayoutAccountsView defaultHolderName="Nadia Kirana" />, { wrapper: Toaster });
const card = async (text: string) => (await screen.findByText(text)).closest('li') as HTMLElement;
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => fake.api!.reset());

describe('PayoutAccountsView list', () => {
  it('shows the masked accounts with the counter and an Aktif badge on one', async () => {
    renderView();
    expect(await screen.findByText('BCA •••• 4821')).toBeVisible();
    expect(screen.getByText('Bank Jago •••• 4756')).toBeVisible();
    expect(screen.getByText('2 / 3 rekening')).toBeVisible();
    expect(screen.getAllByText('Aktif')).toHaveLength(1);
    expect(within(await card('BCA •••• 4821')).getByText('Aktif')).toBeVisible();
  });

  it('gives the active account no delete action and says why (several accounts)', async () => {
    renderView();
    const active = await card('BCA •••• 4821');
    expect(within(active).queryByRole('button')).toBeNull();
    expect(
      within(active).getByText('Rekening aktif · jadikan rekening lain aktif untuk menghapus ini.'),
    ).toBeVisible();
  });

  it('explains the only account differently', async () => {
    const [first] = await fetchPayoutAccounts();
    fake.api!.reset([first!]);
    renderView();
    expect(
      await screen.findByText('Rekening satu-satunya · tambah rekening lain sebelum menghapus.'),
    ).toBeVisible();
  });
});

describe('PayoutAccountsView activate and delete', () => {
  it('makes another account the only active one and confirms', async () => {
    renderView();
    fireEvent.click(
      await screen.findByRole('button', { name: /Jadikan Bank Jago •••• 4756 aktif/ }),
    );
    expect(await screen.findByText('Bank Jago sekarang rekening pencairan aktif')).toBeVisible();
    await waitFor(async () =>
      expect(within(await card('Bank Jago •••• 4756')).getByText('Aktif')).toBeVisible(),
    );
    expect(screen.getAllByText('Aktif')).toHaveLength(1);
  });

  it('asks before deleting, and Batal keeps the account', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /Hapus Bank Jago/ }));
    expect(screen.getByText('Hapus rekening ini?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByText('Hapus rekening ini?')).toBeNull();
    expect(screen.getByText('Bank Jago •••• 4756')).toBeVisible();
  });

  it('deletes after confirming', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /Hapus Bank Jago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    expect(await screen.findByText('Rekening dihapus')).toBeVisible();
    await waitFor(() => expect(screen.queryByText('Bank Jago •••• 4756')).toBeNull());
    expect(screen.getByText('1 / 3 rekening')).toBeVisible();
  });
});

describe('PayoutAccountsView add form', () => {
  const open = async () =>
    fireEvent.click(await screen.findByRole('button', { name: 'Tambah rekening' }));

  it('is closed at first and prefilled with the holder name when opened', async () => {
    renderView();
    await screen.findByText('BCA •••• 4821');
    expect(screen.queryByLabelText('Nomor rekening')).toBeNull();
    await open();
    expect(screen.getByLabelText('Nama pemilik rekening')).toHaveValue('Nadia Kirana');
  });

  it.each(['12345', 'abcdefgh', '', '1'.repeat(21)])(
    'rejects the account number %j with an inline error',
    async (value) => {
      renderView();
      await open();
      fill('Nomor rekening', value);
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
      expect(await screen.findByText('Nomor rekening harus 6–20 digit angka.')).toBeVisible();
      expect(await fetchPayoutAccounts()).toHaveLength(2);
    },
  );

  it('requires a holder name', async () => {
    renderView();
    await open();
    fill('Nomor rekening', '9988776655');
    fill('Nama pemilik rekening', '  ');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Nama pemilik rekening wajib diisi.')).toBeVisible();
  });

  it('adds an inactive account, ignoring spaces in the number', async () => {
    renderView();
    await open();
    fill('Nomor rekening', '9988 7766 55');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Rekening ditambahkan')).toBeVisible();
    expect(await screen.findByText('BCA •••• 6655')).toBeVisible();
    expect(screen.getByText('3 / 3 rekening')).toBeVisible();
    expect(screen.getAllByText('Aktif')).toHaveLength(1);
  });

  it('makes the new account active when asked', async () => {
    renderView();
    await open();
    fill('Nomor rekening', '9988776655');
    fireEvent.click(screen.getByLabelText('Jadikan rekening aktif'));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Rekening ditambahkan dan dijadikan aktif')).toBeVisible();
    await waitFor(async () =>
      expect(within(await card('BCA •••• 6655')).getByText('Aktif')).toBeVisible(),
    );
    expect(screen.getAllByText('Aktif')).toHaveLength(1);
  });

  it(`hides Tambah rekening at ${PAYOUT_ACCOUNT_MAX} accounts`, async () => {
    renderView();
    await open();
    fill('Nomor rekening', '9988776655');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await screen.findByText('3 / 3 rekening');
    expect(screen.queryByRole('button', { name: 'Tambah rekening' })).toBeNull();
    expect(screen.getByText('Maksimal 3 rekening.')).toBeVisible();
  });
});

describe('PayoutAccountsView with no accounts', () => {
  it('opens the form at once and hides the active checkbox: the first account is always active', async () => {
    fake.api!.reset([]);
    renderView();
    expect(await screen.findByText('Belum ada rekening pencairan.')).toBeVisible();
    expect(screen.getByLabelText('Nomor rekening')).toBeVisible();
    expect(screen.queryByLabelText('Jadikan rekening aktif')).toBeNull();
    fill('Nomor rekening', '1234564821');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('BCA •••• 4821')).toBeVisible();
    expect(screen.getByText('Aktif')).toBeVisible();
  });
});
