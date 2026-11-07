'use client';

import {
  ChartNoAxesColumn,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { DropdownMenu } from 'radix-ui';
import type { MeResponse } from '@influency/shared';
import { useLogout } from '@/components/use-logout';
import { initials } from '@/lib/utils';

const ITEM =
  'flex h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-semibold outline-none select-none data-disabled:opacity-60 data-highlighted:bg-muted';

/** Avatar button with the account dropdown; items depend on the user's roles. */
export function AccountMenu({ displayName, roles }: Pick<MeResponse, 'displayName' | 'roles'>) {
  const { logout, pending, failed } = useLogout();
  const creator = roles.includes('CREATOR');
  const links = [
    // Creators edit their public profile in the studio; other users get the account profile.
    { href: creator ? '/studio/profile' : '/account', label: 'Profil', Icon: UserRound },
    ...(creator
      ? [
          { href: '/studio', label: 'Studio', Icon: LayoutDashboard },
          { href: '/studio/earnings', label: 'Penghasilan', Icon: ChartNoAxesColumn },
        ]
      : []),
    ...(roles.includes('ADMIN') ? [{ href: '/admin', label: 'Admin', Icon: ShieldCheck }] : []),
    { href: '/account/settings', label: 'Pengaturan', Icon: Settings },
  ];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Menu akun"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span aria-hidden>{initials(displayName)}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 flex w-60 flex-col rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          <DropdownMenu.Label className="truncate px-3 py-2 text-xs font-semibold text-muted-foreground">
            {displayName}
          </DropdownMenu.Label>
          {links.map(({ href, label, Icon }) => (
            <DropdownMenu.Item key={href} asChild className={ITEM}>
              <Link href={href}>
                <Icon aria-hidden className="size-4.5" />
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            disabled={pending}
            // Keep the menu open so the pending state or the error stays visible.
            onSelect={(event) => {
              event.preventDefault();
              void logout();
            }}
            className={ITEM}
          >
            <LogOut aria-hidden className="size-4.5" />
            {pending ? 'Keluar…' : 'Keluar'}
          </DropdownMenu.Item>
          {failed && (
            <p role="alert" className="px-3 pt-1 pb-2 text-sm text-destructive">
              Gagal keluar. Silakan coba lagi.
            </p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
