import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { SettingsView } from '@/components/settings/settings-view';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';
import pkg from '../../../../../package.json';

export const metadata = { title: 'Pengaturan' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Settings />
    </Suspense>
  );
}

// The proxy already sends cookie-less visitors to login; this catches a revoked session.
export async function Settings() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/account/settings'));
  return (
    <>
      <PageHeader title="Pengaturan" asHeading fallbackHref="/" />
      <main className="mx-auto w-full max-w-feed flex-1">
        <SettingsView user={user} version={pkg.version} />
      </main>
    </>
  );
}
