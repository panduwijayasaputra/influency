'use client';

import { LayoutGrid, Plus, Rows2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from 'radix-ui';
import type { PublicPost } from '@influency/shared';
import { PostCard, type PostCardCreator } from '@/components/post-card/post-card';
import { PostGrid } from '@/components/post-grid/post-grid';

const TRIGGER =
  'relative flex h-12 items-center justify-center gap-2 text-[15px] font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:font-extrabold data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-1/2 data-[state=active]:after:h-0.75 data-[state=active]:after:w-9 data-[state=active]:after:-translate-x-1/2 data-[state=active]:after:rounded-full data-[state=active]:after:bg-brand';

/** Owner-only entry to the studio editor (creator-studio US-054). */
export function NewPostLink() {
  return (
    <Link
      href="/studio/posts/new"
      className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Plus aria-hidden className="size-5" />
      Post Baru
    </Link>
  );
}

/**
 * Postingan / Grid tabs (US-011). The tab lives in `?tab=grid` so it survives a reload; only the open tab is mounted.
 * `isOwner` (UX only; the studio guards decide) adds "Post Baru" and an "Edit" item on every card.
 */
export function CreatorContent({
  posts,
  creator,
  isOwner = false,
}: {
  posts: PublicPost[];
  creator: PostCardCreator;
  isOwner?: boolean;
}) {
  const tab = useSearchParams().get('tab') === 'grid' ? 'grid' : 'posts';
  const pathname = usePathname();
  const router = useRouter();
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(next) =>
        router.replace(next === 'grid' ? `${pathname}?tab=grid` : pathname, { scroll: false })
      }
    >
      <Tabs.List aria-label="Konten" className="grid grid-cols-2 border-y bg-card">
        <Tabs.Trigger value="posts" className={TRIGGER}>
          <Rows2 aria-hidden className="size-4.5" />
          Postingan
        </Tabs.Trigger>
        <Tabs.Trigger value="grid" className={TRIGGER}>
          <LayoutGrid aria-hidden className="size-4.5" />
          Grid
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="posts" className="flex flex-col gap-2 pt-2">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            creator={creator}
            editHref={isOwner ? `/studio/posts/${post.id}` : undefined}
          />
        ))}
      </Tabs.Content>
      <Tabs.Content value="grid">
        <PostGrid posts={posts} creator={creator} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
