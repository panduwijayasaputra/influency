import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { APP_NAME } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/api/current-user';
import { getPublicCreator } from '@/lib/api/public-creator';
import { loginHref } from '@/lib/login-href';

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export default async function CreatorPage({ params }: Props) {
  const creator = await getPublicCreator((await params).creatorSlug);
  if (!creator) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col pb-12">
      {creator.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
        <img src={creator.bannerUrl} alt="" className="h-32 w-full object-cover sm:h-48" />
      ) : (
        <div aria-hidden className="h-32 bg-linear-to-r from-primary/30 to-primary/5 sm:h-48" />
      )}

      <div className="flex flex-col gap-3 px-4">
        <div className="-mt-10 flex items-end justify-between gap-2">
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
            <img
              src={creator.avatarUrl}
              alt=""
              className="size-20 rounded-full border-4 bg-background object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex size-20 items-center justify-center rounded-full border-4 border-background bg-muted text-2xl font-bold"
            >
              {initials(creator.displayName)}
            </div>
          )}
          {/* Reads the session cookie, so it streams in; the profile above stays cacheable. */}
          <Suspense fallback={null}>
            <LoginCta slug={creator.slug} />
          </Suspense>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight wrap-break-word">
            {creator.displayName}
          </h1>
          <p className="text-sm text-muted-foreground">influency.com/{creator.slug}</p>
        </div>
        {creator.category && (
          <p className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {creator.category}
          </p>
        )}
        {creator.bio && <p className="wrap-break-word whitespace-pre-line">{creator.bio}</p>}

        <section aria-labelledby="konten" className="mt-6 flex flex-col gap-2">
          <h2 id="konten" className="text-lg font-semibold">
            Konten
          </h2>
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada konten yang dipublikasikan.
          </p>
        </section>

        <section aria-labelledby="langganan" className="mt-6 flex flex-col gap-2">
          <h2 id="langganan" className="text-lg font-semibold">
            Langganan
          </h2>
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Kreator ini belum membuka langganan.
          </p>
        </section>
      </div>
    </main>
  );
}

/** "Masuk" that returns to this creator page; hidden once logged in. */
export async function LoginCta({ slug }: { slug: string }) {
  // An API outage must not break the public page: treat it as logged out.
  const user = await getCurrentUser().catch(() => null);
  if (user) return null;
  return (
    <Button asChild size="sm">
      <Link href={loginHref(`/${slug}`)}>Masuk</Link>
    </Button>
  );
}
