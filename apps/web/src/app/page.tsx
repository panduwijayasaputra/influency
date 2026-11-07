import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AccountDrawer } from '@/components/account-drawer';
import { ComingSoon } from '@/components/coming-soon';
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
    <ComingSoon
      title="Beranda"
      description="Feed dari creator yang kamu ikuti akan muncul di sini."
      header={<HomeTopBar account={<AccountDrawer user={user} />} />}
    />
  );
}
