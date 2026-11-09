import { KOIN_TO_IDR } from '@influency/shared';
import { KoinIcon } from '@/components/koin';
import { formatRupiah } from '@/lib/format';

/** Saldo Koin on the koin surface (S13 Wallet artboard). */
export function BalanceCard({ balance }: { balance: number }) {
  return (
    <section
      aria-label="Saldo Koin"
      className="flex flex-col gap-1 rounded-[20px] border border-koin-border bg-koin-surface p-[18px] text-koin-foreground"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <KoinIcon className="size-[22px] text-xs" />
        Saldo Koin
      </p>
      <p className="text-4xl font-extrabold tracking-tight text-foreground">
        {new Intl.NumberFormat('id-ID').format(balance)}{' '}
        <span className="text-lg font-bold">Koin</span>
      </p>
      <p className="text-[13px] text-muted-foreground">
        ≈ {formatRupiah(balance * KOIN_TO_IDR)} · 1 Koin = Rp1.000
      </p>
    </section>
  );
}
