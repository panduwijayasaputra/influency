'use client';

import { useState } from 'react';
import type { PublicPost } from '@influency/shared';
import { cn } from '@/lib/utils';
import type { PostCardCreator } from '@/components/post-card/post-card';
import { GridTile } from './grid-tile';

type MediaFilter = 'ALL' | 'IMAGE' | 'VIDEO';
type AccessFilter = 'ALL' | 'FREE' | 'PREMIUM';

const MEDIA_OPTIONS: [MediaFilter, string][] = [
  ['ALL', 'Semua'],
  ['IMAGE', 'Foto'],
  ['VIDEO', 'Video'],
];
const ACCESS_OPTIONS: [AccessFilter, string][] = [
  ['ALL', 'Semua'],
  ['FREE', 'Gratis'],
  ['PREMIUM', 'Premium'],
];

/** Media matches the tile's first media (what the tile shows); both filters apply together. */
export function filterPosts(posts: PublicPost[], media: MediaFilter, access: AccessFilter) {
  return posts.filter(
    (p) =>
      (media === 'ALL' || p.media[0]?.kind === media) &&
      (access === 'ALL' || p.visibility === access),
  );
}

/** The creator's Grid tab (US-011): Media + Akses filters over 3-column square tiles. */
export function PostGrid({ posts, creator }: { posts: PublicPost[]; creator: PostCardCreator }) {
  const [media, setMedia] = useState<MediaFilter>('ALL');
  const [access, setAccess] = useState<AccessFilter>('ALL');
  const shown = filterPosts(posts, media, access);
  return (
    <div>
      <div className="flex items-center gap-2 border-b bg-card px-4 py-3">
        <label>
          <span className="sr-only">Media</span>
          <select
            value={media}
            onChange={(e) => setMedia(e.target.value as MediaFilter)}
            className="h-11 w-26 shrink-0 rounded-xl border border-input bg-card px-2.5 text-[13px] font-bold"
          >
            {MEDIA_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div
          role="radiogroup"
          aria-label="Akses"
          className="grid min-w-0 flex-1 grid-cols-3 gap-0.5 rounded-xl bg-muted p-[3px]"
        >
          {ACCESS_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={access === value}
              onClick={() => setAccess(value)}
              className={cn(
                'h-9.5 rounded-[9px] px-1 text-[13px] font-semibold whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                access === value ? 'bg-card font-extrabold shadow-sm' : 'text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="p-8 text-center text-sm">
          <p className="font-bold">Tidak ada yang cocok</p>
          <p className="text-muted-foreground">Coba filter lain.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5 bg-card">
          {shown.map((post) => (
            <GridTile
              key={post.id}
              post={post}
              href={`/${creator.slug}/posts/${post.id}`}
              creator={creator}
            />
          ))}
        </div>
      )}
    </div>
  );
}
