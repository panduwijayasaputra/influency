import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { Home } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/components/home-feed/home-feed', () => ({
  HomeFeed: () => <p>feed</p>,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe('Home', () => {
  it('shows the top bar, drawer and feed to a signed-in user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
    });
    render(await Home());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Beranda');
    expect(screen.getByText('feed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cari' })).toHaveAttribute('href', '/discover');
    expect(screen.getByRole('button', { name: 'Buka menu akun' })).toBeInTheDocument();
  });

  it.each([
    ['a guest', () => vi.mocked(getCurrentUser).mockResolvedValue(null)],
    ['an API outage', () => vi.mocked(getCurrentUser).mockRejectedValue(new Error('503'))],
  ])('sends %s to login', async (_label, arrange) => {
    arrange();
    await expect(Home()).rejects.toThrow('redirect:/login');
  });
});
