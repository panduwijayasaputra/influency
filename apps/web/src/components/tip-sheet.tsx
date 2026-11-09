'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useRef, useState } from 'react';
import { ERRORS, TIP_MAX, TIP_MIN, tipRequestSchema } from '@influency/shared';
import { KoinIcon } from '@/components/koin';
import { walletHref } from '@/components/purchase-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/errors';
import { sendTip } from '@/lib/api/purchases';
import { useWalletBalance } from '@/lib/use-wallet-balance';
import { cn, initials } from '@/lib/utils';

const PRESETS = [5, 10, 25, 50, 100];
const DEFAULT_AMOUNT = 10;

/** The tip amount, or null when it is not a whole number of Koin in range. `custom` wins over the preset. */
export function parseTipAmount(preset: number, custom: string): number | null {
  const raw = custom.trim() === '' ? preset : Number(custom);
  const parsed = tipRequestSchema.shape.amountCoins.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Kirim Tip sheet (layout is a design proposal: "Perlu konfirmasi"). Opened only where the server says the viewer may
 * tip (`viewer.canTip`); the API re-checks eligibility on send. One Idempotency-Key per amount attempt.
 */
export function TipSheet({
  creator,
  postId,
  returnPath,
  trigger,
}: {
  creator: { slug: string; displayName: string; avatarUrl: string | null };
  /** Set for a post tip; omitted for a profile tip. */
  postId?: string;
  returnPath: string;
  trigger: ReactNode;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(DEFAULT_AMOUNT);
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [serverShort, setServerShort] = useState<number | null>(null);
  const keyRef = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const { balance } = useWalletBalance(open);

  const amount = parseTipAmount(preset, custom);
  const invalid = amount === null;
  const shortBy =
    serverShort ?? (!invalid && balance !== null && balance < amount ? amount - balance : null);

  // A different amount is a different request, so it gets its own key.
  function changeAmount(nextPreset: number, nextCustom: string) {
    setPreset(nextPreset);
    setCustom(nextCustom);
    setMessage(null);
    setServerShort(null);
    keyRef.current = crypto.randomUUID();
  }

  function onOpenChange(next: boolean) {
    if (next) {
      setPreset(DEFAULT_AMOUNT);
      setCustom('');
      setMessage(null);
      setServerShort(null);
      keyRef.current = crypto.randomUUID();
    }
    setOpen(next);
  }

  async function send() {
    if (amount === null || busy.current) return;
    busy.current = true;
    setSending(true);
    setMessage(null);
    try {
      await sendTip(postId ? { postId } : { creatorSlug: creator.slug }, amount, keyRef.current);
      toast(`Tip ${amount} Koin terkirim ke ${creator.displayName}`);
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_COINS') {
        const d = e.details as { required?: number; available?: number } | null;
        setServerShort(Math.max(1, (d?.required ?? amount) - (d?.available ?? 0)));
      } else {
        const known = e instanceof ApiError ? ERRORS[e.code as keyof typeof ERRORS] : undefined;
        setMessage(known?.message ?? 'Terjadi kesalahan. Coba lagi.');
      }
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <BottomSheet
      trigger={trigger}
      title="Kirim Tip"
      eyebrow="Perlu konfirmasi · usulan desain"
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex items-center gap-3">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
          <img src={creator.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
          >
            {initials(creator.displayName)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-bold">{creator.displayName}</p>
          <p className="truncate text-sm text-muted-foreground">@{creator.slug}</p>
        </div>
      </div>

      <div role="group" aria-label="Jumlah tip" className="grid grid-cols-5 gap-1.5">
        {PRESETS.map((n) => {
          const selected = custom.trim() === '' && preset === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              onClick={() => changeAmount(n, '')}
              className={cn(
                'h-11 rounded-xl border text-sm font-bold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                selected ? 'border-primary bg-accent text-accent-foreground' : 'bg-card',
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Jumlah lain
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={custom}
          onChange={(e) => changeAmount(preset, e.target.value)}
          placeholder={`${TIP_MIN}–${TIP_MAX} Koin`}
          aria-invalid={invalid}
          className="h-11 rounded-xl border bg-card px-3 text-base font-normal focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </label>
      {invalid && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          Tip {TIP_MIN}–{TIP_MAX.toLocaleString('id-ID')} Koin, bilangan bulat.
        </p>
      )}

      <div className="flex justify-between gap-4 rounded-xl bg-muted px-4 py-3 text-sm">
        <span className="text-muted-foreground">Saldo kamu</span>
        <span className="flex items-center gap-1.5 font-bold">
          <KoinIcon />
          {balance === null ? '…' : balance} Koin
        </span>
      </div>

      {message && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {message}
        </p>
      )}

      {shortBy !== null ? (
        <Button asChild className="h-13 text-base font-extrabold">
          <Link href={walletHref(returnPath)}>Isi Koin · kurang {shortBy} Koin</Link>
        </Button>
      ) : (
        <Button
          className="h-13 text-base font-extrabold"
          disabled={invalid || balance === null || sending}
          aria-busy={sending}
          onClick={() => void send()}
        >
          {sending ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : message ? (
            'Coba lagi'
          ) : (
            `Kirim ${amount ?? ''} Koin`.trim()
          )}
        </Button>
      )}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Tip adalah ucapan terima kasih. Tip tidak membuka konten, dan Influency tidak memotong biaya
        tip.
      </p>
    </BottomSheet>
  );
}
