import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './bottom-nav';

const current = (pathname: string) => {
  render(<BottomNav pathname={pathname} />);
  return screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent);
};

describe('BottomNav', () => {
  it('renders the four tabs in order with labels', () => {
    render(<BottomNav pathname="/" />);
    const links = screen.getByRole('navigation', { name: 'Navigasi utama' }).querySelectorAll('a');
    expect([...links].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Beranda', '/'],
      ['Jelajahi', '/discover'],
      ['Dompet', '/wallet'],
      ['Profil', '/me'],
    ]);
  });

  it.each([
    ['/', ['Beranda']],
    ['/wallet', ['Dompet']],
    ['/wallet/topups/x', ['Dompet']],
    ['/me', ['Profil']],
    ['/meow', []],
    ['/ana', []],
    ['/ana/posts/1', []],
  ])('marks the active tab for %s', (pathname, expected) => {
    expect(current(pathname)).toEqual(expected);
  });
});
