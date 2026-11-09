import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BecomeCreator } from './become-creator';

export const metadata: Metadata = { title: 'Jadi Creator' };

export default function BecomeCreatorPage({ searchParams }: PageProps<'/become-creator'>) {
  return (
    <main className="flex flex-1 flex-col">
      {/* Reads the session cookie and the query, so it must stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="p-6 text-muted-foreground">Memuat…</p>}>
        <BecomeCreatorFromQuery searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BecomeCreatorFromQuery({
  searchParams,
}: Pick<PageProps<'/become-creator'>, 'searchParams'>) {
  const { from } = await searchParams;
  return <BecomeCreator from={typeof from === 'string' ? from : undefined} />;
}
