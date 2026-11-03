import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BecomeCreator } from './become-creator';

export const metadata: Metadata = { title: 'Jadi Kreator' };

export default function BecomeCreatorPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Jadi Kreator</h1>
      {/* Reads the session cookie, so it must stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <BecomeCreator />
      </Suspense>
    </main>
  );
}
