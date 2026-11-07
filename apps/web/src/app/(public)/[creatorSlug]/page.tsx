import { Share } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { APP_NAME, type CreatorProfileResponse } from '@influency/shared';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/api/current-user';
import { getPublicCreator } from '@/lib/api/public-creator';
import { loginHref } from '@/lib/login-href';
import { initials } from '@/lib/utils';
import { CreatorPosts } from './creator-posts';
import { SHARE_BUTTON_CLASS, ShareButton } from './share-button';
import { SubscribeCard } from './subscribe-card';

type Props = { params: Promise<{ creatorSlug: string }> };

// Render the page only once the (cached) profile is in, with no page-level loading fallback.
// shortcut: unknown slugs are a soft 404 (200 + noindex) because the root layout shell streams first; add a Proxy slug check if a real 404 status is needed.
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const creator = await getPublicCreator((await params).creatorSlug);
  if (!creator) notFound();
  return {
    title: creator.displayName,
    description: creator.bio?.slice(0, 160) || `${creator.displayName} di ${APP_NAME}`,
  };
}

export default async function CreatorPage({ params }: Props) {
  const creator = await getPublicCreator((await params).creatorSlug);
  if (!creator) notFound();
  // The viewer decides the header and actions, so the page streams once the session is checked (still SSR).
  return (
    <Suspense fallback={null}>
      <CreatorView creator={creator} />
    </Suspense>
  );
}

/** The creator page for this viewer: guests get no top bar and every action goes to login (US-007). */
export async function CreatorView({ creator }: { creator: CreatorProfileResponse }) {
  // An API outage counts as a guest, the same rule as /login.
  const signedIn = (await getCurrentUser().catch(() => null)) !== null;
  const login = loginHref(`/${creator.slug}`);

  return (
    <>
      {signedIn && <PageHeader title={creator.displayName} />}
      <main className="mx-auto flex w-full max-w-feed flex-1 flex-col pb-6">
        {creator.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
          <img src={creator.bannerUrl} alt="" className="h-32 w-full object-cover sm:h-48" />
        ) : (
          <div aria-hidden className="h-32 bg-linear-to-r from-primary/30 to-primary/5 sm:h-48" />
        )}

        <div className="flex flex-col gap-3 px-5">
          <div className="-mt-10 flex items-end justify-between gap-2">
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
              <img
                src={creator.avatarUrl}
                alt=""
                className="size-20 rounded-full border-4 border-background bg-background object-cover ring-2 ring-brand"
              />
            ) : (
              <div
                aria-hidden
                className="flex size-20 items-center justify-center rounded-full border-4 border-background bg-primary text-2xl font-extrabold text-primary-foreground ring-2 ring-brand"
              >
                {initials(creator.displayName)}
              </div>
            )}
            {!signedIn && (
              <Button asChild size="sm">
                <Link href={login}>Masuk</Link>
              </Button>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight wrap-break-word">
              {creator.displayName}
            </h1>
            <p className="text-sm text-muted-foreground">influency.com/{creator.slug}</p>
          </div>
          {creator.category && (
            <p className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">
              {creator.category}
            </p>
          )}
          {creator.bio && (
            <p className="text-sm leading-relaxed wrap-break-word whitespace-pre-line">
              {creator.bio}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {/* shortcut: dummy chips until profiles have social links; render them as links to the creator's accounts then. */}
            {['Instagram', 'TikTok'].map((name) => (
              <button
                key={name}
                type="button"
                disabled
                title="Segera hadir"
                className="h-11 rounded-lg border border-input bg-card px-4 text-[13px] font-semibold disabled:opacity-60"
              >
                {name}
              </button>
            ))}
            {signedIn ? (
              <ShareButton title={creator.displayName} />
            ) : (
              <Link href={login} aria-label="Bagikan" className={SHARE_BUTTON_CLASS}>
                <Share aria-hidden className="size-4" />
              </Link>
            )}
          </div>

          <div className="mt-2">
            <SubscribeCard
              creatorName={creator.displayName}
              loginHref={signedIn ? undefined : login}
            />
          </div>

          <section aria-labelledby="konten" className="mt-4 flex flex-col gap-3">
            <h2 id="konten" className="text-lg font-bold">
              Konten
            </h2>
            {/* Uncached so hidden posts disappear immediately; the profile above stays cached. */}
            <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat konten…</p>}>
              <CreatorPosts
                slug={creator.slug}
                creatorName={creator.displayName}
                signedIn={signedIn}
              />
            </Suspense>
          </section>
        </div>
      </main>
    </>
  );
}
