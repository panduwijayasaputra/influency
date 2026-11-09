'use client';

import type { MeResponse } from '@influency/shared';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/utils';

const CONFIRM_PILL =
  'self-start rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary-ink';

/** Profil Saya for a normal user: who they are on Influency. Anything below the header is undecided (OPEN). */
export function ProfileSummary({ user }: { user: MeResponse }) {
  return (
    <main className="mx-auto w-full max-w-feed flex-1 pb-6">
      <section aria-label="Profil" className="flex flex-col gap-3 border-b bg-card px-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <span
            aria-hidden
            className="flex size-20 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-primary-foreground"
          >
            {initials(user.displayName)}
          </span>
          <BottomSheet
            title="Edit Profil"
            eyebrow={<span className={CONFIRM_PILL}>Perlu konfirmasi</span>}
            description="Apa saja yang bisa diubah belum diputuskan."
            trigger={
              <Button type="button" variant="outline" size="sm">
                Edit Profil
              </Button>
            }
          >
            <p className="pb-2 text-sm text-muted-foreground">
              Tombol ini akan aktif setelah ditentukan apa yang boleh diubah.
            </p>
          </BottomSheet>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-extrabold">{user.displayName}</h1>
          {user.username && <span className="text-sm text-muted-foreground">@{user.username}</span>}
          {user.bio && <p className="mt-1 text-[15px] leading-relaxed">{user.bio}</p>}
        </div>
      </section>

      <div className="m-4 flex flex-col gap-2 rounded-2xl border border-dashed p-4">
        <span className={CONFIRM_PILL}>Perlu konfirmasi</span>
        <h2 className="text-base font-extrabold">Isi di bawah header belum diputuskan</h2>
        <p className="text-sm text-muted-foreground">
          Aktivitas publik, lencana, dan pembelian tidak ditampilkan sampai ini diputuskan.
        </p>
      </div>
    </main>
  );
}
