import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoginErrorMessage } from './login-error-message';
import LoginPage from './page';

describe('LoginPage', () => {
  it('links the Telegram button to the API start endpoint', () => {
    // A never-settling promise keeps the Suspense'd error slot on its (empty) fallback.
    render(<LoginPage params={Promise.resolve({})} searchParams={new Promise(() => {})} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Masuk ke Influency');
    expect(screen.getByRole('link', { name: 'Masuk dengan Telegram' })).toHaveAttribute(
      'href',
      '/api/v1/auth/telegram/start',
    );
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
