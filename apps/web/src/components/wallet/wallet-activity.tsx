import Link from 'next/link';
import type { WalletTransaction } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { formatJakartaDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const TITLES: Record<WalletTransaction['type'], (t: WalletTransaction) => string> = {
  TOPUP_CREDIT: (t) => `Isi ulang · ${t.amountCoins} Koin`,
  POST_PURCHASE_DEBIT: (t) => (t.detail ? `Buka post · ${t.detail}` : 'Buka post'),
  SUBSCRIPTION_DEBIT: (t) => (t.detail ? `Langganan · ${t.detail}` : 'Langganan'),
  TIP_DEBIT: (t) => (t.detail ? `Tip · ${t.detail}` : 'Tip'),
  SUBSCRIPTION_REFUND_CREDIT: (t) =>
    t.detail ? `Perpanjangan dibatalkan · ${t.detail}` : 'Perpanjangan dibatalkan',
};

type Props = {
  items: WalletTransaction[];
  hasMore: boolean;
  loadingMore: boolean;
  loadError: boolean;
  onLoadMore: () => void;
};

/** Aktivitas: signed ledger entries, newest first (Asia/Jakarta dates). */
export function WalletActivity({ items, hasMore, loadingMore, loadError, onLoadMore }: Props) {
  return (
    <section aria-labelledby="aktivitas" className="flex flex-col gap-2.5">
      <h2 id="aktivitas" className="text-base font-extrabold">
        Aktivitas
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-2xl border bg-card">
          {items.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-col">
                {t.href ? (
                  <Link href={t.href} className="truncate text-sm font-semibold hover:underline">
                    {TITLES[t.type](t)}
                  </Link>
                ) : (
                  <span className="truncate text-sm font-semibold">{TITLES[t.type](t)}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatJakartaDate(t.createdAt)}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-sm font-extrabold',
                  t.amountCoins > 0 ? 'text-success' : 'text-foreground',
                )}
              >
                {t.amountCoins > 0 ? '+' : '−'}
                {Math.abs(t.amountCoins)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          Gagal memuat aktivitas.
        </p>
      )}
      {hasMore && (
        <Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Memuat…' : loadError ? 'Coba lagi' : 'Muat lagi'}
        </Button>
      )}
    </section>
  );
}
