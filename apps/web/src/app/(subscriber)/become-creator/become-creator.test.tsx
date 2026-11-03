import { render, screen } from '@testing-library/react';
import type { CreatorApplicationResponse } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyCreatorApplication } from '@/lib/api/creator-application';
import { getCurrentUser } from '@/lib/api/current-user';
import { BecomeCreator } from './become-creator';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/creator-application', () => ({ getMyCreatorApplication: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
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
    submittedAt: '2026-11-03T00:00:00.000Z',
    rejectionReason,
  });

describe('BecomeCreator', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', displayName: 'Ana', roles: ['USER'] });
    vi.mocked(getMyCreatorApplication).mockResolvedValue(null);
  });

  it('redirects logged-out visitors to login, returning here', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(BecomeCreator()).rejects.toThrow('redirect:/login?returnTo=%2Fbecome-creator');
  });

  it('shows an empty form when there is no application', async () => {
    render(await BecomeCreator());
    expect(screen.getByLabelText('Nama tampilan')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Ajukan' })).toBeInTheDocument();
  });

  it('shows a pending notice instead of the form', async () => {
    application('PENDING_REVIEW');
    render(await BecomeCreator());
    expect(screen.getByText('Pengajuan Anda sedang ditinjau.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajukan' })).not.toBeInTheDocument();
  });

  it('links approved creators to the Studio', async () => {
    application('APPROVED');
    render(await BecomeCreator());
    expect(screen.getByRole('link', { name: 'Buka Studio' })).toHaveAttribute('href', '/studio');
  });

  it('prefills the form after a rejection', async () => {
    application('REJECTED');
    render(await BecomeCreator());
    expect(screen.getByText(/Pengajuan sebelumnya ditolak/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nama tampilan')).toHaveValue('Ana Kreator');
    expect(screen.getByLabelText('Alamat halaman')).toHaveValue('ana');
  });

  it('shows the rejection reason', async () => {
    application('REJECTED', 'Foto profil tidak jelas');
    render(await BecomeCreator());
    expect(screen.getByText('Alasan: Foto profil tidak jelas')).toBeInTheDocument();
  });

  it('shows no reason while pending', async () => {
    application('PENDING_REVIEW');
    render(await BecomeCreator());
    expect(screen.queryByText(/Alasan:/)).not.toBeInTheDocument();
  });
});
