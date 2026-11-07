import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MeResponse } from '@influency/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './account-menu';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function openMenu(roles: MeResponse['roles']) {
  render(<AccountMenu displayName="Claudia Andreya" roles={roles} />);
  const trigger = screen.getByRole('button', { name: 'Menu akun' });
  expect(trigger).toHaveTextContent('CA');
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.getByRole('menu');
}

const items = () =>
  screen.getAllByRole('menuitem').map((item) => [item.textContent, item.getAttribute('href')]);

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AccountMenu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('offers profile, settings and logout to a plain user', () => {
    expect(openMenu(['USER'])).toHaveTextContent('Claudia Andreya');
    expect(items()).toEqual([
      ['Profil', '/account'],
      ['Pengaturan', '/account/settings'],
      ['Keluar', null],
    ]);
  });

  it('adds Studio and Penghasilan for creators, whose profile is the studio profile', () => {
    openMenu(['USER', 'CREATOR']);
    expect(items()).toEqual([
      ['Profil', '/studio/profile'],
      ['Studio', '/studio'],
      ['Penghasilan', '/studio/earnings'],
      ['Pengaturan', '/account/settings'],
      ['Keluar', null],
    ]);
  });

  it('adds Admin for admins', () => {
    openMenu(['USER', 'ADMIN']);
    expect(items()).toContainEqual(['Admin', '/admin']);
  });

  it('logs out once, then goes home and refreshes', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    openMenu(['USER']);
    const logout = screen.getByRole('menuitem', { name: 'Keluar' });
    fireEvent.click(logout);
    expect(logout).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(logout); // double click while pending

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', { method: 'POST' });
  });

  it.each([
    ['a 403 response', () => Promise.resolve(new Response(null, { status: 403 }))],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('shows an error and stays put on %s', async (_label, impl) => {
    stubFetch(impl);
    openMenu(['USER']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Keluar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal keluar. Silakan coba lagi.');
    expect(screen.getByRole('menuitem', { name: 'Keluar' })).not.toHaveAttribute('aria-disabled');
    expect(router.replace).not.toHaveBeenCalled();
  });
});
