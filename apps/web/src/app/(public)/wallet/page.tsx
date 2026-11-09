import { PageHeader } from '@/components/page-header';
import { WalletView } from '@/components/wallet/wallet-view';

export const metadata = { title: 'Dompet' };

export default function Page() {
  return (
    <>
      <PageHeader title="Dompet" asHeading />
      <main className="mx-auto w-full max-w-feed flex-1 px-4 py-4">
        <WalletView />
      </main>
    </>
  );
}
