import { render, screen } from '@testing-library/react';
import type { MeResponse } from '@influency/shared';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { UserMenu } from './site-header';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const as = (roles: MeResponse['roles']) =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', displayName: 'Ana', roles });

describe('UserMenu', () => {
  it('shows "Masuk" when logged out', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(await UserMenu());
    expect(screen.getByRole('link', { name: 'Masuk' })).toHaveAttribute('href', '/login');
  });

  it('falls back to "Masuk" when the API is down', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('GET /auth/me failed: 503'));
    render(await UserMenu());
    expect(screen.getByRole('link', { name: 'Masuk' })).toBeInTheDocument();
  });

  it('shows the name and logout, without role links, for a plain user', async () => {
    as(['USER']);
    render(await UserMenu());
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Studio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows Studio and Admin links by role', async () => {
    as(['USER', 'CREATOR', 'ADMIN']);
    render(await UserMenu());
    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute('href', '/studio');
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(screen.queryByRole('link', { name: 'Jadi Kreator' })).not.toBeInTheDocument();
  });

  it('offers "Jadi Kreator" to users who are not creators', async () => {
    as(['USER']);
    render(await UserMenu());
    expect(screen.getByRole('link', { name: 'Jadi Kreator' })).toHaveAttribute(
      'href',
      '/become-creator',
    );
  });
});
