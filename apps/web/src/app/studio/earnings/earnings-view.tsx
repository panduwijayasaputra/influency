'use client';

import { Coins, LockOpen, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  EARNINGS_ACTIVITY_TYPES,
  EARNINGS_PENDING_DAYS,
  type EarningsActivityItem,
  type EarningsActivityType,
  PAYOUT_MIN_IDR,
  type Payout,
  type PayoutStatus,
} from '@influency/shared';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ListEmpty, ListError } from '@/components/user-area/list-states';
import { fetchEarnings, fetchEarningsActivity } from '@/lib/api/earnings';
import { fetchPayoutAccounts } from '@/lib/api/payout-accounts';
import { ApiError } from '@/lib/api/errors';
import { cancelPayout, fetchPayouts } from '@/lib/api/payouts';
import { formatJakartaDate, formatRupiah } from '@/lib/format';
import { useLoaded } from '@/lib/use-loaded';
import { usePagedList } from '@/lib/use-paged-list';
import { cn } from '@/lib/utils';
import { PayoutRequestSheet } from './payout-request-sheet';

const TYPE_LABELS: Record<EarningsActivityType, string> = {
  all: 'Semua',
  subscription: 'Langganan',
  unlock: 'Unlock',
  tip: 'Tip',
};
const PAYOUT_LABELS: Record<PayoutStatus, string> = {
  REQUESTED: 'Diajukan',
  CANCELED: 'Dibatalkan',
  REJECTED: 'Ditolak',
  PAID_OUT: 'Dibayar',
};
const TYPE_ICONS = { subscription: UserPlus, unlock: LockOpen, tip: Coins } as const;
const TYPE_TINTS = {
  subscription: 'bg-accent text-primary-ink',
  unlock: 'bg-[#E8EEF8] text-[#33497A]',
  tip: 'bg-koin-surface text-koin-foreground',
} as const;

const title = (item: EarningsActivityItem) => {
  if (item.kind === 'REVERSAL') {
    return item.type === 'subscription'
      ? `Langganan dibatalkan · ${item.buyerName}`
      : `Dibatalkan · ${item.buyerName}`;
  }
  if (item.type === 'subscription') return `${item.buyerName} berlangganan`;
  if (item.type === 'unlock') return `${item.buyerName} membuka post`;
  return `${item.buyerName} mengirim tip`;
};
const signed = (idr: number) => (idr < 0 ? `−${formatRupiah(-idr)}` : `+${formatRupiah(idr)}`);

function ActivityRow({ item }: { item: EarningsActivityItem }) {
  const Icon = TYPE_ICONS[item.type];
  const fee = item.feeBps > 0 ? `biaya ${item.feeBps / 100}%` : 'tanpa biaya';
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          TYPE_TINTS[item.type],
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title(item)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatJakartaDate(item.occurredAt)} · {item.grossKoin} Koin · {fee}
          {item.postCaption ? ` · ${item.postCaption}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-bold">{signed(item.netIdr)}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-bold',
            item.status === 'AVAILABLE'
              ? 'bg-[#E6F4EA] text-[#1E6B3A]'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {item.status === 'AVAILABLE' ? 'Tersedia' : 'Tertunda'}
        </span>
      </div>
    </li>
  );
}

function PayoutRow({ payout, onCancel }: { payout: Payout; onCancel: (payout: Payout) => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{formatRupiah(payout.amountIdr)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatJakartaDate(payout.requestedAt)} · {payout.destination.bankName} ••••{' '}
          {payout.destination.last4}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
          {PAYOUT_LABELS[payout.status]}
        </span>
        {payout.status === 'REQUESTED' && (
          <button
            type="button"
            onClick={() => onCancel(payout)}
            aria-label={`Batalkan pencairan ${formatRupiah(payout.amountIdr)}`}
            className="flex min-h-11 items-center px-1 text-xs font-bold text-primary-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Batalkan
          </button>
        )}
      </div>
    </li>
  );
}

/** Penghasilan (creator-studio US-056): balance, payout account, Riwayat and Pencairan. */
export function EarningsView() {
  const toast = useToast();
  const balance = useLoaded(fetchEarnings);
  const accounts = useLoaded(fetchPayoutAccounts);
  const payouts = useLoaded(fetchPayouts);
  const [type, setType] = useState<EarningsActivityType>('all');
  const [requesting, setRequesting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Payout | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Pages after the first, loaded with "Muat lagi"; dropped whenever the list is reloaded.
  const [older, setOlder] = useState<{ items: Payout[]; next: string | null } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const { items, status, loadingMore, retry, sentinelRef } = usePagedList<EarningsActivityItem>(
    (cursor) => fetchEarningsActivity({ type, cursor: cursor ?? undefined }),
    type,
  );

  const refresh = () => {
    setOlder(null);
    balance.reload();
    payouts.reload();
  };

  async function loadOlder(cursor: string) {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchPayouts(cursor);
      setOlder((current) => ({
        items: [...(current?.items ?? []), ...page.items],
        next: page.nextCursor,
      }));
    } catch {
      toast('Gagal memuat. Coba lagi.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    try {
      await cancelPayout(cancelTarget.id);
      toast('Pencairan dibatalkan');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Gagal membatalkan. Coba lagi.');
    } finally {
      setCancelling(false);
      setCancelTarget(null);
      refresh();
    }
  }

  // The cursor of the next page of payouts: after the extra pages, else the first page's.
  const firstPayouts = payouts.result.status === 'ready' ? payouts.result.data : null;
  const nextPayoutCursor = firstPayouts ? (older ? older.next : firstPayouts.nextCursor) : null;

  const active =
    accounts.result.status === 'ready' ? accounts.result.data.find((a) => a.active) : undefined;
  const available = balance.result.status === 'ready' ? balance.result.data.availableIdr : 0;
  const belowMinimum = available < PAYOUT_MIN_IDR;
  const canRequest =
    balance.result.status === 'ready' &&
    accounts.result.status === 'ready' &&
    !belowMinimum &&
    !!active;
  const hint = belowMinimum
    ? `Minimal pencairan ${formatRupiah(PAYOUT_MIN_IDR)}.`
    : !active && accounts.result.status === 'ready'
      ? 'Tambahkan rekening pencairan dulu.'
      : undefined;

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Saldo" className="rounded-2xl border bg-card p-5">
        {balance.result.status === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Penghasilan belum bisa dimuat.</p>
            <Button type="button" variant="outline" onClick={balance.retry}>
              Coba lagi
            </Button>
          </div>
        ) : balance.result.status === 'loading' ? (
          <div
            aria-busy="true"
            aria-label="Memuat saldo"
            className="h-24 animate-pulse rounded-xl bg-muted"
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Saldo tersedia</p>
            <p className="text-3xl font-extrabold tracking-tight">
              {formatRupiah(balance.result.data.availableIdr)}
            </p>
            {balance.result.data.pendingIdr > 0 && (
              <p className="mt-2 text-sm">
                <span className="font-semibold">Tertunda</span>{' '}
                {formatRupiah(balance.result.data.pendingIdr)}
                {balance.result.data.nextMaturityAt && (
                  <span className="text-muted-foreground">
                    {' '}
                    · Tersedia mulai {formatJakartaDate(balance.result.data.nextMaturityAt)}
                  </span>
                )}
              </p>
            )}
            {balance.result.data.reservedIdr > 0 && (
              <p className="mt-1 text-sm">
                <span className="font-semibold">Dalam pencairan</span>{' '}
                {formatRupiah(balance.result.data.reservedIdr)}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Penghasilan tertunda selama {EARNINGS_PENDING_DAYS} hari sebelum bisa dicairkan.
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-4 w-full"
              disabled={!canRequest}
              aria-describedby={hint ? 'payout-hint' : undefined}
              onClick={() => setRequesting(true)}
            >
              Ajukan pencairan
            </Button>
            {hint && (
              <p id="payout-hint" className="mt-2 text-center text-xs text-muted-foreground">
                {hint}
              </p>
            )}
          </>
        )}
      </section>

      <section aria-label="Rekening pencairan" className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Rekening pencairan</h2>
          {active && (
            <span className="rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[11px] font-bold text-[#1E6B3A]">
              Aktif
            </span>
          )}
        </div>
        {accounts.result.status === 'error' ? (
          <p role="alert" className="mt-2 text-sm text-muted-foreground">
            Rekening belum bisa dimuat.
          </p>
        ) : active ? (
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {active.bankName} •••• {active.last4}
              </p>
              <p className="text-xs text-muted-foreground">a.n. {active.holderName}</p>
            </div>
            <Link
              href="/studio/payout-accounts?from=earnings"
              className="flex min-h-11 items-center px-2 text-sm font-bold text-primary-ink"
            >
              Kelola
            </Link>
          </div>
        ) : accounts.result.status === 'ready' ? (
          <div className="mt-2 flex items-center gap-3">
            <p className="flex-1 text-sm text-muted-foreground">Belum ada rekening</p>
            <Link
              href="/studio/payout-accounts?from=earnings"
              className="flex min-h-11 items-center px-2 text-sm font-bold text-primary-ink"
            >
              Tambah rekening
            </Link>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-base font-extrabold">
          Riwayat
        </h2>
        <div role="group" aria-label="Filter riwayat" className="flex gap-2 overflow-x-auto">
          {EARNINGS_ACTIVITY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={t === type}
              onClick={() => setType(t)}
              className={cn(
                'h-11 shrink-0 rounded-full border px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                t === type
                  ? 'border-foreground bg-foreground text-background'
                  : 'bg-card text-foreground',
              )}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {status === 'error' ? (
          <ListError onRetry={retry} />
        ) : status === 'loading' ? (
          <div
            aria-busy="true"
            aria-label="Memuat riwayat"
            className="h-40 animate-pulse rounded-2xl bg-muted"
          />
        ) : items.length === 0 ? (
          <ListEmpty title="Belum ada penghasilan." />
        ) : (
          <>
            <ul className="flex flex-col divide-y rounded-2xl border bg-card">
              {items.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </ul>
            <div ref={sentinelRef} aria-hidden />
            {loadingMore && <p className="text-center text-sm text-muted-foreground">Memuat…</p>}
          </>
        )}
      </section>

      <section aria-labelledby="payouts-heading" className="flex flex-col gap-3">
        <h2 id="payouts-heading" className="text-base font-extrabold">
          Pencairan
        </h2>
        {payouts.result.status === 'error' ? (
          <ListError onRetry={payouts.retry} />
        ) : payouts.result.status === 'loading' ? (
          <div
            aria-busy="true"
            aria-label="Memuat pencairan"
            className="h-20 animate-pulse rounded-2xl bg-muted"
          />
        ) : payouts.result.data.items.length === 0 ? (
          <ListEmpty title="Belum ada pencairan." />
        ) : (
          <>
            <ul className="flex flex-col divide-y rounded-2xl border bg-card">
              {[...payouts.result.data.items, ...(older?.items ?? [])].map((p) => (
                <PayoutRow key={p.id} payout={p} onCancel={setCancelTarget} />
              ))}
            </ul>
            {nextPayoutCursor && (
              <Button
                type="button"
                variant="outline"
                disabled={loadingOlder}
                onClick={() => void loadOlder(nextPayoutCursor)}
              >
                {loadingOlder ? 'Memuat…' : 'Muat lagi'}
              </Button>
            )}
          </>
        )}
      </section>

      <PayoutRequestSheet
        open={requesting}
        onOpenChange={setRequesting}
        availableIdr={available}
        onRequested={refresh}
        onStale={balance.reload}
      />
      <BottomSheet
        title="Batalkan pencairan?"
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <p className="text-sm text-muted-foreground">
          Saldo {cancelTarget ? formatRupiah(cancelTarget.amountIdr) : ''} kembali tersedia.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setCancelTarget(null)}
          >
            Tidak
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={cancelling}
            onClick={() => void confirmCancel()}
          >
            Ya, batalkan
          </Button>
        </div>
      </BottomSheet>

      <p className="text-xs text-muted-foreground">
        Jumlah ditampilkan setelah biaya platform: 15% langganan, 20% unlock, 0% tip. 1 Koin =
        Rp1.000.
      </p>
    </div>
  );
}
