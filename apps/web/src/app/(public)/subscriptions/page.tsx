import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { SubscriptionsView } from '@/components/subscriptions/subscriptions-view';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

export const metadata = { title: 'Langganan' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Subscriptions />
    </Suspense>
  );
}

// The proxy already sends cookie-less visitors to login; this catches a revoked session.
export async function Subscriptions() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/subscriptions'));
  return (
    <>
      <PageHeader title="Langganan" asHeading fallbackHref="/" />
      <SubscriptionsView />
    </>
  );
}
