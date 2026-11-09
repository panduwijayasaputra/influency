import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getMyOwnPlan } from '@/lib/api/own-subscription-plan.server';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { EditProfileForm } from './edit-profile-form';

export const metadata: Metadata = { title: 'Edit Profil' };

/** Loads the profile and plan together. A plan that fails to load blocks the form: it must not look like "no plan". */
async function ProfileEditor() {
  // StudioGate already handled logged-out / unapproved; null here means the session just ended.
  const [profile, plan] = await Promise.all([
    getMyCreatorProfile(),
    getMyOwnPlan().catch(() => undefined),
  ]);
  if (!profile) return <p className="text-muted-foreground">Profil kreator tidak ditemukan.</p>;
  if (plan === undefined) {
    return (
      <p className="text-muted-foreground">
        Harga langganan belum bisa dimuat. Muat ulang halaman.
      </p>
    );
  }
  return (
    <EditProfileForm
      profile={profile}
      plan={plan ? { priceCoins: plan.priceCoins, active: plan.active } : null}
    />
  );
}

export default function StudioProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Edit Profil</h1>
      {/* Reads the session cookie, so it must stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <ProfileEditor />
      </Suspense>
    </main>
  );
}
