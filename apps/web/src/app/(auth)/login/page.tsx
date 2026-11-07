import { Send } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { safeReturnTo } from '@influency/shared';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/api/current-user';
import { PRIVACY, TERMS } from '@/lib/legal-placeholder';
import { TELEGRAM_START, telegramStartHref } from '@/lib/login-href';
import { DevLoginLinks } from './dev-login-links';
import { InAppBrowserNotice } from './in-app-browser-notice';
import { LegalSheet } from './legal-sheet';
import { LoginErrorMessage } from './login-error-message';
import { LoginHero } from './login-hero';

export const metadata: Metadata = { title: 'Masuk' };

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 pt-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
      <Suspense fallback={null}>
        <RedirectIfSignedIn searchParams={searchParams} />
      </Suspense>
      <p aria-label="Influency">
        <BrandLogo size="lg" />
      </p>
      <LoginHero />
      <div className="mt-auto flex flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-balance">
            Lebih dekat dengan creator favoritmu
          </h1>
          <p className="text-[15.5px] leading-relaxed text-muted-foreground">
            Ikuti creator, buka post premium, dan berlangganan dengan Koin, semua di satu tempat.
          </p>
        </div>
        <InAppBrowserNotice />
        <Suspense fallback={null}>
          <LoginError searchParams={searchParams} />
        </Suspense>
        <div className="flex flex-col gap-3">
          {/* Fallback has no returnTo, so the button is never missing while searchParams resolve. */}
          <Suspense fallback={<TelegramButton href={TELEGRAM_START} />}>
            <TelegramStart searchParams={searchParams} />
          </Suspense>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Dengan melanjutkan, kamu menyetujui <LegalSheet doc={TERMS} /> dan{' '}
            <LegalSheet doc={PRIVACY} />.
          </p>
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <Suspense fallback={<DevLoginLinks />}>
            <DevLogin searchParams={searchParams} />
          </Suspense>
        )}
      </div>
    </main>
  );
}

/** A signed-in visitor never sees the login page: back to returnTo (safeReturnTo maps /login and junk to /). */
export async function RedirectIfSignedIn({
  searchParams,
}: Pick<PageProps<'/login'>, 'searchParams'>) {
  // An API outage must not lock anyone out of the login page: treat it as a guest.
  const [{ returnTo }, user] = await Promise.all([
    searchParams,
    getCurrentUser().catch(() => null),
  ]);
  if (user) redirect(safeReturnTo(returnTo));
  return null;
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
    <Button
      asChild
      size="lg"
      className="w-full gap-2.5 bg-telegram text-telegram-foreground hover:bg-telegram/90"
    >
      <a href={href}>
        <Send aria-hidden className="size-5" />
        Masuk dengan Telegram
      </a>
    </Button>
  );
}
