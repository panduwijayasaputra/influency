import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProfileSummary } from '@/components/profile/profile-summary';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

export const metadata = { title: 'Profil' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Me />
    </Suspense>
  );
}

// The proxy already sends cookie-less visitors to login; this catches a revoked session. An approved creator's
// profile is their public creator page, which already has the owner view.
export async function Me() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/me'));
  if (user.creatorSlug) redirect(`/${user.creatorSlug}`);
  return (
    <>
      <PageHeader title="Profil" fallbackHref="/" />
      <ProfileSummary user={user} />
    </>
  );
}
