import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { BecomeCreator } from './become-creator';

export const metadata: Metadata = { title: 'Jadi Kreator' };

export default function BecomeCreatorPage() {
  return (
    <>
      <PageHeader title="Jadi Kreator" fallbackHref="/me" asHeading />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
        {/* Reads the session cookie, so it must stream inside Suspense (cacheComponents). */}
        <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
          <BecomeCreator />
        </Suspense>
      </main>
    </>
  );
}
