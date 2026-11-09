import { fireEvent, render, screen } from '@testing-library/react';
import type { MySubscription } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMySubscriptions } from '@/lib/api/my-subscriptions';
import { SubscriptionsView } from './subscriptions-view';

vi.mock('@/lib/api/my-subscriptions', () => ({ fetchMySubscriptions: vi.fn() }));

const sub = (slug: string, daysLeft: number, scheduled = false): MySubscription => ({
  creator: {
    slug,
    displayName: slug.toUpperCase(),
    avatarUrl: null,
    bannerUrl: null,
    bio: `bio ${slug}`,
  },
  endsAt: '2026-12-01T00:00:00.000Z',
  daysLeft,
  hasScheduledRenewal: scheduled,
});

beforeEach(() => vi.resetAllMocks());

describe('SubscriptionsView', () => {
  it('shows an active card per subscription with days left, linking to the profile', async () => {
    vi.mocked(fetchMySubscriptions).mockResolvedValue({
      subscriptions: [sub('ana', 12), sub('bima', 1)],
    });
    render(<SubscriptionsView />);
    const ana = await screen.findByRole('link', {
      name: 'Buka ANA, langganan aktif, Aktif · 12 hari lagi',
    });
    expect(ana).toHaveAttribute('href', '/ana');
    expect(ana).toHaveTextContent('bio ana');
    expect(
      screen.getByRole('link', { name: 'Buka BIMA, langganan aktif, Aktif · berakhir hari ini' }),
    ).toBeInTheDocument();
  });

  it('shows "Perpanjangan terjadwal" only for a subscription with a prepaid renewal', async () => {
    vi.mocked(fetchMySubscriptions).mockResolvedValue({
      subscriptions: [sub('ana', 12, true), sub('bima', 5)],
    });
    render(<SubscriptionsView />);
    await screen.findAllByRole('link');
    expect(screen.getAllByText('Perpanjangan terjadwal')).toHaveLength(1);
  });

  it('says subscriptions are separate from following, renewal is manual, and marks open items', async () => {
    vi.mocked(fetchMySubscriptions).mockResolvedValue({ subscriptions: [sub('ana', 3)] });
    render(<SubscriptionsView />);
    await screen.findByRole('link');
    expect(screen.getByText(/terpisah dari mengikuti/)).toBeInTheDocument();
    expect(screen.getByText(/dilakukan manual/)).toBeInTheDocument();
    expect(screen.getByText(/Perlu konfirmasi/)).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    vi.mocked(fetchMySubscriptions).mockResolvedValue({ subscriptions: [] });
    render(<SubscriptionsView />);
    expect(await screen.findByText('Belum ada langganan aktif')).toBeInTheDocument();
  });

  it('shows a skeleton, then an error that retries', async () => {
    vi.mocked(fetchMySubscriptions)
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ subscriptions: [sub('ana', 3)] });
    render(<SubscriptionsView />);
    expect(screen.getByLabelText('Memuat langganan')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('link', { name: /Buka ANA/ })).toBeInTheDocument();
  });
});
