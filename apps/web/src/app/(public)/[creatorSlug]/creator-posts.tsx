import type { PostCardCreator } from '@/components/post-card/post-card';
import { getPublicPosts } from '@/lib/api/public-posts';
import { CreatorContent } from './creator-content';

const EMPTY = 'Belum ada konten yang dipublikasikan.';

/**
 * Published posts as Postingan (PostCards, US-008) / Grid tabs (US-011), newest first. Premium cards show only the generated cover preview (US-048);
 * post media arrives through the access-checked path (US-021), lazily in the browser.
 */
export async function CreatorPosts({ creator }: { creator: PostCardCreator }) {
  // An API outage must not break the public page.
  const feed = await getPublicPosts(creator.slug).catch(() => undefined);
  if (feed === undefined) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Konten belum bisa dimuat.
      </p>
    );
  }
  const posts = feed?.posts ?? [];
  if (posts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {EMPTY}
      </p>
    );
  }
  return <CreatorContent posts={posts} creator={creator} />;
}
