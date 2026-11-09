import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Welcome } from './welcome';

export const metadata: Metadata = { title: 'Selamat datang' };

export default function WelcomePage({ searchParams }: PageProps<'/welcome'>) {
  return (
    <main className="flex flex-1 flex-col">
      {/* Reads the session cookie and the query, so it streams inside Suspense (cacheComponents). */}
      <Suspense fallback={null}>
        <WelcomeFromQuery searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function WelcomeFromQuery({ searchParams }: Pick<PageProps<'/welcome'>, 'searchParams'>) {
  const { returnTo } = await searchParams;
  return <Welcome returnTo={returnTo} />;
}
