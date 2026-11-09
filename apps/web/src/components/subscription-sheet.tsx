'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { ERRORS, type CreatorSubscriptionState } from '@influency/shared';
import { PurchaseSheet } from '@/components/purchase-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/errors';
import { cancelScheduledRenewal, subscribeCreator } from '@/lib/api/purchases';
import { formatJakartaDate } from '@/lib/format';

type Plan = NonNullable<CreatorSubscriptionState['plan']>;
type Viewer = NonNullable<CreatorSubscriptionState['viewer']>;

/** Langganan sheet for a viewer without an active period (also in the locked comments sheet). */
export function SubscribeSheet({
  slug,
  creatorName,
  plan,
  returnPath,
  trigger,
}: {
  slug: string;
  creatorName: string;
  plan: Plan;
  returnPath: string;
  trigger: ReactNode;
}) {
  const toast = useToast();
  const router = useRouter();
  return (
    <PurchaseSheet
      trigger={trigger}
      kicker="Langganan kreator"
      title={creatorName}
      rows={[
        ['Masa aktif', `${plan.durationDays} hari`],
        ['Perpanjangan', 'Manual'],
      ]}
      priceCoins={plan.priceCoins}
      ctaLabel={`Langganan dengan ${plan.priceCoins} Koin`}
      returnPath={returnPath}
      onConfirm={async (key, price) => {
        const period = await subscribeCreator(slug, price, key);
        toast(`Langganan aktif sampai ${formatJakartaDate(period.endsAt)}`);
        router.refresh();
      }}
    />
  );
}

/** Sheet behind "Berlangganan": prepay the next period early, or see and cancel the prepaid one. */
export function SubscriptionManageSheet({
  slug,
  creatorName,
  plan,
  viewer,
  returnPath,
  trigger,
}: {
  slug: string;
  creatorName: string;
  plan: Plan;
  viewer: Viewer;
  returnPath: string;
  trigger: ReactNode;
}) {
  const current = viewer.current!;
  const scheduled = viewer.scheduled;
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!scheduled) {
    return (
      <PurchaseSheet
        trigger={trigger}
        kicker="Berlangganan"
        title={creatorName}
        rows={[
          ['Aktif sampai', formatJakartaDate(current.endsAt)],
          ['Periode berikutnya mulai', formatJakartaDate(current.endsAt)],
          ['Perpanjangan', 'Manual, tidak otomatis'],
        ]}
        priceCoins={plan.priceCoins}
        ctaLabel={`Perpanjang lebih awal · ${plan.priceCoins} Koin`}
        returnPath={returnPath}
        onConfirm={async (key, price) => {
          const period = await subscribeCreator(slug, price, key);
          toast(`Perpanjangan dijadwalkan mulai ${formatJakartaDate(period.startsAt)}`);
          router.refresh();
        }}
      >
        <p className="text-center text-xs text-muted-foreground">
          Harga baru untuk perpanjangan: Perlu konfirmasi
        </p>
      </PurchaseSheet>
    );
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const out = await cancelScheduledRenewal(scheduled!.periodId);
      toast(`${out.refundedCoins} Koin dikembalikan`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (ERRORS[e.code as keyof typeof ERRORS]?.message ?? e.message)
          : 'Terjadi kesalahan. Coba lagi.',
      );
      if (e instanceof ApiError && e.code === 'RENEWAL_ALREADY_STARTED') router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      trigger={trigger}
      title={creatorName}
      eyebrow="Berlangganan"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setAsking(false);
          setError(null);
        }
      }}
    >
      <dl className="flex flex-col rounded-xl bg-muted px-4 py-1 text-sm">
        <div className="flex justify-between gap-4 border-b py-3">
          <dt className="text-muted-foreground">Aktif sampai</dt>
          <dd className="font-bold">{formatJakartaDate(current.endsAt)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Perpanjangan terjadwal</dt>
          <dd className="text-right font-bold">
            {formatJakartaDate(scheduled.startsAt)} – {formatJakartaDate(scheduled.endsAt)} ·{' '}
            {scheduled.priceCoins} Koin
          </dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      {asking ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">
            Batalkan dan kembalikan {scheduled.priceCoins} Koin?
          </p>
          <Button
            variant="destructive"
            className="h-12"
            disabled={busy}
            onClick={() => void cancel()}
          >
            {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : 'Ya, batalkan'}
          </Button>
          <Button
            variant="outline"
            className="h-12"
            disabled={busy}
            onClick={() => setAsking(false)}
          >
            Batal
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="h-12" onClick={() => setAsking(true)}>
          Batalkan perpanjangan
        </Button>
      )}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Dibatalkan sebelum dimulai, seluruh Koin kembali. Setelah dimulai tidak bisa dibatalkan.
      </p>
    </BottomSheet>
  );
}
