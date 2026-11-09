'use client';

import { useState } from 'react';
import { type CoinPackage } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The package preselected on first render (LOCKED packages: 10/25/50/100/250 Koin). */
const DEFAULT_COINS = 25;

/** Beli Koin: single-select package tiles and the buy button. */
export function PackagePicker({
  packages,
  onBuy,
}: {
  packages: CoinPackage[];
  onBuy: (pkg: CoinPackage) => void;
}) {
  const [selectedId, setSelectedId] = useState(
    () => (packages.find((p) => p.coins === DEFAULT_COINS) ?? packages[0])?.id,
  );
  const selected = packages.find((p) => p.id === selectedId);

  return (
    <section aria-labelledby="beli-koin" className="flex flex-col gap-2.5">
      <h2 id="beli-koin" className="text-base font-extrabold">
        Beli Koin
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {packages.map((p) => {
          const on = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border bg-card px-2 py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                on ? 'border-2 border-brand bg-accent' : 'border-input',
              )}
            >
              <span className="text-[17px] font-extrabold">{p.coins}</span>
              <span className="text-xs text-muted-foreground">{formatRupiah(p.priceIdr)}</span>
            </button>
          );
        })}
      </div>
      {selected && (
        <Button size="lg" className="h-13 rounded-[14px]" onClick={() => onBuy(selected)}>
          Beli {selected.coins} Koin · {formatRupiah(selected.priceIdr)}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Kamu bisa isi ulang lebih dari sekali.</p>
      <p className="text-xs text-muted-foreground">
        Kebijakan masa berlaku &amp; pengembalian Koin: Perlu konfirmasi.
      </p>
    </section>
  );
}
