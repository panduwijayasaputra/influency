import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DevLoginLinks, devLoginHref } from './dev-login-links';

describe('devLoginHref', () => {
  it.each([
    [undefined, '/api/v1/auth/dev/login?user=claudia'],
    ['/studio', '/api/v1/auth/dev/login?user=claudia&returnTo=%2Fstudio'],
    ['https://evil.com', '/api/v1/auth/dev/login?user=claudia'],
  ])('returnTo %j → %s', (returnTo, href) => {
    expect(devLoginHref('claudia', returnTo)).toBe(href);
  });
});

describe('DevLoginLinks', () => {
  it('links every demo user to the dev login endpoint', () => {
    render(<DevLoginLinks returnTo="/admin" />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/api/v1/auth/dev/login?user=admin&returnTo=%2Fadmin',
    );
  });
});
