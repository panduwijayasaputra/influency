import { describe, expect, it } from 'vitest';
import { loginHref, TELEGRAM_START, telegramStartHref } from './login-href';

describe('loginHref', () => {
  it.each([
    ['/', '/login'],
    ['/kreator/posts/abc', '/login?returnTo=%2Fkreator%2Fposts%2Fabc'],
    ['//evil.com', '/login'],
  ])('%s → %s', (returnTo, href) => {
    expect(loginHref(returnTo)).toBe(href);
  });
});

describe('telegramStartHref', () => {
  it('forwards a safe return path', () => {
    expect(telegramStartHref('/kreator/posts/abc')).toBe(
      '/api/v1/auth/telegram/start?returnTo=%2Fkreator%2Fposts%2Fabc',
    );
  });

  it.each([[undefined], ['https://evil.com'], [['/a', '/b']], ['/login']])(
    'drops %j',
    (returnTo) => {
      expect(telegramStartHref(returnTo)).toBe(TELEGRAM_START);
    },
  );
});
