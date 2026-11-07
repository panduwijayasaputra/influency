import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MeResponse } from '@influency/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_KOIN_BALANCE } from '@/lib/demo';
import { AccountDrawer } from './account-drawer';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

const USER: MeResponse = { id: 'u1', displayName: 'Ana Putri', username: 'ana', roles: ['USER'] };

const openDrawer = (user: MeResponse = USER) => {
  render(<AccountDrawer user={user} />);
  fireEvent.click(screen.getByRole('button', { name: 'Buka menu akun' }));
  return screen.getByRole('dialog', { name: 'Akun' });
};
const menuLinks = (dialog: HTMLElement) =>
  within(within(dialog).getByRole('navigation', { name: 'Menu akun' }))
    .getAllByRole('link')
    .map((a) => [a.textContent, a.getAttribute('href')]);

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
  refresh.mockClear();
});

describe('AccountDrawer', () => {
  it('opens from the burger and closes on Escape, returning focus to it', async () => {
    render(<AccountDrawer user={USER} />);
    const trigger = screen.getByRole('button', { name: 'Buka menu akun' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Akun' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('closes on the X button', async () => {
    fireEvent.click(within(openDrawer()).getByRole('button', { name: 'Tutup' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the user, the demo Koin card and the user items in order', () => {
    const dialog = openDrawer();
    expect(dialog).toHaveTextContent('Ana Putri');
    expect(dialog).toHaveTextContent('@ana');
    expect(dialog).toHaveTextContent(`${DEMO_KOIN_BALANCE} Koin`);
    expect(dialog).toHaveTextContent('Demo');
    expect(within(dialog).getByRole('link', { name: 'Beli Koin' })).toHaveAttribute(
      'href',
      '/wallet',
    );
    expect(menuLinks(dialog)).toEqual([
      ['Profil Saya', '/me'],
      ['Jadi Creator', '/become-creator'],
      ['Koleksi Saya', '/library'],
      ['Diikuti', '/following'],
      ['Langganan', '/subscriptions'],
      ['Pengaturan', '/account/settings'],
    ]);
  });

  it('gives creators Studio and Penghasilan, and admins Admin', () => {
    const dialog = openDrawer({ ...USER, roles: ['USER', 'CREATOR', 'ADMIN'] });
    expect(menuLinks(dialog)).toEqual([
      ['Profil Saya', '/me'],
      ['Studio', '/studio'],
      ['Penghasilan', '/studio/earnings'],
      ['Koleksi Saya', '/library'],
      ['Diikuti', '/following'],
      ['Langganan', '/subscriptions'],
      ['Pengaturan', '/account/settings'],
      ['Admin', '/admin'],
    ]);
  });

  it('hides the @ line without a username', () => {
    expect(openDrawer({ ...USER, username: null })).not.toHaveTextContent('@');
  });

  it('closes when a menu link is followed', async () => {
    fireEvent.click(within(openDrawer()).getByRole('link', { name: 'Koleksi Saya' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('logs out to /login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    fireEvent.click(within(openDrawer()).getByRole('button', { name: 'Keluar' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows an error and stays open when logout fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const dialog = openDrawer();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keluar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Gagal keluar');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
