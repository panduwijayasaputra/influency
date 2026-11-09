import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeTopBar, nextHidden } from './home-top-bar';

const scrollTo = (y: number) =>
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
  });

afterEach(() => {
  scrollTo(0);
  vi.unstubAllGlobals();
});

describe('nextHidden', () => {
  it.each([
    [false, 10, 30, false],
    [true, 40, -1, false],
    [false, 200, 5, true],
    [true, 200, -5, false],
    [true, 200, 3, true],
    [false, 200, -3, false],
  ])('(hidden=%s, y=%i, dy=%i) → %s', (hidden, y, dy, expected) => {
    expect(nextHidden(hidden, y, dy)).toBe(expected);
  });
});

describe('HomeTopBar', () => {
  const bar = () => screen.getByRole('banner');

  it('renders logo, Cari, Notifikasi and the account slot in order', () => {
    render(<HomeTopBar account={<button type="button">X</button>} />);
    expect(
      screen
        .getAllByRole('link')
        .map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')]),
    ).toEqual([
      ['Influency, ke atas Beranda', '/'],
      ['Cari', '/discover?tab=cari'],
      ['Notifikasi', '/notifications'],
    ]);
    expect(screen.getByRole('button', { name: 'X' })).toBeInTheDocument();
    expect(screen.queryByTestId('unread-dot')).toBeNull();
  });

  it('shows the unread dot and label when there is unread activity', () => {
    render(<HomeTopBar hasUnread account={<button type="button">X</button>} />);
    expect(screen.getByTestId('unread-dot')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Notifikasi, ada aktivitas baru' }),
    ).toBeInTheDocument();
  });

  it('hides on scroll down, ignores jitter, shows on scroll up and near the top', () => {
    render(<HomeTopBar account={<button type="button">X</button>} />);
    expect(bar()).toHaveAttribute('data-hidden', 'false');
    scrollTo(300);
    expect(bar()).toHaveAttribute('data-hidden', 'true');
    scrollTo(302);
    expect(bar()).toHaveAttribute('data-hidden', 'true');
    scrollTo(290);
    expect(bar()).toHaveAttribute('data-hidden', 'false');
    scrollTo(400);
    expect(bar()).toHaveAttribute('data-hidden', 'true');
    scrollTo(20);
    expect(bar()).toHaveAttribute('data-hidden', 'false');
  });

  it('shows again when a control receives focus', () => {
    render(<HomeTopBar account={<button type="button">X</button>} />);
    scrollTo(300);
    expect(bar()).toHaveAttribute('data-hidden', 'true');
    act(() => screen.getByRole('link', { name: 'Cari' }).focus());
    expect(bar()).toHaveAttribute('data-hidden', 'false');
  });

  it('scrolls to the top from the logo, without smooth motion under reduced motion', () => {
    const scroll = vi.fn();
    vi.stubGlobal('scrollTo', scroll);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<HomeTopBar account={<button type="button">X</button>} />);
    fireEvent.click(screen.getByRole('link', { name: 'Influency, ke atas Beranda' }));
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});
