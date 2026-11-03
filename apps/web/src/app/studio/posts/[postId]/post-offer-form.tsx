'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  errorResponseSchema,
  POST_OFFER_MAX_DURATION_DAYS,
  POST_OFFER_MAX_PRICE_COINS,
  POST_OFFER_MIN_DURATION_DAYS,
  POST_OFFER_MIN_PRICE_COINS,
  type PostOffer,
  SECONDS_PER_DAY,
  setPostOfferSchema,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { byField } from '../post-form';

type Field = 'priceCoins' | 'durationDays';

/** Price and access period of a premium post. Each change becomes a new offer version on the server. */
export function PostOfferForm({ postId, offer }: { postId: string; offer: PostOffer | null }) {
  const router = useRouter();
  const [price, setPrice] = useState(offer ? String(offer.priceCoins) : '');
  const [days, setDays] = useState(
    offer ? String(Math.floor(offer.durationSeconds / SECONDS_PER_DAY)) : '',
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    setSaved(false);
    const parsed = setPostOfferSchema.safeParse({
      priceCoins: Number(price),
      durationDays: Number(days),
    });
    if (!parsed.success) {
      setErrors(
        byField<Field>(parsed.error.issues.map((i) => ({ ...i, path: String(i.path[0]) }))),
      );
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await fetch(`/api/v1/creators/me/posts/${postId}/offer`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const { error } = errorResponseSchema.parse(await res.json());
        if (error.code === 'VALIDATION_FAILED') {
          setErrors(
            byField<Field>((error.details?.issues ?? []) as { path: string; message: string }[]),
          );
        } else {
          setFormError(error.message);
        }
      }
    } catch {
      setFormError('Gagal menyimpan harga. Silakan coba lagi.');
    }
    setPending(false);
  }

  const field = (
    id: Field,
    label: string,
    value: string,
    set: (v: string) => void,
    min: number,
    max: number,
  ) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => {
          setSaved(false);
          set(e.target.value);
        }}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `${id}-error` : undefined}
      />
      {errors[id] && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {errors[id]}
        </p>
      )}
    </div>
  );

  return (
    <section aria-labelledby="offer-heading" className="flex flex-col gap-3">
      <h2 id="offer-heading" className="text-lg font-semibold">
        Harga &amp; Akses
      </h2>
      <p className="text-sm text-muted-foreground">
        {offer
          ? `Versi ${offer.version}: ${offer.priceCoins} Koin · ${Math.floor(offer.durationSeconds / SECONDS_PER_DAY)} hari`
          : 'Belum ada harga. Post Premium perlu harga sebelum dipublikasikan.'}
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        {field(
          'priceCoins',
          'Harga (Koin)',
          price,
          setPrice,
          POST_OFFER_MIN_PRICE_COINS,
          POST_OFFER_MAX_PRICE_COINS,
        )}
        {field(
          'durationDays',
          'Durasi akses (hari)',
          days,
          setDays,
          POST_OFFER_MIN_DURATION_DAYS,
          POST_OFFER_MAX_DURATION_DAYS,
        )}
        <p className="text-sm text-muted-foreground">
          Perubahan harga dan durasi hanya berlaku untuk pembelian berikutnya.
        </p>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-muted-foreground">
            Tersimpan.
          </p>
        )}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? 'Menyimpan…' : 'Simpan harga'}
        </Button>
      </form>
    </section>
  );
}
