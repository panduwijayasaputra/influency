import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@influency/shared';
import { getCurrentUser } from '@/lib/api/current-user';
import { Discover } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/components/discover/discover-view', () => ({
  DiscoverView: ({ initialTab, viewerSlug }: { initialTab: string; viewerSlug: string | null }) => (
    <p>
      {initialTab}:{viewerSlug ?? 'none'}
    </p>
  ),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const user: MeResponse = {
  id: 'u1',
  displayName: 'Nadia',
  username: 'nadia',
  roles: ['USER', 'CREATOR'],
  bio: null,
  creatorSlug: 'nadia',
  onboardingCompleted: true,
};

describe('Jelajahi page', () => {
  it('opens Video by default and passes the viewer slug', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    render(await Discover({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('video:nadia')).toBeInTheDocument();
  });

  it('opens Cari from ?tab=cari', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, creatorSlug: null });
    render(await Discover({ searchParams: Promise.resolve({ tab: 'cari' }) }));
    expect(screen.getByText('cari:none')).toBeInTheDocument();
  });

  it('sends a logged-out visitor to login and back', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(Discover({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/login?returnTo=%2Fdiscover',
    );
  });
});
