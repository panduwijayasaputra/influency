import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { TopupStatus } from '@/components/wallet/topup-status';

export const metadata = { title: 'Status Isi Ulang' };

async function Status({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <TopupStatus orderId={orderId} />;
}

export default function Page({ params }: { params: Promise<{ orderId: string }> }) {
  return (
    <>
      <PageHeader title="Status Isi Ulang" fallbackHref="/wallet" asHeading />
      <main className="mx-auto w-full max-w-feed flex-1 px-4 py-4">
        {/* Only the server's status decides what is shown; Midtrans query params are ignored. */}
        <Suspense fallback={null}>
          <Status params={params} />
        </Suspense>
      </main>
    </>
  );
}
