'use client';

import { useEffect, useRef, useState } from 'react';
import { PAYOUT_MIN_IDR, type Payout, type PayoutQuote } from '@influency/shared';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/errors';
import { quotePayout, requestPayout } from '@/lib/api/payouts';
import { formatRupiah } from '@/lib/format';

const QUOTE_DEBOUNCE_MS = 300;
/** Errors that mean "what you saw is out of date": refetch, ask again, and start a new attempt. */
const STALE_CODES = ['PAYOUT_FEE_CHANGED', 'PAYOUT_EXCEEDS_AVAILABLE'];

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={strong ? 'text-sm font-bold' : 'text-sm text-muted-foreground'}>{label}</dt>
      <dd className={strong ? 'text-base font-extrabold' : 'text-sm font-semibold'}>{children}</dd>
    </div>
  );
}

function SheetBody({
  availableIdr,
  onRequested,
  onStale,
  onClose,
}: {
  availableIdr: number;
  onRequested: (payout: Payout) => void;
  onStale: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [input, setInput] = useState(String(availableIdr));
  const [quote, setQuote] = useState<PayoutQuote | null>(null);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  // One Idempotency-Key per attempt: kept across retries of the same request, renewed when the request changes.
  const attempt = useRef(crypto.randomUUID());
  const submitting = useRef(false);

  const amount = /^\d+$/.test(input) ? Number(input) : null;
  const amountError =
    amount === null
      ? 'Masukkan jumlah dalam rupiah.'
      : amount < PAYOUT_MIN_IDR
        ? `Minimal pencairan ${formatRupiah(PAYOUT_MIN_IDR)}.`
        : amount > availableIdr
          ? `Melebihi saldo tersedia ${formatRupiah(availableIdr)}.`
          : undefined;

  useEffect(() => {
    if (amount === null || amountError) return;
    let current = true;
    const timer = setTimeout(() => {
      quotePayout(amount).then(
        (q) => {
          if (current) setQuote(q);
        },
        (err: unknown) => {
          if (current) {
            setError(
              err instanceof ApiError ? err.message : 'Biaya belum bisa dihitung. Coba lagi.',
            );
          }
        },
      );
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [amount, amountError, nonce]);

  const fresh = quote !== null && amount !== null && quote.amountIdr === amount ? quote : null;
  const tooSmall = fresh !== null && fresh.netIdr <= 0;
  const canConfirm = fresh !== null && !tooSmall && !amountError && !pending;

  function setAmount(value: string) {
    setInput(value.replace(/\D/g, ''));
    setError(undefined);
    attempt.current = crypto.randomUUID();
  }

  async function confirm() {
    if (!fresh || amount === null || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try {
      const payout = await requestPayout(
        { amountIdr: amount, expectedFeeIdr: fresh.feeIdr },
        attempt.current,
      );
      toast('Pencairan diajukan');
      onRequested(payout);
      onClose();
      return;
    } catch (err) {
      if (err instanceof ApiError && STALE_CODES.includes(err.code)) {
        setError(err.message);
        attempt.current = crypto.randomUUID();
        setQuote(null);
        setNonce((n) => n + 1);
        onStale();
      } else {
        setError(err instanceof ApiError ? err.message : 'Gagal mengajukan pencairan. Coba lagi.');
      }
    }
    submitting.current = false;
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="payout-amount">Jumlah pencairan (Rp)</Label>
        <div className="flex gap-2">
          <Input
            id="payout-amount"
            inputMode="numeric"
            autoComplete="off"
            value={input}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={amountError ? true : undefined}
            aria-describedby="payout-amount-help"
          />
          <Button type="button" variant="outline" onClick={() => setAmount(String(availableIdr))}>
            Semua
          </Button>
        </div>
        <p
          id="payout-amount-help"
          className={amountError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {amountError ??
            `${formatRupiah(amount ?? 0)} dari saldo tersedia ${formatRupiah(availableIdr)}`}
        </p>
      </div>

      {!amountError && !fresh && !error && (
        <p aria-busy="true" className="text-sm text-muted-foreground">
          Menghitung biaya…
        </p>
      )}

      {fresh && (
        <dl className="divide-y rounded-xl border px-4">
          <Row label="Biaya transfer">
            {formatRupiah(fresh.feeIdr)}
            {fresh.feeIsPlaceholder && (
              <span className="ml-2 rounded-full bg-koin-surface px-2 py-0.5 text-[11px] font-bold text-koin-foreground">
                Perlu konfirmasi
              </span>
            )}
          </Row>
          <Row label="Kamu terima" strong>
            {formatRupiah(Math.max(0, fresh.netIdr))}
          </Row>
          <div className="py-2 text-xs text-muted-foreground">
            Ke {fresh.destination.bankName} •••• {fresh.destination.last4} · a.n.{' '}
            {fresh.destination.holderName}
          </div>
        </dl>
      )}
      {tooSmall && (
        <p role="alert" className="text-sm text-destructive">
          Jumlah terlalu kecil setelah biaya transfer.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Diproses manual setiap Jumat hari kerja. Waktu masuk ke rekening tidak dijamin.
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" size="lg" disabled={!canConfirm} onClick={() => void confirm()}>
        {pending ? 'Mengajukan…' : 'Ajukan pencairan'}
      </Button>
    </div>
  );
}

/**
 * Ajukan pencairan (creator-studio US-058): the amount, the destination account, the transfer fee and what the
 * creator receives, before confirming. The fee always comes from the quote; the request sends the fee that was shown,
 * so a changed fee is caught instead of charged.
 */
export function PayoutRequestSheet({
  open,
  onOpenChange,
  availableIdr,
  onRequested,
  onStale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableIdr: number;
  onRequested: (payout: Payout) => void;
  /** The balance the sheet was opened with is out of date. */
  onStale: () => void;
}) {
  return (
    <BottomSheet title="Ajukan pencairan" open={open} onOpenChange={onOpenChange}>
      {/* Mounted per opening: a fresh amount, quote and Idempotency-Key every time. */}
      {open && (
        <SheetBody
          availableIdr={availableIdr}
          onRequested={onRequested}
          onStale={onStale}
          onClose={() => onOpenChange(false)}
        />
      )}
    </BottomSheet>
  );
}
