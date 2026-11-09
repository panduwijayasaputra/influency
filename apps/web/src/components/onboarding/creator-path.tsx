'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  type CreatorApplicationResponse,
  creatorApplicationSchema,
  KOIN_TO_IDR,
  PLAN_PRICE_MAX,
  PLAN_PRICE_MIN,
  subscriptionCreatorShareIdr,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitCreatorApplication } from '@/lib/api/creator-apply';
import { formatRupiah } from '@/lib/format';
import { cn, initials } from '@/lib/utils';
import { StepperFooter } from './stepper-footer';
import { StepperHeader } from './stepper-header';

export const CREATOR_STEPS = ['Profil', 'Langganan', 'Pencairan', 'Tinjau'] as const;
const PRESETS = [25, 50, 100, 150];
const PRICE_ERROR = 'Masukkan angka 10–5.000 Koin.';
const profileSchema = creatorApplicationSchema.pick({ displayName: true, slug: true, bio: true });

type ProfileField = 'displayName' | 'slug' | 'bio';

export function CreatorPath({
  initial,
  backHref,
}: {
  initial?: CreatorApplicationResponse;
  backHref: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [serverErrors, setServerErrors] = useState<Partial<Record<string, string>>>({});
  const [v, setV] = useState({
    displayName: initial?.displayName ?? '',
    slug: initial?.slug ?? '',
    bio: initial?.bio ?? '',
    price: String(initial?.subscriptionPriceCoins ?? 50),
    agree: false,
  });

  const profile = profileSchema.safeParse({ displayName: v.displayName, slug: v.slug, bio: v.bio });
  const profileErrors: Partial<Record<ProfileField, string>> = {};
  if (!profile.success) {
    for (const i of profile.error.issues) profileErrors[i.path[0] as ProfileField] ??= i.message;
  }
  const priceOk =
    /^\d+$/.test(v.price) && Number(v.price) >= PLAN_PRICE_MIN && Number(v.price) <= PLAN_PRICE_MAX;
  const price = Number(v.price);
  const slugText = v.slug.trim().toLowerCase();

  const err = (f: ProfileField) =>
    tried || serverErrors[f] ? (serverErrors[f] ?? profileErrors[f]) : undefined;

  function edit(patch: Partial<typeof v>) {
    setV((prev) => ({ ...prev, ...patch }));
    setServerErrors({});
  }

  async function next() {
    setTried(true);
    if (step === 0 && !profile.success) return;
    if (step === 1 && !priceOk) return;
    if (step < 3) {
      setStep(step + 1);
      setTried(false);
      return;
    }
    if (!v.agree) return;
    setPending(true);
    setFormError(undefined);
    const res = await submitCreatorApplication({
      displayName: v.displayName.trim(),
      slug: slugText,
      bio: v.bio.trim(),
      acceptAgreement: true,
      subscriptionPriceCoins: price,
    });
    setPending(false);
    if (res.ok) return setDone(true);
    if (res.field) {
      setServerErrors({ [res.field]: res.message });
      setStep(res.field === 'subscriptionPriceCoins' ? 1 : 0);
    } else setFormError(res.message);
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 text-center">
          <span
            aria-hidden
            className="flex size-22 items-center justify-center rounded-full bg-accent text-[28px] font-extrabold text-accent-foreground shadow-[0_0_0_8px_var(--accent)]"
          >
            {initials(v.displayName)}
          </span>
          <h1 className="mt-2 text-[26px] font-extrabold tracking-tight">
            Pengajuanmu sedang ditinjau
          </h1>
          <p className="max-w-[320px] text-[15px] leading-relaxed text-muted-foreground">
            Kami akan memberi tahu setelah admin meninjau pengajuanmu. Setelah disetujui, kamu bisa
            posting dan membagikan influency.com/{slugText}.
          </p>
        </div>
        <div className="px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <Button asChild size="lg" className="w-full">
            <Link href="/">Ke beranda</Link>
          </Button>
        </div>
      </div>
    );
  }

  const fieldProps = (f: ProfileField) => ({
    id: `cp-${f}`,
    'aria-invalid': err(f) ? true : undefined,
    'aria-describedby': err(f) ? `cp-${f}-error` : undefined,
  });
  const fieldError = (f: ProfileField) =>
    err(f) && (
      <p id={`cp-${f}-error`} role="alert" className="text-sm text-destructive">
        {err(f)}
      </p>
    );
  const priceError = tried && !priceOk ? PRICE_ERROR : serverErrors.subscriptionPriceCoins;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <StepperHeader
        steps={CREATOR_STEPS}
        current={step}
        onBack={() => (step === 0 ? router.push(backHref) : (setStep(step - 1), setTried(false)))}
      />
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pt-5 pb-4">
        {step === 0 && (
          <>
            <Heading title="Atur profil creator" body="Ini yang dilihat orang di halamanmu." />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-displayName">Nama tampilan</Label>
              <Input
                {...fieldProps('displayName')}
                value={v.displayName}
                maxLength={60}
                onChange={(e) => edit({ displayName: e.target.value })}
              />
              {fieldError('displayName')}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-slug">Alamat halaman</Label>
              <Input
                {...fieldProps('slug')}
                value={v.slug}
                maxLength={30}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => edit({ slug: e.target.value.toLowerCase() })}
              />
              <p className="text-sm text-muted-foreground">
                influency.com/{slugText || 'alamat-kamu'}
              </p>
              {fieldError('slug')}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-bio">Bio (opsional)</Label>
              <Textarea
                {...fieldProps('bio')}
                value={v.bio}
                maxLength={500}
                placeholder="Apa yang akan kamu bagikan ke pendukungmu?"
                onChange={(e) => edit({ bio: e.target.value })}
              />
              {fieldError('bio')}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <Heading
              title="Atur langgananmu"
              body="Satu paket untuk 30 hari. Pelanggan mendapat postingan premium yang memenuhi syarat selama langganan aktif."
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-price">Harga per 30 hari</Label>
              <div className="flex h-13 items-center gap-2 rounded-xl border border-input px-3.5">
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-koin text-xs font-extrabold text-white"
                >
                  K
                </span>
                <input
                  id="cp-price"
                  inputMode="numeric"
                  value={v.price}
                  aria-invalid={priceError ? true : undefined}
                  aria-describedby="cp-price-help"
                  onChange={(e) => edit({ price: e.target.value.replace(/\D/g, '') })}
                  className="h-12 min-w-0 flex-1 bg-transparent text-xl font-extrabold outline-none"
                />
                <span className="text-sm font-bold text-muted-foreground">Koin</span>
              </div>
              <p
                id="cp-price-help"
                role={priceError ? 'alert' : undefined}
                className={cn(
                  'text-[12.5px] leading-normal',
                  priceError ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {priceError ??
                  `≈ ${formatRupiah(price * KOIN_TO_IDR)} per 30 hari · kamu menerima ≈ ${formatRupiah(subscriptionCreatorShareIdr(price, KOIN_TO_IDR))} setelah biaya platform 15%`}
              </p>
            </div>
            <div role="group" aria-label="Harga yang disarankan" className="flex flex-wrap gap-2">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={v.price === String(n)}
                  onClick={() => edit({ price: String(n) })}
                  className={cn(
                    'h-11 rounded-full border px-3.5 text-[13px] font-bold',
                    v.price === String(n)
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-input bg-card',
                  )}
                >
                  {n} Koin
                </button>
              ))}
            </div>
            <ul className="flex flex-col gap-1.5 rounded-2xl border border-border bg-muted/40 p-3.5 text-[13px] leading-normal text-muted-foreground">
              <li>· Perpanjangan manual, tanpa tagihan otomatis.</li>
              <li>
                · Postingan premium diberi harga per postingan (5–1.000 Koin) saat dipublikasikan.
              </li>
              <li>· Tip masuk ke kamu tanpa biaya platform.</li>
            </ul>
          </>
        )}
        {step === 2 && (
          <>
            <Heading
              title="Ke mana penghasilanmu dikirim?"
              body="Kamu bisa menambahkan rekening nanti."
            />
            <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-input bg-accent/40 p-4 text-sm leading-relaxed">
              <span className="self-start rounded-lg border border-dashed border-input bg-card px-2.5 py-1 text-xs font-bold text-accent-foreground">
                Perlu konfirmasi
              </span>
              <p>
                Rekening pencairan ditambahkan nanti di Rekening Pencairan, setelah pengajuanmu
                disetujui. Verifikasi identitas dan biaya pencairan masih perlu konfirmasi.
              </p>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <Heading
              title="Tinjau dan kirim"
              body="Periksa datamu. Kamu bisa mengubahnya kapan saja dari profil."
            />
            <div className="flex items-center gap-3 rounded-2xl border border-border p-3.5">
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-[17px] font-extrabold text-accent-foreground"
              >
                {initials(v.displayName)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base font-extrabold">{v.displayName.trim()}</span>
                <span className="truncate text-[13px] text-muted-foreground">@{slugText}</span>
              </span>
            </div>
            <dl className="flex flex-col rounded-2xl border border-border px-3.5">
              {[
                { k: 'Profil', val: `@${slugText}`, to: 0 },
                { k: 'Alamat', val: `influency.com/${slugText}`, to: 0 },
                { k: 'Langganan', val: `${price} Koin / 30 hari`, to: 1 },
              ].map((row) => (
                <div
                  key={row.k}
                  className="flex min-h-13 items-center justify-between gap-3 border-b border-border last:border-0"
                >
                  <dt className="text-[13.5px] text-muted-foreground">{row.k}</dt>
                  <dd className="flex items-center gap-1.5 text-sm font-bold">
                    <span className="truncate">{row.val}</span>
                    <button
                      type="button"
                      aria-label={`Ubah ${row.k}`}
                      onClick={() => setStep(row.to)}
                      className="h-11 px-1 text-[13px] font-bold text-primary-ink"
                    >
                      Ubah
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2.5">
                <input
                  id="cp-agree"
                  type="checkbox"
                  checked={v.agree}
                  aria-invalid={tried && !v.agree ? true : undefined}
                  onChange={(e) => edit({ agree: e.target.checked })}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <Label htmlFor="cp-agree" className="text-[13.5px] leading-normal font-normal">
                  Saya menyetujui Perjanjian Kreator dan Kebijakan Konten.
                </Label>
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                Dokumen kebijakan sedang disiapkan.
              </p>
              {tried && !v.agree && (
                <p role="alert" className="text-sm text-destructive">
                  Setujui Perjanjian Kreator untuk melanjutkan.
                </p>
              )}
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
          </>
        )}
      </div>
      <StepperFooter
        label={step === 3 ? 'Kirim' : 'Lanjut'}
        pending={pending}
        disabled={step === 3 && !v.agree}
        onClick={() => void next()}
      />
    </div>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
