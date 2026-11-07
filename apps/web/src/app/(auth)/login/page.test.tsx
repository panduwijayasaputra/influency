import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { LoginErrorMessage } from './login-error-message';
import LoginPage, { RedirectIfSignedIn } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const USER = { id: 'u1', displayName: 'Ana', username: 'ana', roles: ['USER' as const] };
const params = (query: Record<string, string>) => ({ searchParams: Promise.resolve(query) });

describe('LoginPage', () => {
  it('shows the landing copy, the Telegram button and the legal links', () => {
    // A never-settling promise keeps the Suspense'd slots on their fallbacks.
    const { container } = render(
      <LoginPage params={Promise.resolve({})} searchParams={new Promise(() => {})} />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Lebih dekat dengan creator favoritmu',
    );
    expect(screen.getByText(/Ikuti creator, buka post premium/)).toBeInTheDocument();
    expect(screen.getByLabelText('Influency')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Masuk dengan Telegram' })).toHaveAttribute(
      'href',
      '/api/v1/auth/telegram/start',
    );
    expect(screen.getByRole('button', { name: 'Syarat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kebijakan Privasi' })).toBeInTheDocument();
    // The hero is decorative only.
    expect(container.querySelector('[aria-hidden="true"] .rotate-7')).not.toBeNull();
  });
});

describe('RedirectIfSignedIn', () => {
  it('keeps a guest on the page', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(RedirectIfSignedIn(params({ returnTo: '/ana' }))).resolves.toBeNull();
  });

  it('keeps visitors on the page when the API is down', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('503'));
    await expect(RedirectIfSignedIn(params({}))).resolves.toBeNull();
  });

  it.each([
    [{ returnTo: '/ana/posts/1' }, '/ana/posts/1'],
    [{}, '/'],
    [{ returnTo: 'https://evil.example' }, '/'],
    [{ returnTo: '/login' }, '/'],
  ])('sends a signed-in user with %j to %s', async (query, target) => {
    vi.mocked(getCurrentUser).mockResolvedValue(USER);
    await expect(RedirectIfSignedIn(params(query))).rejects.toThrow(`redirect:${target}`);
  });
});

describe('LoginErrorMessage', () => {
  it.each([
    ['login_cancelled', 'Login dibatalkan. Silakan coba lagi bila ingin masuk.'],
    ['login_failed', 'Login gagal. Silakan coba lagi.'],
  ])('shows the message for %s', (error, message) => {
    render(<LoginErrorMessage error={error} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it.each([[undefined], ['<script>alert(1)</script>'], [['login_failed', 'x']]])(
    'renders nothing for %j',
    (error) => {
      const { container } = render(<LoginErrorMessage error={error} />);
      expect(container).toBeEmptyDOMElement();
    },
  );
});
