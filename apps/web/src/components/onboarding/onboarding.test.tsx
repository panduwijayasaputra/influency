import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { WelcomeFlow } from './welcome-flow';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/api/recommended-creators', () => ({
  fetchRecommendedCreators: () => Promise.resolve([]),
}));

const user = { displayName: 'Bima Santoso', username: 'bima', bio: null };
const setup = () => render(<WelcomeFlow user={user} returnTo="/" />, { wrapper: Toaster });

describe('WelcomeFlow path choice', () => {
  beforeEach(() => push.mockClear());

  it('greets by first name and keeps Lanjut disabled until a card is chosen', () => {
    setup();
    expect(screen.getByRole('heading', { name: /Selamat datang, Bima\./ })).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Lanjut' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(next);
    expect(screen.getByRole('radiogroup', { name: 'Jenis akun' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Jelajahi dan dukung/ }));
    expect(screen.getByRole('button', { name: 'Lanjut' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('marks the chosen radio and moves with the arrow keys', () => {
    setup();
    const [a, b] = screen.getAllByRole('radio');
    fireEvent.click(a!);
    expect(a).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(a!, { key: 'ArrowDown' });
    expect(b).toHaveAttribute('aria-checked', 'true');
    expect(b).toHaveFocus();
  });

  it('opens the user steps, and Back returns to the choice', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /Jelajahi dan dukung/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(screen.getByText('Langkah 1 dari 2')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Progres onboarding' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(screen.getByRole('radiogroup', { name: 'Jenis akun' })).toBeInTheDocument();
  });

  it('sends the creator choice to /become-creator', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /Bagikan konten/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(push).toHaveBeenCalledWith('/become-creator?from=welcome');
  });
});
