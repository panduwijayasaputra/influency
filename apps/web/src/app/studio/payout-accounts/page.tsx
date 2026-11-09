import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { BackLink } from './back-link';
import { PayoutAccountsView } from './payout-accounts-view';

export const metadata: Metadata = { title: 'Rekening Pencairan' };

async function Accounts() {
  // The holder name is prefilled with the creator's display name; a failure just leaves it empty.
  const profile = await getMyCreatorProfile().catch(() => null);
  return <PayoutAccountsView defaultHolderName={profile?.displayName ?? ''} />;
}

export default function PayoutAccountsPage({ searchParams }: PageProps<'/studio/payout-accounts'>) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      {/* Params and the session cookie are request data, so they stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<div className="min-h-11" />}>
        <BackLink searchParams={searchParams} />
      </Suspense>
      <h1 className="text-2xl font-extrabold tracking-tight">Rekening Pencairan</h1>
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <Accounts />
      </Suspense>
    </main>
  );
}
