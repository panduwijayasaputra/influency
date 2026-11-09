import { Camera, Heart } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';

export type OnboardingPath = 'user' | 'creator';

const CHOICES = [
  {
    key: 'user',
    title: 'Jelajahi dan dukung creator',
    desc: 'Ikuti creator, buka postingan premium, berlangganan, dan kirim tip dengan Koin.',
    Icon: Heart,
  },
  {
    key: 'creator',
    title: 'Bagikan konten sebagai creator',
    desc: 'Posting konten gratis dan premium, buka langganan, dan terima penghasilan.',
    Icon: Camera,
  },
] as const;

export function PathChoice({
  firstName,
  value,
  onChange,
}: {
  firstName: string;
  value: OnboardingPath | null;
  onChange: (path: OnboardingPath) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    const next = CHOICES[(index + step + CHOICES.length) % CHOICES.length]!;
    onChange(next.key);
    (event.currentTarget.parentElement?.children[CHOICES.indexOf(next)] as HTMLElement).focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="pt-3" aria-label="Influency" role="img">
        <BrandLogo />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-balance">
          Selamat datang, {firstName}. Mau pakai Influency untuk apa?
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Kamu bisa jadi creator nanti dari menu akun.
        </p>
      </div>
      <div role="radiogroup" aria-label="Jenis akun" className="flex flex-col gap-3">
        {CHOICES.map(({ key, title, desc, Icon }, i) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (value === null && i === 0) ? 0 : -1}
              onClick={() => onChange(key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'flex min-h-11 items-start gap-3.5 rounded-[18px] border p-4 text-left',
                selected ? 'border-2 border-brand bg-accent' : 'border-border bg-card',
              )}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-muted">
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-base font-extrabold">{title}</span>
                <span className="text-[13.5px] leading-normal text-muted-foreground">{desc}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 size-[22px] shrink-0 rounded-full border-2 bg-background',
                  selected ? 'border-[6px] border-primary' : 'border-border',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
