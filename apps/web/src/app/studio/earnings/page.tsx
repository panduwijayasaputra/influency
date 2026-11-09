import type { Metadata } from 'next';
import { EarningsView } from './earnings-view';

export const metadata: Metadata = { title: 'Penghasilan' };

export default function EarningsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Penghasilan</h1>
      <EarningsView />
    </main>
  );
}
