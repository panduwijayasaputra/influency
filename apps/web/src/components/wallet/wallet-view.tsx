'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CoinPackage, TopupOrder, WalletTransaction } from '@influency/shared';
import { Button } from '@/components/ui/button';
import {
  fetchCoinPackages,
  fetchPendingTopups,
  fetchWallet,
  fetchWalletTransactions,
} from '@/lib/api/wallet';
import { formatKoin, formatRupiah } from '@/lib/format';
import { rememberReturnTo } from '@/lib/return-after-topup';
import { BalanceCard } from './balance-card';
import { PackagePicker } from './package-picker';
import { TopupSheet } from './topup-sheet';
import { WalletActivity } from './wallet-activity';

type Loaded = {
  balance: number;
  packages: CoinPackage[];
  pending: TopupOrder[];
  items: WalletTransaction[];
  cursor: string | null;
};

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat dompet" className="flex animate-pulse flex-col gap-4">
      <div className="h-32 rounded-[20px] bg-muted" />
      <div className="h-6 w-24 rounded bg-muted" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-13 rounded-[14px] bg-muted" />
    </div>
  );
}

/** Dompet: balance, Beli Koin and activity (US-027). Data comes from `lib/api/wallet`. */
export function WalletView() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [buying, setBuying] = useState<CoinPackage | null>(null);
  const inFlight = useRef(false);

  // Where "Isi Koin" in a purchase sheet came from, for the status page after paying.
  useEffect(() => rememberReturnTo(window.location.search), []);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      Promise.all([
        fetchWallet(),
        fetchCoinPackages(),
        fetchWalletTransactions(null),
        fetchPendingTopups().catch(() => [] as TopupOrder[]), // a bonus: never blocks the page
      ]).then(
        ([wallet, packages, page, pending]) => {
          if (cancelled) return;
          setFailed(false);
          setData({
            balance: wallet.balanceCoins,
            packages,
            pending,
            items: page.items,
            cursor: page.nextCursor,
          });
        },
        () => !cancelled && setFailed(true),
      );
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [attempt]);

  const loadMore = async () => {
    if (inFlight.current || !data?.cursor) return;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchWalletTransactions(data.cursor);
      setMoreFailed(false);
      setData((d) =>
        d
          ? {
              ...d,
              items: [...d.items, ...page.items.filter((i) => !d.items.some((o) => o.id === i.id))],
              cursor: page.nextCursor,
            }
          : d,
      );
    } catch {
      setMoreFailed(true);
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
  };

  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm">Gagal memuat dompet.</p>
        <Button
          variant="outline"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Coba lagi
        </Button>
      </div>
    );
  }
  if (!data) return <Skeleton />;

  return (
    <div className="flex flex-col gap-6">
      <BalanceCard balance={data.balance} />
      {data.pending.length > 0 && (
        <section aria-labelledby="menunggu" className="flex flex-col gap-2">
          <h2 id="menunggu" className="text-base font-extrabold">
            Menunggu pembayaran
          </h2>
          <ul className="flex flex-col gap-2">
            {data.pending.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/wallet/topups/${o.id}`}
                  className="flex min-h-11 items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm font-semibold"
                >
                  <span>Isi ulang · {formatKoin(o.coins)}</span>
                  <span className="text-muted-foreground">{formatRupiah(o.totalIdr)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <PackagePicker packages={data.packages} onBuy={setBuying} />
      <TopupSheet pkg={buying} onClose={() => setBuying(null)} />
      <WalletActivity
        items={data.items}
        hasMore={data.cursor !== null}
        loadingMore={loadingMore}
        loadError={moreFailed}
        onLoadMore={() => void loadMore()}
      />
    </div>
  );
}
