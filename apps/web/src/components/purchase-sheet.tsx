'use client';

import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { KoinIcon } from '@/components/koin';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { DEMO_KOIN_BALANCE, DEMO_PURCHASE_MESSAGE } from '@/lib/demo';

/**
 * Bottom sheet confirming a Koin purchase (post unlock or subscription): price, terms and balance.
 * shortcut: the buy button only closes the sheet with a DEMO_PURCHASE_MESSAGE toast; wire it to the purchase API with an Idempotency-Key in US-025/US-027.
 */
export function PurchaseSheet({
  trigger,
  kicker,
  title,
  rows,
  priceCoins,
  ctaLabel,
  children,
}: {
  trigger: ReactNode;
  kicker: string;
  title: string;
  rows: [label: string, value: string][];
  priceCoins: number;
  ctaLabel: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const short = DEMO_KOIN_BALANCE < priceCoins;
  return (
    <BottomSheet
      trigger={trigger}
      title={title}
      eyebrow={kicker}
      open={open}
      onOpenChange={setOpen}
    >
      <dl className="flex flex-col rounded-xl bg-muted px-4 py-1 text-sm">
        {[...rows, ['Harga', `${priceCoins} Koin`] as const].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b py-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-bold">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Saldo kamu</dt>
          <dd className="flex items-center gap-1.5 font-bold">
            <KoinIcon />
            {DEMO_KOIN_BALANCE} Koin
          </dd>
        </div>
      </dl>

      {short ? (
        <Button asChild className="h-13 text-base font-extrabold">
          <Link href="/wallet">Isi Koin · kurang {priceCoins - DEMO_KOIN_BALANCE} Koin</Link>
        </Button>
      ) : (
        <Button
          className="h-13 text-base font-extrabold"
          onClick={() => {
            setOpen(false);
            toast(DEMO_PURCHASE_MESSAGE);
          }}
        >
          {ctaLabel}
        </Button>
      )}
      {children}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Koin langsung terpotong dan tidak bisa dikembalikan. Harga dikunci saat pembelian.
      </p>
    </BottomSheet>
  );
}
