'use client';

import { CircleCheck, CircleX, Clock } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { type TopupOrder, type TopupStatus as Status } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { fetchTopup } from '@/lib/api/wallet';
import { formatKoin, formatRupiah } from '@/lib/format';
import { recallReturnTo } from '@/lib/return-after-topup';

const FAST_MS = 3000;
const SLOW_MS = 10_000;
const SLOW_AFTER_MS = 60_000;
const GIVE_UP_MS = 15 * 60_000;

const FAILURE_TITLES: Record<'FAILED' | 'EXPIRED' | 'CANCELED', string> = {
  FAILED: 'Pembayaran gagal',
  EXPIRED: 'Pembayaran kedaluwarsa',
  CANCELED: 'Pembayaran dibatalkan',
};

function Card({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'success' }) {
  return (
    <div
      aria-live="polite"
      className={`flex flex-col items-center gap-3 rounded-2xl border p-6 text-center ${tone === 'success' ? 'border-success/30 bg-success-surface' : 'bg-card'}`}
    >
      {children}
    </div>
  );
}

function Body({ order }: { order: TopupOrder }) {
  const status: Status = order.status;
  const returnTo = status === 'CREDITED' ? recallReturnTo() : null; // only rendered after the client fetch
  if (status === 'CREDITED') {
    return (
      <Card tone="success">
        <CircleCheck aria-hidden className="size-10 text-success" />
        <p className="text-lg font-extrabold">Berhasil! +{formatKoin(order.coins)}</p>
        {order.balanceCoins !== null && (
          <p className="text-sm">Saldo sekarang {formatKoin(order.balanceCoins)}</p>
        )}
        {returnTo && (
          <Button asChild className="mt-2 w-full">
            <Link href={returnTo}>Lanjutkan</Link>
          </Button>
        )}
        <Button asChild variant={returnTo ? 'outline' : 'default'} className="mt-2 w-full">
          <Link href="/wallet">Kembali ke Dompet</Link>
        </Button>
      </Card>
    );
  }
  if (status === 'UNDER_REVIEW') {
    return (
      <Card>
        <Clock aria-hidden className="size-10 text-muted-foreground" />
        <p className="text-lg font-extrabold">Pembayaran sedang ditinjau</p>
        <p className="text-sm text-muted-foreground">
          Koin akan masuk setelah pemeriksaan selesai.
        </p>
        <Button asChild variant="outline" className="mt-2 w-full">
          <Link href="/wallet">Kembali ke Dompet</Link>
        </Button>
      </Card>
    );
  }
  if (status === 'PENDING') {
    return (
      <Card>
        <Clock aria-hidden className="size-10 text-muted-foreground" />
        <p className="text-lg font-extrabold">Menunggu pembayaran</p>
        <p className="text-sm">
          {formatKoin(order.coins)} · {formatRupiah(order.totalIdr)}
        </p>
        <p className="text-xs text-muted-foreground">Status diperbarui otomatis.</p>
        {order.redirectUrl && (
          <Button asChild className="mt-2 w-full">
            <a href={order.redirectUrl}>Lanjutkan pembayaran</a>
          </Button>
        )}
      </Card>
    );
  }
  return (
    <Card>
      <CircleX aria-hidden className="size-10 text-destructive" />
      <p className="text-lg font-extrabold">{FAILURE_TITLES[status]}</p>
      <p className="text-sm text-muted-foreground">Tidak ada Koin yang ditagih ke saldo.</p>
      <Button asChild className="mt-2 w-full">
        <Link href="/wallet">Beli Koin lagi</Link>
      </Button>
    </Card>
  );
}

/** Status of one top-up order, polled from the server. Only the API's status is believed, never the URL. */
export function TopupStatus({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<TopupOrder | null | undefined>(undefined); // undefined = loading
  const [stale, setStale] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) {
        timer = setTimeout(() => void tick(), FAST_MS);
        return;
      }
      try {
        const next = await fetchTopup(orderId);
        if (cancelled) return;
        setStale(false);
        setOrder(next);
        if (next === null || next.status !== 'PENDING') return; // terminal or waiting for review
      } catch {
        if (cancelled) return;
        setStale(true);
      }
      const elapsed = Date.now() - started;
      if (elapsed > GIVE_UP_MS) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(() => void tick(), elapsed > SLOW_AFTER_MS ? SLOW_MS : FAST_MS);
    };
    timer = setTimeout(() => void tick(), 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId, round]);

  if (order === null) {
    return (
      <Card>
        <p className="text-lg font-extrabold">Pesanan tidak ditemukan.</p>
        <Button asChild variant="outline" className="mt-2 w-full">
          <Link href="/wallet">Kembali ke Dompet</Link>
        </Button>
      </Card>
    );
  }
  if (order === undefined) {
    return (
      <div aria-busy="true" aria-label="Memuat status" className="flex flex-col gap-3">
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        {stale && (
          <p role="status" className="text-sm text-muted-foreground">
            Gagal memperbarui. Mencoba lagi…
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Body order={order} />
      {stale && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          Gagal memperbarui. Mencoba lagi…
        </p>
      )}
      {gaveUp && (
        <Button
          variant="outline"
          onClick={() => {
            setGaveUp(false);
            setRound((n) => n + 1);
          }}
        >
          Muat ulang
        </Button>
      )}
    </div>
  );
}
