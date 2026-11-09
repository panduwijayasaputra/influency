import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { FollowingView } from '@/components/following/following-view';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

export const metadata = { title: 'Diikuti' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Following />
    </Suspense>
  );
}

// The proxy already sends cookie-less visitors to login; this catches a revoked session.
export async function Following() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/following'));
  return (
    <>
      <PageHeader title="Diikuti" asHeading fallbackHref="/" />
      <FollowingView />
    </>
  );
}
