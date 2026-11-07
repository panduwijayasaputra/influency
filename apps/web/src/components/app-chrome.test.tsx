import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasInAppHistory, resetInAppHistory } from '@/lib/in-app-history';
import { AppChrome } from './app-chrome';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

const at = (pathname: string) => vi.mocked(usePathname).mockReturnValue(pathname);

describe('AppChrome', () => {
  beforeEach(resetInAppHistory);

  it.each(['/', '/discover', '/ana', '/ana/posts/p1', '/me', '/login-help'])(
    'shows the nav and spacer on %s',
    (pathname) => {
      at(pathname);
      const { container } = render(<AppChrome />);
      expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeInTheDocument();
      expect(container.querySelector('div[aria-hidden]')).not.toBeNull();
    },
  );

  it.each(['/login', '/studio', '/studio/posts/new', '/admin/creators', '/become-creator'])(
    'renders nothing on standalone %s',
    (pathname) => {
      at(pathname);
      const { container } = render(<AppChrome />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('marks in-app navigation only after the pathname changes', () => {
    at('/ana');
    const { rerender } = render(<AppChrome />);
    expect(hasInAppHistory()).toBe(false);
    rerender(<AppChrome />);
    expect(hasInAppHistory()).toBe(false);

    at('/ana/posts/p1');
    rerender(<AppChrome />);
    expect(hasInAppHistory()).toBe(true);
  });
});
