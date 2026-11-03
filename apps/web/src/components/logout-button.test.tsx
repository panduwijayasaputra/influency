import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogoutButton } from './logout-button';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('LogoutButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('POSTs to the logout endpoint once, then goes home and refreshes', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    render(<LogoutButton />);

    const button = screen.getByRole('button', { name: 'Keluar' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button); // double click while pending

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', { method: 'POST' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['a 403 response', () => Promise.resolve(new Response(null, { status: 403 }))],
    ['a 500 response', () => Promise.resolve(new Response(null, { status: 500 }))],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('shows an error and stays put on %s', async (_label, impl) => {
    stubFetch(impl);
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal keluar. Silakan coba lagi.');
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
