import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { Welcome } from './welcome';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/components/onboarding/welcome-flow', () => ({
  WelcomeFlow: (props: { returnTo: string; user: { displayName: string } }) => (
    <p>
      {props.user.displayName}|{props.returnTo}
    </p>
  ),
}));

const user = {
  id: 'u1',
  displayName: 'Bima Santoso',
  username: 'bima',
  bio: null,
  roles: ['USER'],
  onboardingCompleted: false,
};

describe('Welcome', () => {
  it('sends a guest to login with returnTo=/welcome', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(Welcome({ returnTo: undefined })).rejects.toThrow(
      'redirect:/login?returnTo=%2Fwelcome',
    );
  });

  it('passes a safe returnTo through and replaces an unsafe one with /', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user as never);
    render(await Welcome({ returnTo: '/ana' }));
    expect(screen.getByText('Bima Santoso|/ana')).toBeInTheDocument();
    render(await Welcome({ returnTo: '//evil.com' }));
    expect(screen.getByText('Bima Santoso|/')).toBeInTheDocument();
  });

  it('sends a user who already finished to returnTo, or / when it is unsafe', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, onboardingCompleted: true } as never);
    await expect(Welcome({ returnTo: '/ana' })).rejects.toThrow('redirect:/ana');
    await expect(Welcome({ returnTo: '//evil.com' })).rejects.toThrow('redirect:/');
  });
});
