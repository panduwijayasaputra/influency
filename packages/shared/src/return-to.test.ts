import { describe, expect, it } from 'vitest';
import { RETURN_TO_MAX_LENGTH, safeReturnTo } from './index.js';

describe('safeReturnTo', () => {
  it.each([
    '/',
    '/kreator',
    '/kreator/posts/abc',
    '/kreator?tab=posts#top',
    '/kreator/%2F%2Fx',
    '/wallet',
    '/loginx',
    '/apiary',
    `/${'a'.repeat(RETURN_TO_MAX_LENGTH - 1)}`,
  ])('keeps %j', (value) => {
    expect(safeReturnTo(value)).toBe(value);
  });

  it.each([
    undefined,
    null,
    123,
    ['/a'],
    '',
    'kreator',
    '//evil.com',
    '/\\evil.com',
    '/a\\b',
    'https://evil.com',
    'javascript:alert(1)',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\u0000x',
    '/a b',
    '/kreator/€',
    '/login',
    '/login?returnTo=/x',
    '/login/',
    '/./login',
    '/api',
    '/api/v1/auth/telegram/start',
    `/${'a'.repeat(RETURN_TO_MAX_LENGTH)}`,
  ])('falls back to / for %j', (value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});
