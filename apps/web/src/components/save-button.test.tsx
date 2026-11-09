import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { SaveButton } from './save-button';

const renderButton = (initialSaved = false) =>
  render(<SaveButton postId="p1" initialSaved={initialSaved} />, { wrapper: Toaster });

afterEach(() => vi.unstubAllGlobals());

describe('SaveButton', () => {
  it('flips at once, then confirms with a toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ saved: true }))),
    );
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(screen.getByRole('button', { name: 'Hapus dari Disimpan' })).toBeInTheDocument();
    expect(await screen.findByText('Disimpan ke Koleksi Saya')).toBeInTheDocument();
  });

  it('unsaves with its own toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ saved: false }))),
    );
    renderButton(true);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus dari Disimpan' }));
    expect(await screen.findByText('Dihapus dari Disimpan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('rolls back with an error toast when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))),
    );
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Gagal menyimpan. Coba lagi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores a second click while the first request is pending', async () => {
    let resolve: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal('fetch', fetchMock);
    renderButton();
    const button = screen.getByRole('button', { name: 'Simpan' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus dari Disimpan' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(Response.json({ saved: true }));
    await waitFor(() => expect(screen.getByText('Disimpan ke Koleksi Saya')).toBeInTheDocument());
  });
});
