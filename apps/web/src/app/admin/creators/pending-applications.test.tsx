import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getPendingCreatorApplications } from '@/lib/api/admin-creator-applications';
import { PendingApplications } from './pending-applications';

vi.mock('@/lib/api/admin-creator-applications', () => ({
  getPendingCreatorApplications: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('PendingApplications', () => {
  it('shows an empty state', async () => {
    vi.mocked(getPendingCreatorApplications).mockResolvedValue([]);
    render(await PendingApplications());
    expect(screen.getByText('Tidak ada pengajuan yang menunggu.')).toBeInTheDocument();
  });

  it('renders each application with its details and actions', async () => {
    vi.mocked(getPendingCreatorApplications).mockResolvedValue([
      {
        id: 'p1',
        displayName: 'Ana Kreator',
        slug: 'ana',
        bio: 'Halo semua',
        category: 'Musik',
        applicantName: 'Ana',
        submittedAt: '2026-11-03T00:00:00.000Z',
      },
    ]);
    render(await PendingApplications());
    expect(screen.getByRole('heading', { name: 'Ana Kreator' })).toBeInTheDocument();
    expect(screen.getByText('influency.com/ana')).toBeInTheDocument();
    expect(screen.getByText('Pemohon: Ana · Musik')).toBeInTheDocument();
    expect(screen.getByText('Halo semua')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Setujui' })).toBeInTheDocument();
  });
});
