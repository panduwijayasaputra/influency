import { Compass, House, UserRound, Wallet } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export const TABS = [
  { href: '/', label: 'Beranda', Icon: House },
  { href: '/discover', label: 'Jelajahi', Icon: Compass },
  { href: '/wallet', label: 'Dompet', Icon: Wallet },
  { href: '/me', label: 'Profil', Icon: UserRound },
] as const;

/** Beranda matches only `/`; other tabs match their path and sub-paths. */
export function isTabActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** App-style bottom tab bar, mounted once by AppChrome. */
export function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid h-(--bottom-nav-height) max-w-feed grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = isTabActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand"
                  />
                )}
                <Icon aria-hidden className="size-5.5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
