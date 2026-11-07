import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AccountDrawer } from '@/components/account-drawer';
import { HomeFeed } from '@/components/home-feed/home-feed';
import { HomeTopBar } from '@/components/home-top-bar';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

export const metadata = { title: 'Beranda' };

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

// A guest never sees the top bar or drawer: the proxy redirects cookie-less visitors; this catches revoked sessions.
export async function Home() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/'));
  return (
    <>
      <HomeTopBar account={<AccountDrawer user={user} />} />
      <main className="mx-auto w-full max-w-feed flex-1 pb-6">
        <h1 className="sr-only">Beranda</h1>
        <HomeFeed />
      </main>
    </>
  );
}
