import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CreatorSubscriptionState } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { setFollow } from '@/lib/api/creator-follow';
import { ApiError } from '@/lib/api/errors';
import { cancelScheduledRenewal, subscribeCreator } from '@/lib/api/purchases';
import { ProfileActions } from './profile-actions';

vi.mock('@/lib/api/creator-follow', () => ({ setFollow: vi.fn() }));
vi.mock('@/lib/api/purchases', () => ({
  cancelScheduledRenewal: vi.fn(),
  subscribeCreator: vi.fn(),
}));
vi.mock('@/lib/api/wallet', () => ({
  fetchWallet: vi.fn(() => Promise.resolve({ balanceCoins: 500 })),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const PLAN = { priceCoins: 300, durationDays: 30 } as const;
const day = 86_400_000;
const period = (startOffset: number, endOffset: number) => ({
  periodId: '0198a3c0-0000-7000-8000-0000000000d1',
  startsAt: new Date(Date.now() + startOffset * day).toISOString(),
  endsAt: new Date(Date.now() + endOffset * day).toISOString(),
  priceCoins: 300,
});
const NONE: CreatorSubscriptionState = {
  plan: PLAN,
  viewer: { current: null, scheduled: null, canTip: false },
};

const renderActions = (props: Partial<Parameters<typeof ProfileActions>[0]> = {}) =>
  render(
    <ProfileActions slug="ana" creatorName="Ana" avatarUrl={null} subscription={NONE} {...props} />,
    {
      wrapper: Toaster,
    },
  );

describe('ProfileActions', () => {
  it('calls the follow API from Ikuti and says Langganan is unaffected on unfollow', async () => {
    vi.mocked(setFollow).mockResolvedValue({ following: true, followerCount: 1 });
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Ikuti' }));
    expect(setFollow).toHaveBeenCalledWith('ana', true);
    vi.mocked(setFollow).mockResolvedValue({ following: false, followerCount: 0 });
    fireEvent.click(await screen.findByRole('button', { name: 'Diikuti' }));
    expect(setFollow).toHaveBeenLastCalledWith('ana', false);
    expect(await screen.findByText(/Langganan tidak terpengaruh/)).toBeInTheDocument();
  });

  it('opens the subscription sheet from Langganan', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Langganan · \d+ Koin/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('30 hari');
  });

  it('has no Langganan button when the creator offers no plan', () => {
    renderActions({ subscription: { plan: null, viewer: NONE.viewer } });
    expect(screen.queryByRole('button', { name: /Langganan/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ikuti' })).toBeInTheDocument();
  });

  it('shows Berlangganan with the days left instead of Langganan', () => {
    renderActions({
      subscription: {
        plan: PLAN,
        viewer: { current: period(-18, 12), scheduled: null, canTip: true },
      },
    });
    expect(screen.getByRole('button', { name: /Berlangganan/ })).toHaveTextContent('12 hari lagi');
    expect(screen.queryByRole('button', { name: /^Langganan/ })).toBeNull();
  });

  it('offers early renewal starting at the current end date', async () => {
    renderActions({
      subscription: {
        plan: PLAN,
        viewer: { current: period(-18, 12), scheduled: null, canTip: true },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Berlangganan/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Periode berikutnya mulai');
    const renew = screen.getByRole('button', { name: /Perpanjang lebih awal · 300 Koin/ });
    await waitFor(() => expect(renew).toBeEnabled());
  });

  it('shows the scheduled renewal and asks before cancelling it', () => {
    renderActions({
      subscription: {
        plan: PLAN,
        viewer: { current: period(-18, 12), scheduled: period(12, 42), canTip: true },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Berlangganan/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Perpanjangan terjadwal');
    fireEvent.click(screen.getByRole('button', { name: 'Batalkan perpanjangan' }));
    expect(screen.getByText('Batalkan dan kembalikan 300 Koin?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ya, batalkan' })).toBeInTheDocument();
  });

  it('offers Kirim Tip on the profile only when the server says the viewer may tip', () => {
    const { unmount } = renderActions();
    expect(screen.queryByRole('button', { name: 'Kirim Tip' })).toBeNull();
    unmount();
    renderActions({
      subscription: {
        plan: PLAN,
        viewer: { current: period(-18, 12), scheduled: null, canTip: true },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Tip' }));
    expect(screen.getByRole('dialog', { name: 'Kirim Tip' })).toHaveTextContent('@ana');
  });

  it('never offers Kirim Tip to a guest', () => {
    renderActions({ loginHref: '/login?returnTo=%2Fana' });
    expect(screen.queryByRole('button', { name: 'Kirim Tip' })).toBeNull();
  });

  describe('scheduled renewal', () => {
    const open = () => {
      renderActions({
        subscription: {
          plan: PLAN,
          viewer: { current: period(-18, 12), scheduled: period(12, 42), canTip: false },
        },
      });
      fireEvent.click(screen.getByRole('button', { name: /Berlangganan/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Batalkan perpanjangan' }));
    };

    it('cancels it after the confirmation and says how many Koin came back', async () => {
      vi.mocked(cancelScheduledRenewal).mockResolvedValue({
        periodId: '0198a3c0-0000-7000-8000-0000000000d1',
        refundedCoins: 300,
        balanceCoins: 450,
      });
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Ya, batalkan' }));
      expect(await screen.findByText('300 Koin dikembalikan')).toBeInTheDocument();
      expect(cancelScheduledRenewal).toHaveBeenCalledWith('0198a3c0-0000-7000-8000-0000000000d1');
    });

    it('keeps the sheet and shows the reason when it already started', async () => {
      vi.mocked(cancelScheduledRenewal).mockRejectedValue(
        new ApiError('RENEWAL_ALREADY_STARTED', 'm'),
      );
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Ya, batalkan' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Periode ini sudah dimulai dan tidak bisa dibatalkan.',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not call the API when the user backs out', () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
      expect(cancelScheduledRenewal).not.toHaveBeenCalled();
      expect(subscribeCreator).not.toHaveBeenCalled();
    });
  });

  it('sends a guest to login from both actions', () => {
    renderActions({ loginHref: '/login?returnTo=%2Fana' });
    for (const name of ['Ikuti', 'Langganan']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', '/login?returnTo=%2Fana');
    }
  });
});
