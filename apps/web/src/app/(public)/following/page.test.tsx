import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { Following } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/components/following/following-view', () => ({ FollowingView: () => <p>view</p> }));
vi.mock('@/components/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

describe('Following page', () => {
  it('shows the title and the view to a signed-in user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    });
    render(await Following());
    expect(screen.getByRole('heading', { name: 'Diikuti' })).toBeInTheDocument();
    expect(screen.getByText('view')).toBeInTheDocument();
  });

  it('sends a logged-out visitor to login and back', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(Following()).rejects.toThrow('redirect:/login?returnTo=%2Ffollowing');
  });
});
