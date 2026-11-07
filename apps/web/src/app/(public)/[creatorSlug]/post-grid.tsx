'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { type PublicPost } from '@influency/shared';
import { KoinIcon } from '@/components/koin';
import { PurchaseSheet } from '@/components/purchase-sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { POST_DATE, PremiumCover } from './premium-cover';

const FILTERS = [
  { id: 'ALL', label: 'Semua' },
  { id: 'FREE', label: 'Gratis' },
  { id: 'PREMIUM', label: 'Premium' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

function mediaSummary({ imageCount, videoCount }: PublicPost): string {
  return [imageCount && `${imageCount} foto`, videoCount && `${videoCount} video`]
    .filter(Boolean)
    .join(' · ');
}

const TILE =
  'flex w-full flex-col gap-2 rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function TileBody({ post }: { post: PublicPost }) {
  const media = mediaSummary(post);
  return (
    <>
      <span className="relative block">
        {post.visibility === 'PREMIUM' ? (
          <>
            <PremiumCover previewUrl={post.previewUrl} className="aspect-4/5 rounded-xl" />
            {post.previewUrl && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-black/40 text-white">
                  <Lock aria-hidden className="size-5" />
                </span>
              </span>
            )}
          </>
        ) : (
          <span aria-hidden className="block aspect-4/5 w-full rounded-xl bg-muted" />
        )}
        {media && (
          <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
            {media}
          </span>
        )}
      </span>
      <span
        className={cn(
          'line-clamp-2 text-sm font-semibold wrap-break-word',
          !post.caption && 'text-muted-foreground',
        )}
      >
        {post.caption || 'Tanpa caption'}
      </span>
      {post.offer ? (
        <span className="flex items-center gap-1.5 text-xs font-bold">
          <KoinIcon />
          {post.offer.priceCoins} Koin · Premium
        </span>
      ) : (
        <span className="text-xs font-bold text-success">Gratis</span>
      )}
      <span className="text-xs text-muted-foreground">
        {[
          POST_DATE.format(new Date(post.publishedAt)),
          post.likeCount > 0 && `${post.likeCount} suka`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </>
  );
}

/** Free tiles open the post; premium tiles open the unlock sheet, which links on to the post. */
function PostTile({
  slug,
  creatorName,
  post,
}: {
  slug: string;
  creatorName: string;
  post: PublicPost;
}) {
  const href = `/${slug}/posts/${post.id}`;
  if (!post.offer) {
    return (
      <article>
        <Link href={href} className={TILE}>
          <TileBody post={post} />
        </Link>
      </article>
    );
  }
  return (
    <article>
      <PurchaseSheet
        trigger={
          <button type="button" className={TILE}>
            <TileBody post={post} />
          </button>
        }
        kicker={`Post premium · ${creatorName}`}
        title={post.caption || 'Tanpa caption'}
        rows={[['Masa akses', 'Permanen']]}
        priceCoins={post.offer.priceCoins}
        ctaLabel={`Buka dengan ${post.offer.priceCoins} Koin`}
      >
        <Button asChild variant="outline" className="h-12">
          <Link href={href}>Lihat detail post</Link>
        </Button>
      </PurchaseSheet>
    </article>
  );
}

/** Two-column post grid with Semua / Gratis / Premium filter chips (client-side; the feed is already loaded). */
export function PostGrid({
  slug,
  creatorName,
  posts,
}: {
  slug: string;
  creatorName: string;
  posts: PublicPost[];
}) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const shown = filter === 'ALL' ? posts : posts.filter((p) => p.visibility === filter);
  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Filter konten"
        className="grid grid-cols-3 gap-[2px] rounded-md bg-muted p-[3px]"
      >
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              'h-11 rounded-sm px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              filter === id
                ? 'bg-card font-bold text-foreground shadow-sm'
                : 'font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Belum ada konten di kategori ini.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          {shown.map((post) => (
            <PostTile key={post.id} slug={slug} creatorName={creatorName} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
