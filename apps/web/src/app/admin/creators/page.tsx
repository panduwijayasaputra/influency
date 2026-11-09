import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PendingApplications } from './pending-applications';

export const metadata: Metadata = { title: 'Pengajuan Kreator' };

export default function AdminCreatorsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Pengajuan Kreator</h1>
      {/* Reads the session cookie, so it must stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <PendingApplications />
      </Suspense>
    </main>
  );
}
