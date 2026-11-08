'use client';

import { useState } from 'react';
import type { CoinPackage } from '@influency/shared';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { ApiError, createTopup, startCheckout } from '@/lib/api/wallet';
import { formatKoin, formatRupiah } from '@/lib/format';

/**
 * Beli Koin confirmation: package, price, fee and total due before leaving for payment. The total shown is the
 * list price (fee Rp0 by decision); the order created by the server is the authority.
 */
export function TopupSheet({ pkg, onClose }: { pkg: CoinPackage | null; onClose: () => void }) {
  // Inner component remounts per package, so the idempotency key and state are per attempt.
  return (
    <BottomSheet title="Beli Koin" open={pkg !== null} onOpenChange={(open) => !open && onClose()}>
      {pkg && <SheetBody key={pkg.id} pkg={pkg} />}
    </BottomSheet>
  );
}

function SheetBody({ pkg }: { pkg: CoinPackage }) {
  // One key per attempt, kept across retries. A failed gateway call leaves a FAILED order behind, so that one starts over.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const order = await createTopup(pkg.id, key);
      startCheckout(order.redirectUrl); // leaves the page; keep the button disabled
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PAYMENT_GATEWAY_UNAVAILABLE') {
        setKey(crypto.randomUUID());
      }
      setError(e instanceof Error && e.message ? e.message : 'Gagal membuat pesanan. Coba lagi.');
      setPending(false);
    }
  }

  const rows: [string, string][] = [
    ['Paket', formatKoin(pkg.coins)],
    ['Harga', formatRupiah(pkg.priceIdr)],
    ['Biaya layanan', formatRupiah(0)],
  ];

  return (
    <>
      <p className="w-fit rounded-full bg-koin-surface px-3 py-1 text-xs font-bold text-koin-foreground">
        Mode Sandbox — tidak ada uang sungguhan
      </p>
      <dl className="flex flex-col rounded-xl bg-muted px-4 py-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b py-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-bold">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-3">
          <dt className="font-bold">Total bayar</dt>
          <dd className="text-right font-extrabold">{formatRupiah(pkg.priceIdr)}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        className="h-13 text-base font-extrabold"
        disabled={pending}
        onClick={() => void pay()}
      >
        {pending ? 'Memproses…' : 'Lanjut ke pembayaran'}
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Koin masuk setelah pembayaran dikonfirmasi oleh sistem. Kebijakan pengembalian: Perlu
        konfirmasi.
      </p>
    </>
  );
}
