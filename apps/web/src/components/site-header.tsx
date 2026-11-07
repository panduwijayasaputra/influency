import Link from 'next/link';
import { Suspense } from 'react';
import { APP_NAME } from '@influency/shared';
import { AccountMenu } from '@/components/account-menu';
import { KoinBalance } from '@/components/koin';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/api/current-user';

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
      <Link href="/" className="flex h-11 items-center font-bold tracking-tight">
        {APP_NAME}
      </Link>
      {/* Reads the session cookie, so it streams in; the rest of the shell stays static. */}
      <Suspense fallback={null}>
        <UserMenu />
      </Suspense>
    </header>
  );
}

export async function UserMenu() {
  // An API outage must not break public pages: show the logged-out menu instead.
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return (
      <Button asChild variant="ghost">
        <Link href="/login">Masuk</Link>
      </Button>
    );
  }
  return (
    <nav aria-label="Akun" className="flex min-w-0 items-center gap-2">
      <KoinBalance />
      <AccountMenu displayName={user.displayName} roles={user.roles} />
    </nav>
  );
}
