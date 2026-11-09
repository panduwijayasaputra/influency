import { fireEvent, render, screen } from '@testing-library/react';
import type { CreatorApplicationResponse } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyCreatorApplication } from '@/lib/api/creator-application';
import { getCurrentUser } from '@/lib/api/current-user';
import { BecomeCreator } from './become-creator';

const push = vi.fn();
vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/creator-application', () => ({ getMyCreatorApplication: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ push }),
}));

const application = (
  status: CreatorApplicationResponse['status'],
  rejectionReason: string | null = null,
) =>
  vi.mocked(getMyCreatorApplication).mockResolvedValue({
    status,
    displayName: 'Ana Kreator',
    slug: 'ana',
    bio: null,
    category: null,
    subscriptionPriceCoins: 120,
    submittedAt: '2026-11-03T00:00:00.000Z',
    rejectionReason,
  });

describe('BecomeCreator', () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    });
    vi.mocked(getMyCreatorApplication).mockResolvedValue(null);
  });

  it('redirects logged-out visitors to login, returning here', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(BecomeCreator({})).rejects.toThrow('redirect:/login?returnTo=%2Fbecome-creator');
    await expect(BecomeCreator({ from: 'welcome' })).rejects.toThrow(
      'redirect:/login?returnTo=%2Fbecome-creator%3Ffrom%3Dwelcome',
    );
  });

  it('shows the empty stepper on Profil when there is no application', async () => {
    render(await BecomeCreator({}));
    expect(screen.getByLabelText('Nama tampilan')).toHaveValue('');
    expect(screen.getByText('Langkah 1 dari 4')).toBeInTheDocument();
  });

  it('shows a pending notice instead of the stepper', async () => {
    application('PENDING_REVIEW');
    render(await BecomeCreator({}));
    expect(screen.getByText('Pengajuanmu sedang ditinjau')).toBeInTheDocument();
    expect(screen.getByText(/influency\.com\/ana/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nama tampilan')).not.toBeInTheDocument();
  });

  it('links approved creators to the Studio', async () => {
    application('APPROVED');
    render(await BecomeCreator({}));
    expect(screen.getByRole('link', { name: 'Buka Studio' })).toHaveAttribute('href', '/studio');
  });

  it('prefills the stepper after a rejection and shows the reason', async () => {
    application('REJECTED', 'Foto profil tidak jelas');
    render(await BecomeCreator({}));
    expect(screen.getByText(/Pengajuan sebelumnya ditolak/)).toBeInTheDocument();
    expect(screen.getByText('Alasan: Foto profil tidak jelas')).toBeInTheDocument();
    expect(screen.getByLabelText('Nama tampilan')).toHaveValue('Ana Kreator');
    expect(screen.getByLabelText('Alamat halaman')).toHaveValue('ana');
  });

  it('shows no reason while pending', async () => {
    application('PENDING_REVIEW');
    render(await BecomeCreator({}));
    expect(screen.queryByText(/Alasan:/)).not.toBeInTheDocument();
  });

  it('Back on the first step goes to /me, or to /welcome when opened from there', async () => {
    const { unmount } = render(await BecomeCreator({}));
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(push).toHaveBeenLastCalledWith('/me');
    unmount();
    render(await BecomeCreator({ from: 'welcome' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(push).toHaveBeenLastCalledWith('/welcome');
  });
});
