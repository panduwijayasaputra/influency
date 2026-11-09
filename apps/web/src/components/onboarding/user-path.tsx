'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type RecommendedCreator, updateMyProfileSchema } from '@influency/shared';
import { FollowButton } from '@/components/follow-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { fetchRecommendedCreators } from '@/lib/api/recommended-creators';
import { completeOnboarding, saveMyProfile } from '@/lib/api/onboarding';
import { initials } from '@/lib/utils';
import { StepperFooter } from './stepper-footer';
import { StepperHeader } from './stepper-header';

export const USER_STEPS = ['Profil', 'Ikuti'] as const;

type Props = {
  user: { displayName: string; username: string | null; bio: string | null };
  returnTo: string;
  /** Back from the first step: return to the path choice. */
  onExit: () => void;
};

type Suggestions =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; list: RecommendedCreator[] };

function Avatar({ name, size }: { name: string; size: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent font-extrabold text-accent-foreground ${size === 'lg' ? 'size-22 text-[28px]' : 'size-12 text-[15px]'}`}
    >
      {initials(name)}
    </span>
  );
}

export function UserPath({ user, returnTo, onExit }: Props) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [values, setValues] = useState({ displayName: user.displayName, bio: user.bio ?? '' });
  const [tried, setTried] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [pending, setPending] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Suggestions>({ status: 'loading' });

  const parsed = updateMyProfileSchema.safeParse(values);
  const nameError =
    tried && !parsed.success
      ? parsed.error.issues.find((i) => i.path[0] === 'displayName')?.message
      : undefined;
  const bioError =
    tried && !parsed.success
      ? parsed.error.issues.find((i) => i.path[0] === 'bio')?.message
      : undefined;
  const firstName = values.displayName.trim().split(/\s+/)[0] || 'kamu';

  const load = useCallback(() => {
    setSuggestions({ status: 'loading' });
    fetchRecommendedCreators().then(
      (list) => setSuggestions({ status: 'ok', list }),
      () => setSuggestions({ status: 'error' }),
    );
  }, []);
  // Fetched once when the Ikuti step opens: the API drops followed creators, so a refetch would remove cards.
  useEffect(() => {
    if (step !== 1 || suggestions.status !== 'loading') return;
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [step, suggestions.status, load]);

  async function saveProfile() {
    setTried(true);
    if (!parsed.success) return;
    setPending(true);
    setSaveError(false);
    try {
      await saveMyProfile(parsed.data);
      setStep(1);
    } catch {
      setSaveError(true);
    }
    setPending(false);
  }

  async function finish() {
    setPending(true);
    try {
      await completeOnboarding();
      setDone(true);
    } catch {
      toast('Gagal menyelesaikan. Coba lagi.');
    }
    setPending(false);
  }

  if (done) {
    const n = followed.size;
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 text-center">
          <span className="rounded-full shadow-[0_0_0_8px_var(--accent)]">
            <Avatar name={values.displayName} size="lg" />
          </span>
          <h1 className="mt-2 text-[26px] font-extrabold tracking-tight">
            Selamat datang, {firstName}!
          </h1>
          <p className="max-w-[300px] text-[15px] leading-relaxed text-muted-foreground">
            {n > 0
              ? `Kamu mengikuti ${n} creator. Postingan baru mereka menunggu di Beranda.`
              : 'Beranda kamu sudah siap. Jelajahi creator dari Beranda dan Jelajahi.'}
          </p>
        </div>
        <div className="px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <Button asChild size="lg" className="w-full">
            <Link href={returnTo}>Mulai menjelajah</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <StepperHeader
        steps={USER_STEPS}
        current={step}
        onBack={() => (step === 0 ? onExit() : setStep(0))}
        onSkip={step === 1 ? () => void finish() : undefined}
      />
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pt-5 pb-4">
        {step === 0 ? (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-extrabold tracking-tight">Atur profilmu</h1>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                Kami isi dari Telegram. Ubah sesukamu.
              </p>
            </div>
            <div className="flex justify-center">
              <Avatar name={values.displayName} size="lg" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-name">Nama tampilan</Label>
              <Input
                id="ob-name"
                value={values.displayName}
                maxLength={60}
                autoComplete="name"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? 'ob-name-error' : undefined}
                onChange={(e) => setValues((v) => ({ ...v, displayName: e.target.value }))}
              />
              {nameError && (
                <p id="ob-name-error" role="alert" className="text-sm text-destructive">
                  {nameError}
                </p>
              )}
            </div>
            {user.username && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold">Username Telegram</span>
                <span className="text-base text-muted-foreground">@{user.username}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  Dari Telegram, tidak bisa diubah.
                </span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ob-bio">Bio (opsional)</Label>
              <Textarea
                id="ob-bio"
                value={values.bio}
                maxLength={500}
                aria-invalid={bioError ? true : undefined}
                aria-describedby={bioError ? 'ob-bio-error' : undefined}
                onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))}
              />
              {bioError && (
                <p id="ob-bio-error" role="alert" className="text-sm text-destructive">
                  {bioError}
                </p>
              )}
            </div>
            {saveError && (
              <p role="alert" className="text-sm text-destructive">
                Gagal menyimpan profil. Coba lagi.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-extrabold tracking-tight">Ikuti beberapa creator</h1>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                Mengikuti itu gratis dan terpisah dari berlangganan. Postingan baru mereka muncul di
                Beranda.
              </p>
            </div>
            {suggestions.status === 'loading' && (
              <p role="status" className="text-muted-foreground">
                Memuat saran creator…
              </p>
            )}
            {suggestions.status === 'error' && (
              <div role="alert" className="flex flex-col items-start gap-2">
                <p className="text-muted-foreground">Gagal memuat saran creator.</p>
                <Button type="button" variant="outline" onClick={load}>
                  Coba lagi
                </Button>
              </div>
            )}
            {suggestions.status === 'ok' && suggestions.list.length === 0 && (
              <p className="text-muted-foreground">
                Belum ada saran creator. Kamu bisa menjelajah dari Beranda.
              </p>
            )}
            {suggestions.status === 'ok' && suggestions.list.length > 0 && (
              <ul className="flex flex-col gap-2.5">
                {suggestions.list.map((c) => (
                  <li
                    key={c.slug}
                    className="flex items-center gap-3 rounded-2xl border border-border p-3"
                  >
                    <Avatar name={c.displayName} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-extrabold">{c.displayName}</span>
                      <span className="truncate text-[12.5px] text-muted-foreground">
                        @{c.slug}
                      </span>
                    </span>
                    <FollowButton
                      slug={c.slug}
                      creatorName={c.displayName}
                      onChange={(s) =>
                        setFollowed((prev) => {
                          const next = new Set(prev);
                          if (s.following) next.add(c.slug);
                          else next.delete(c.slug);
                          return next;
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <StepperFooter
        label={step === 0 ? 'Lanjut' : 'Selesai'}
        pending={pending}
        onClick={() => void (step === 0 ? saveProfile() : finish())}
      />
    </div>
  );
}
