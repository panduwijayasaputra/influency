'use client';

import { PurchaseSheet } from '@/components/purchase-sheet';
import { DEMO_SUBSCRIPTION } from '@/lib/demo';

/** Creator subscription call to action (manual renewal only, handoff §3). Plan values are dummies until US-026. */
export function SubscribeCard({ creatorName }: { creatorName: string }) {
  const { priceCoins, days } = DEMO_SUBSCRIPTION;
  return (
    <section
      aria-labelledby="langganan"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-col gap-1">
        <h2 id="langganan" className="font-bold wrap-break-word">
          Langganan {creatorName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Buka semua post premium selama {days} hari. Perpanjang manual, tanpa tagihan otomatis.
        </p>
      </div>
      <PurchaseSheet
        trigger={
          <button
            type="button"
            className="h-12 rounded-lg bg-primary text-[15px] font-bold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Langganan · {priceCoins} Koin / {days} hari
          </button>
        }
        kicker="Langganan kreator"
        title={creatorName}
        rows={[
          ['Masa aktif', `${days} hari`],
          ['Perpanjangan', 'Manual'],
        ]}
        priceCoins={priceCoins}
        ctaLabel={`Langganan dengan ${priceCoins} Koin`}
      />
    </section>
  );
}
