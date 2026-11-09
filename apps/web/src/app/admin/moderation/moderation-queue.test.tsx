import { render, screen } from '@testing-library/react';
import type { ModerationQueueItem } from '@influency/shared';
import { describe, expect, it, vi } from 'vitest';
import { getModerationQueue } from '@/lib/api/admin-moderation';
import { ModerationQueue } from './moderation-queue';

vi.mock('@/lib/api/admin-moderation', () => ({ getModerationQueue: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const item: ModerationQueueItem = {
  post: {
    id: POST_ID,
    status: 'PUBLISHED',
    visibility: 'PREMIUM',
    caption: 'Baris satu\nbaris dua',
  },
  creator: {
    userId: '0190a000-0000-7000-8000-000000000002',
    slug: 'ana',
    displayName: 'Ana',
    userStatus: 'SUSPENDED',
  },
  openReportCount: 3,
  reasons: [
    { reason: 'VIOLENCE', count: 2 },
    { reason: 'OTHER', count: 1 },
  ],
  reports: [
    {
      reason: 'OTHER',
      note: 'menipu',
      reporterDisplayName: 'Budi',
      createdAt: '2026-11-03T00:00:00.000Z',
    },
  ],
  firstReportedAt: '2026-11-02T00:00:00.000Z',
};

describe('ModerationQueue', () => {
  it('shows an empty state', async () => {
    vi.mocked(getModerationQueue).mockResolvedValue([]);
    render(await ModerationQueue());
    expect(screen.getByText('Tidak ada laporan terbuka.')).toBeInTheDocument();
  });

  it('renders a reported post with counts, reasons, reports and a post link', async () => {
    vi.mocked(getModerationQueue).mockResolvedValue([item]);
    render(await ModerationQueue());
    expect(screen.getByRole('heading', { name: /Ana/ })).toHaveTextContent('Ditangguhkan');
    expect(screen.getByText('Baris satu')).toBeInTheDocument();
    expect(screen.getByText('3 laporan · Kekerasan (2), Lainnya (1)')).toBeInTheDocument();
    expect(screen.getByText('“menipu”')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat postingan' })).toHaveAttribute(
      'href',
      `/ana/posts/${POST_ID}`,
    );
    expect(screen.getByRole('button', { name: 'Pulihkan akun' })).toBeInTheDocument();
  });
});
