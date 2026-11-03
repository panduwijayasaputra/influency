import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { TELEGRAM_START, telegramStartHref } from '@/lib/login-href';
import { DevLoginLinks } from './dev-login-links';
import { InAppBrowserNotice } from './in-app-browser-notice';
import { LoginErrorMessage } from './login-error-message';

export const metadata: Metadata = { title: 'Masuk' };

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <InAppBrowserNotice />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Masuk ke Influency</h1>
        <p className="text-base text-muted-foreground">
          Gunakan akun Telegram kamu. Tidak perlu membuat kata sandi baru.
        </p>
      </div>
      <Suspense fallback={null}>
        <LoginError searchParams={searchParams} />
      </Suspense>
      {/* Fallback has no returnTo, so the button is never missing while searchParams resolve. */}
      <Suspense fallback={<TelegramButton href={TELEGRAM_START} />}>
        <TelegramStart searchParams={searchParams} />
      </Suspense>
      {process.env.NODE_ENV !== 'production' && (
        <Suspense fallback={<DevLoginLinks />}>
          <DevLogin searchParams={searchParams} />
        </Suspense>
      )}
    </main>
  );
}

async function LoginError({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const { error } = await searchParams;
  return <LoginErrorMessage error={error} />;
}

async function TelegramStart({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const { returnTo } = await searchParams;
  return <TelegramButton href={telegramStartHref(returnTo)} />;
}

async function DevLogin({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const { returnTo } = await searchParams;
  return <DevLoginLinks returnTo={returnTo} />;
}

// Full navigation (not <Link>): the API answers with a redirect to oauth.telegram.org.
function TelegramButton({ href }: { href: string }) {
  return (
    <Button asChild size="lg" className="w-full">
      <a href={href}>Masuk dengan Telegram</a>
    </Button>
  );
}
