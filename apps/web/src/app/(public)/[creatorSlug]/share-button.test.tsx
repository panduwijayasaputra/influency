import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { ShareButton } from './share-button';

describe('ShareButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies the link and confirms with a toast when native share is missing', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    render(<ShareButton title="Ana" />, { wrapper: Toaster });
    fireEvent.click(screen.getByRole('button', { name: 'Bagikan halaman' }));
    expect(await screen.findByRole('listitem')).toHaveTextContent('Tautan disalin');
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole('button', { name: 'Tautan disalin' })).toBeInTheDocument();
  });

  it('uses the native share sheet without a toast', async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share });
    render(<ShareButton title="Ana" />, { wrapper: Toaster });
    fireEvent.click(screen.getByRole('button', { name: 'Bagikan halaman' }));
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
