import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { NotificationList } from '@/components/notifications/notification-list';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

export const metadata = { title: 'Notifikasi' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Notifications />
    </Suspense>
  );
}

// The proxy already sends cookie-less visitors to login; this catches a revoked session.
export async function Notifications() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/notifications'));
  return (
    <>
      <PageHeader title="Notifikasi" asHeading fallbackHref="/" />
      <main className="mx-auto w-full max-w-feed flex-1">
        <NotificationList />
      </main>
    </>
  );
}
