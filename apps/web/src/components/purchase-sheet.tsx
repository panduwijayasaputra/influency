'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useRef, useState } from 'react';
import { ERRORS } from '@influency/shared';
import { KoinIcon } from '@/components/koin';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { PostCardPost } from '@/components/post-card/post-card';
import { ApiError } from '@/lib/api/errors';
import { purchasePost } from '@/lib/api/purchases';
import { useWalletBalance } from '@/lib/use-wallet-balance';

type Phase = 'idle' | 'confirming' | 'error';

/** Dompet link that brings the user back to `returnPath` after a top-up. */
export const walletHref = (returnPath: string) =>
  `/wallet?returnTo=${encodeURIComponent(returnPath)}`;

/**
 * Bottom sheet confirming a Koin purchase (post unlock or subscription): price, terms, balance and the result.
 * One Idempotency-Key per opening, kept across retries; a changed price (OFFER_CHANGED) asks again with a new key.
 * `onConfirm` does the spend and its follow-up (toast, refresh); it rejects with an ApiError on failure.
 */
export function PurchaseSheet({
  trigger,
  kicker,
  title,
  rows,
  priceCoins,
  ctaLabel,
  returnPath,
  onConfirm,
  disclosure,
  children,
}: {
  trigger: ReactNode;
  kicker: string;
  title: string;
  rows: [label: string, value: string][];
  priceCoins: number;
  ctaLabel: string;
  /** Where the user returns to after topping up. */
  returnPath: string;
  onConfirm: (idempotencyKey: string, priceCoins: number) => Promise<void>;
  disclosure?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState<number | null>(null);
  const [serverShort, setServerShort] = useState<number | null>(null);
  const keyRef = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const { balance } = useWalletBalance(open);
  const price = newPrice ?? priceCoins;
  const shortBy = serverShort ?? (balance !== null && balance < price ? price - balance : null);

  function onOpenChange(next: boolean) {
    if (next) {
      keyRef.current = crypto.randomUUID();
      setPhase('idle');
      setMessage(null);
      setNewPrice(null);
      setServerShort(null);
    }
    setOpen(next);
  }

  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setPhase('confirming');
    setMessage(null);
    try {
      await onConfirm(keyRef.current, price);
      setOpen(false);
    } catch (e) {
      setPhase('error');
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_COINS') {
        const d = e.details as { required?: number; available?: number } | null;
        setServerShort(Math.max(1, (d?.required ?? price) - (d?.available ?? 0)));
      } else if (e instanceof ApiError && e.code === 'OFFER_CHANGED') {
        const p = (e.details as { priceCoins?: number } | null)?.priceCoins;
        if (typeof p === 'number') {
          setNewPrice(p);
          keyRef.current = crypto.randomUUID(); // a different payload needs a different key
        }
        setMessage(
          p === undefined ? ERRORS.OFFER_CHANGED.message : `Harga berubah menjadi ${p} Koin.`,
        );
      } else {
        const known = e instanceof ApiError ? ERRORS[e.code as keyof typeof ERRORS] : undefined;
        setMessage(known?.message ?? 'Terjadi kesalahan. Coba lagi.');
      }
    } finally {
      busy.current = false;
    }
  }

  return (
    <BottomSheet
      trigger={trigger}
      title={title}
      eyebrow={kicker}
      open={open}
      onOpenChange={onOpenChange}
    >
      <dl className="flex flex-col rounded-xl bg-muted px-4 py-1 text-sm">
        {[...rows, ['Harga', `${price} Koin`] as const].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b py-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-bold">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Saldo kamu</dt>
          <dd className="flex items-center gap-1.5 font-bold">
            <KoinIcon />
            {balance === null ? '…' : balance} Koin
          </dd>
        </div>
      </dl>

      {disclosure && (
        <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          {disclosure}
        </p>
      )}
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
          disabled={balance === null || phase === 'confirming'}
          aria-busy={phase === 'confirming'}
          onClick={() => void confirm()}
        >
          {phase === 'confirming' ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : phase === 'error' && newPrice === null ? (
            'Coba lagi'
          ) : newPrice !== null ? (
            `Lanjutkan · ${price} Koin`
          ) : (
            ctaLabel
          )}
        </Button>
      )}
      {children}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Koin langsung terpotong dan tidak bisa dikembalikan. Harga dikunci saat pembelian.
      </p>
    </BottomSheet>
  );
}

/** Unlock sheet for a locked premium post (shared by the PostCard and the locked comments sheet). */
export function PostUnlockSheet({
  post,
  creatorName,
  returnPath,
  subscribedToCreator = false,
  onUnlocked,
  trigger,
  children,
}: {
  post: Pick<PostCardPost, 'id' | 'caption' | 'offer'>;
  creatorName: string;
  returnPath: string;
  /** The viewer's Langganan already covers this post: show the disclosure. */
  subscribedToCreator?: boolean;
  /** Re-render the post as unlocked. */
  onUnlocked: () => void;
  trigger: ReactNode;
  children?: ReactNode;
}) {
  const toast = useToast();
  const price = post.offer?.priceCoins ?? 0;
  return (
    <PurchaseSheet
      trigger={trigger}
      kicker={`Post premium · ${creatorName}`}
      title={post.caption || 'Tanpa caption'}
      rows={[['Masa akses', 'Permanen']]}
      priceCoins={price}
      ctaLabel={`Buka dengan ${price} Koin`}
      returnPath={returnPath}
      disclosure={
        subscribedToCreator
          ? 'Kamu sudah bisa melihat post ini lewat Langganan. Membeli membuat aksesnya permanen, juga setelah langganan berakhir.'
          : undefined
      }
      onConfirm={async (key, p) => {
        try {
          await purchasePost(post.id, p, key);
        } catch (e) {
          if (!(e instanceof ApiError && e.code === 'ALREADY_ENTITLED')) throw e;
        }
        toast('Post terbuka');
        onUnlocked();
      }}
    >
      {children}
    </PurchaseSheet>
  );
}
