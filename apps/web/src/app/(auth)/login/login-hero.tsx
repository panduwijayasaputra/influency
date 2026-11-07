import { Lock } from 'lucide-react';
import { KoinIcon } from '@/components/koin';

/** Decorative hero: three tilted "post cards" in token gradients (design/artboards/Login.dc.html). */
export function LoginHero() {
  return (
    <div
      aria-hidden
      className="relative mx-auto h-[clamp(12rem,38dvh,22rem)] w-full max-w-88 overflow-hidden"
    >
      <div className="absolute top-[12%] left-[8%] h-[58%] w-[42%] -rotate-8 rounded-[20px] bg-linear-to-b from-accent to-brand/70 shadow-lg" />
      <div className="absolute top-[4%] right-[8%] h-[58%] w-[42%] rotate-7 rounded-[20px] bg-linear-to-b from-koin-surface to-brand/50 shadow-lg">
        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
          Video
        </span>
      </div>
      <div className="absolute top-[38%] left-1/2 h-[62%] w-[46%] -translate-x-1/2 overflow-hidden rounded-[22px] bg-linear-to-b from-accent to-brand shadow-lg">
        <span className="absolute -inset-5 bg-linear-to-b from-accent to-brand blur-md" />
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/40 text-white">
            <Lock className="size-5" />
          </span>
          <span className="flex h-7 items-center gap-1.5 rounded-full border border-koin-border bg-koin-surface px-2.5 text-xs font-bold text-koin-foreground">
            <KoinIcon />5 Koin
          </span>
        </span>
      </div>
    </div>
  );
}
