'use client';

import {
  Bookmark,
  ChartNoAxesColumn,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import type { MeResponse } from '@influency/shared';
import { ICON_BUTTON_CLASS } from '@/components/home-top-bar';
import { KoinIcon } from '@/components/koin';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/components/use-logout';
import { useWalletBalance } from '@/lib/use-wallet-balance';
import { initials } from '@/lib/utils';

const ROW =
  'flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60';

/** Account drawer from the right (US-005), opened by the Home top bar burger. */
export function AccountDrawer({ user }: { user: MeResponse }) {
  const [open, setOpen] = useState(false);
  const { logout, pending, failed } = useLogout();
  const { balance } = useWalletBalance(open);
  const close = () => setOpen(false);
  const creator = user.roles.includes('CREATOR');
  const links = [
    { href: '/me', label: 'Profil Saya', Icon: UserRound },
    ...(creator
      ? [
          { href: '/studio', label: 'Studio', Icon: LayoutDashboard },
          { href: '/studio/earnings', label: 'Penghasilan', Icon: ChartNoAxesColumn },
        ]
      : [{ href: '/become-creator', label: 'Jadi Creator', Icon: Sparkles }]),
    { href: '/library', label: 'Koleksi Saya', Icon: Bookmark },
    { href: '/following', label: 'Diikuti', Icon: Users },
    { href: '/subscriptions', label: 'Langganan', Icon: Star },
    { href: '/account/settings', label: 'Pengaturan', Icon: Settings },
    ...(user.roles.includes('ADMIN')
      ? [{ href: '/admin', label: 'Admin', Icon: ShieldCheck }]
      : []),
  ];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label="Buka menu akun" className={ICON_BUTTON_CLASS}>
          <Menu aria-hidden className="size-5.5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-card pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl duration-200 focus:outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right motion-reduce:animate-none"
        >
          <div className="flex h-14 shrink-0 items-center justify-between pr-2 pl-4">
            <Dialog.Title className="text-base font-bold">Akun</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Tutup">
                <X aria-hidden className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-primary-foreground"
              >
                {initials(user.displayName)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold">{user.displayName}</p>
                {user.username && (
                  <p className="truncate text-sm text-muted-foreground">@{user.username}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-koin-border bg-koin-surface p-3">
              <KoinIcon className="size-7 text-xs" />
              <div className="min-w-0">
                <p className="font-bold text-koin-foreground">
                  {balance === null ? '—' : balance} Koin
                </p>
              </div>
              <Button asChild size="sm" className="ml-auto">
                <Link href="/wallet" onClick={close}>
                  Beli Koin
                </Link>
              </Button>
            </div>

            <nav aria-label="Menu akun">
              <ul className="flex flex-col">
                {links.map(({ href, label, Icon }) => (
                  <li key={href}>
                    <Link href={href} onClick={close} className={ROW}>
                      <Icon aria-hidden className="size-5" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="border-t pt-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => void logout()}
                className={ROW}
              >
                <LogOut aria-hidden className="size-5" />
                {pending ? 'Keluar…' : 'Keluar'}
              </button>
              {failed && (
                <p role="alert" className="px-3 pt-1 text-sm text-destructive">
                  Gagal keluar. Silakan coba lagi.
                </p>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
