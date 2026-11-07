import { describe, expect, it } from 'vitest';
import { isGuestPath } from './guest-paths';

describe('isGuestPath', () => {
  it.each([
    '/login',
    '/ana',
    '/Ana',
    '/ana/',
    '/ana/posts/0190a000-0000-7000-8000-000000000001',
    '/claudiandreya/posts/x',
  ])('lets a guest open %s', (path) => {
    expect(isGuestPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/discover',
    '/me',
    '/wallet',
    '/wallet/topups/1',
    '/library',
    '/subscriptions',
    '/following',
    '/notifications',
    '/account/settings',
    '/studio',
    '/admin',
    '/become-creator',
    '/login/x',
    '/ana/posts',
    '/ana/about',
    '/ana/posts/1/x',
    '/a',
  ])('requires login for %s', (path) => {
    expect(isGuestPath(path)).toBe(false);
  });
});
