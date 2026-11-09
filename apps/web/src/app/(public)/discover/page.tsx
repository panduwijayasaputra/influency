import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DiscoverView } from '@/components/discover/discover-view';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

export const metadata = { title: 'Jelajahi' };

type Props = { searchParams: Promise<{ tab?: string | string[] }> };

export default function Page({ searchParams }: Props) {
  return (
    <Suspense fallback={null}>
      <Discover searchParams={searchParams} />
    </Suspense>
  );
}

// The proxy already sends cookie-less visitors to login; this catches a revoked session.
export async function Discover({ searchParams }: Props) {
  const [user, { tab }] = await Promise.all([getCurrentUser().catch(() => null), searchParams]);
  if (!user) redirect(loginHref('/discover'));
  return (
    <DiscoverView initialTab={tab === 'cari' ? 'cari' : 'video'} viewerSlug={user.creatorSlug} />
  );
}
