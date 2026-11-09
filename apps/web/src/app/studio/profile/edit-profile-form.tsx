'use client';

import { Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import {
  type CreatorProfileResponse,
  creatorProfileResponseSchema,
  KOIN_TO_IDR,
  PLAN_PRICE_MAX,
  PLAN_PRICE_MIN,
  subscriptionCreatorShareIdr,
  SUBSCRIPTION_FEE_BPS,
  updateCreatorProfileSchema,
} from '@influency/shared';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ApiError, sendJson } from '@/lib/api/errors';
import { saveOwnPlan } from '@/lib/api/own-subscription-plan';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { refreshOwnPublicProfile } from './actions';
import { ProfileImageInput } from './profile-image-input';

type Field = 'displayName' | 'bio' | 'category' | 'price';
type Values = Record<Field, string>;
type FieldErrors = Partial<Record<Field, string>>;

const BIO_MAX = 500;
const PRICE_ERROR = `Masukkan angka bulat ${PLAN_PRICE_MIN}–${PLAN_PRICE_MAX.toLocaleString('id-ID')} Koin.`;
const FEE_PERCENT = SUBSCRIPTION_FEE_BPS / 100;

/** A whole-Koin plan price in the LOCKED range, or null ("9", "5001", "12.5", "abc", ""). */
export function parsePlanPrice(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const n = Number(input.trim());
  return n >= PLAN_PRICE_MIN && n <= PLAN_PRICE_MAX ? n : null;
}

/** First message per field from the API's validation issues. */
function issueErrors(details: Record<string, unknown> | null): FieldErrors {
  const errors: FieldErrors = {};
  const issues = (details?.issues ?? []) as { path: string; message: string }[];
  for (const { path, message } of issues) {
    if (path === 'displayName' || path === 'bio' || path === 'category') errors[path] ??= message;
  }
  return errors;
}

/**
 * Edit Profil (creator-studio US-055). Images upload as soon as they are picked; the text fields and the plan price
 * are saved together, sending only what changed: PATCH /creators/me, then PUT /creators/me/subscription-plan.
 * The address is read-only so links already in bios keep working.
 */
export function EditProfileForm({
  profile,
  plan,
}: {
  profile: CreatorProfileResponse;
  /** null = the creator never set a plan; the price stays optional then. */
  plan: { priceCoins: number; active: boolean } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const initial: Values = {
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    category: profile.category ?? '',
    price: plan ? String(plan.priceCoins) : '',
  };
  // What the server has; a retry after a partial save only sends what still differs.
  const [base, setBase] = useState<Values>(initial);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const fields: Field[] = ['displayName', 'bio', 'category', 'price'];
  const dirty = fields.some((f) => values[f] !== base[f]);
  const price = parsePlanPrice(values.price);
  // Empty is fine only while there is no plan to keep.
  const priceInvalid = values.price.trim() !== '' ? price === null : plan !== null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (field: Field, value: string) => setValues((v) => ({ ...v, [field]: value }));

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(`https://influency.com/${profile.slug}`);
      toast('Tautan disalin');
    } catch {
      toast('Tautan belum bisa disalin.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    if (priceInvalid) {
      setErrors({ price: PRICE_ERROR });
      return;
    }
    const profileChanges: Partial<Record<'displayName' | 'bio' | 'category', string>> = {};
    for (const f of ['displayName', 'bio', 'category'] as const) {
      if (values[f] !== base[f]) profileChanges[f] = values[f];
    }
    const hasProfileChanges = Object.keys(profileChanges).length > 0;
    if (hasProfileChanges) {
      const parsed = updateCreatorProfileSchema.safeParse(profileChanges);
      if (!parsed.success) {
        const local: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0]) as Field;
          local[key] ??= issue.message;
        }
        setErrors(local);
        return;
      }
    }
    setErrors({});
    setPending(true);
    try {
      let next = base;
      if (hasProfileChanges) {
        const saved = await sendJson('PATCH', '/creators/me', creatorProfileResponseSchema, {
          body: profileChanges,
        });
        next = {
          ...next,
          displayName: saved.displayName,
          bio: saved.bio ?? '',
          category: saved.category ?? '',
        };
        setBase(next);
        setValues((v) => ({
          ...v,
          displayName: saved.displayName,
          bio: saved.bio ?? '',
          category: saved.category ?? '',
        }));
      }
      if (price !== null && values.price.trim() !== base.price) {
        await saveOwnPlan({ priceCoins: price, active: plan?.active ?? true });
        next = { ...next, price: String(price) };
        setBase(next);
      }
      await refreshOwnPublicProfile();
      toast('Profil diperbarui');
      router.push(`/${profile.slug}`);
      return; // keep the button disabled while navigating
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = err.code === 'VALIDATION_FAILED' ? issueErrors(err.details) : {};
        if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
        else setFormError(err.message);
      } else {
        setFormError('Gagal menyimpan profil. Silakan coba lagi.');
      }
    }
    setPending(false);
  }

  function cancel() {
    if (dirty) setLeaving(true);
    else router.back();
  }

  const fieldProps = (field: Field) => ({
    id: field,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  });
  const fieldError = (field: Field) =>
    errors[field] && (
      <p id={`${field}-error`} className="text-sm text-destructive">
        {errors[field]}
      </p>
    );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6 pb-28">
      <div className="flex flex-col gap-4">
        <ProfileImageInput kind="banner" label="Sampul profil" url={profile.bannerUrl} />
        <ProfileImageInput kind="avatar" label="Foto profil" url={profile.avatarUrl} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Alamat profil</p>
        <div className="flex items-center gap-2 rounded-xl border bg-muted px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-base">influency.com/{profile.slug}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyAddress()}
            aria-label="Salin tautan profil"
          >
            <Copy aria-hidden className="size-4" />
            Salin
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Alamat profil tidak bisa diubah.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Nama tampilan</Label>
        <Input
          {...fieldProps('displayName')}
          value={values.displayName}
          onChange={(e) => set('displayName', e.target.value)}
          maxLength={60}
        />
        {fieldError('displayName')}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio (opsional)</Label>
        <Textarea
          {...fieldProps('bio')}
          value={values.bio}
          onChange={(e) => set('bio', e.target.value)}
          rows={4}
        />
        <p
          className={cn(
            'text-right text-xs',
            values.bio.length > BIO_MAX ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {values.bio.length}/{BIO_MAX}
        </p>
        {fieldError('bio')}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Kategori (opsional)</Label>
        <Input
          {...fieldProps('category')}
          value={values.category}
          onChange={(e) => set('category', e.target.value)}
          maxLength={50}
        />
        {fieldError('category')}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="price">Harga langganan (Koin per 30 hari)</Label>
        <Input
          {...fieldProps('price')}
          inputMode="numeric"
          value={values.price}
          onChange={(e) => set('price', e.target.value)}
          aria-describedby="price-help"
        />
        <p
          id="price-help"
          className={cn('text-sm', priceInvalid ? 'text-destructive' : 'text-muted-foreground')}
        >
          {price !== null
            ? `≈ ${formatRupiah(price * KOIN_TO_IDR)} per 30 hari · kamu terima ≈ ${formatRupiah(subscriptionCreatorShareIdr(price, KOIN_TO_IDR))} setelah biaya platform ${FEE_PERCENT}%`
            : PRICE_ERROR}
        </p>
        {errors.price && (
          <p role="alert" className="text-sm text-destructive">
            {errors.price}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Harga baru berlaku untuk langganan berikutnya.
        </p>
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card px-4 py-3">
        <div className="mx-auto flex max-w-md gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={cancel}
            className="flex-1"
          >
            Batal
          </Button>
          <Button type="submit" size="lg" disabled={pending || !dirty} className="flex-1">
            {pending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </div>

      <BottomSheet title="Buang perubahan?" open={leaving} onOpenChange={setLeaving}>
        <p className="text-sm text-muted-foreground">Perubahan yang belum disimpan akan hilang.</p>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setLeaving(false)}
          >
            Lanjut mengedit
          </Button>
          <Button type="button" className="flex-1" onClick={() => router.back()}>
            Buang
          </Button>
        </div>
      </BottomSheet>
    </form>
  );
}
