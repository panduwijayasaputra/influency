import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LibraryView } from '@/components/library/library-view';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

export const metadata = { title: 'Koleksi Saya' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Library />
    </Suspense>
  );
}

// The proxy already sends cookie-less visitors to login; this catches a revoked session.
export async function Library() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/library'));
  return (
    <>
      <PageHeader title="Koleksi Saya" asHeading fallbackHref="/" />
      <LibraryView />
    </>
  );
}
