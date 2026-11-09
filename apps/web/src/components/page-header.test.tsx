import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markInAppNavigation, resetInAppHistory } from '@/lib/in-app-history';
import { PageHeader } from './page-header';

const back = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ back }) }));

describe('PageHeader', () => {
  beforeEach(() => {
    resetInAppHistory();
    back.mockClear();
  });

  it('has no back control on a direct visit without a fallback', () => {
    render(<PageHeader title="Ana" />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByLabelText('Kembali')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('links to the fallback on a direct visit', () => {
    render(<PageHeader title="Postingan" fallbackHref="/ana" />);
    expect(screen.getByRole('link', { name: 'Kembali' })).toHaveAttribute('href', '/ana');
  });

  it('goes back in history once the user has navigated in the app', () => {
    render(<PageHeader title="Postingan" fallbackHref="/ana" asHeading />);
    act(markInAppNavigation);

    expect(screen.queryByRole('link', { name: 'Kembali' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(back).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Postingan');
  });
});
