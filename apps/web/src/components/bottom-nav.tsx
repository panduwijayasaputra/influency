import { Compass, CirclePlay, Star, Wallet } from 'lucide-react';
import Link from 'next/link';

const TABS = [
  { href: '/discover', label: 'Jelajahi', Icon: Compass },
  { href: '/library', label: 'Koleksi', Icon: CirclePlay },
  { href: '/subscriptions', label: 'Langganan', Icon: Star },
  { href: '/wallet', label: 'Dompet', Icon: Wallet },
] as const;

/** App-style bottom tab bar. The tab pages are placeholders until their stories land (US-022, US-029). */
export function BottomNav() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid h-(--bottom-nav-height) max-w-feed grid-cols-4">
        {TABS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Icon aria-hidden className="size-5.5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
