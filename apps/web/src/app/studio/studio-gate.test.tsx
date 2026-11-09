import { render, screen } from '@testing-library/react';
import type { MeResponse } from '@influency/shared';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { StudioGate } from './studio-gate';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const as = (roles: MeResponse['roles'] | null) =>
  vi.mocked(getCurrentUser).mockResolvedValue(
    roles && {
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles,
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    },
  );

describe('StudioGate', () => {
  it('redirects logged-out visitors to login, returning to /studio', async () => {
    as(null);
    await expect(StudioGate({ children: 'secret' })).rejects.toThrow(
      'redirect:/login?returnTo=%2Fstudio',
    );
  });

  it.each<[MeResponse['roles']]>([[['USER']], [['USER', 'ADMIN']]])('denies %j', async (roles) => {
    as(roles);
    render(await StudioGate({ children: 'secret' }));
    expect(screen.getByText('Profil kreator belum disetujui.')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders children for an approved creator', async () => {
    as(['USER', 'CREATOR']);
    render(await StudioGate({ children: 'secret' }));
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});
