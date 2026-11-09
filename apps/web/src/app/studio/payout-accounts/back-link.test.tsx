import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BackLink } from './back-link';

const renderLink = async (params: Record<string, string | string[] | undefined>) =>
  render(await BackLink({ searchParams: Promise.resolve(params) }));

describe('BackLink', () => {
  it('returns to Pengaturan when opened from there', async () => {
    await renderLink({ from: 'settings' });
    expect(screen.getByRole('link', { name: 'Kembali ke Pengaturan' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it.each([
    ['from earnings', { from: 'earnings' }],
    ['no param', {}],
    ['an unknown value', { from: 'https://evil.example' }],
    ['a repeated param', { from: ['settings', 'earnings'] }],
  ])('returns to Penghasilan for %s', async (_label, params) => {
    await renderLink(params);
    expect(screen.getByRole('link', { name: 'Kembali ke Penghasilan' })).toHaveAttribute(
      'href',
      '/studio/earnings',
    );
  });
});
