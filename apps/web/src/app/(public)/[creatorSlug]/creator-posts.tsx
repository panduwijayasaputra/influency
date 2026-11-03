import { Lock } from 'lucide-react';
import Link from 'next/link';
import { type PublicPost } from '@influency/shared';
import { getPublicPosts } from '@/lib/api/public-posts';
import { POST_DATE, PremiumCover } from './premium-cover';

const EMPTY = 'Belum ada konten yang dipublikasikan.';

function mediaSummary({ imageCount, videoCount }: PublicPost): string {
  return [imageCount && `${imageCount} foto`, videoCount && `${videoCount} video`]
    .filter(Boolean)
    .join(' · ');
}

function PostCard({ slug, post }: { slug: string; post: PublicPost }) {
  return (
    <article>
      <Link
        href={`/${slug}/posts/${post.id}`}
        className="flex flex-col gap-2 rounded-lg border p-4 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {post.visibility === 'PREMIUM' && <PremiumCover previewUrl={post.previewUrl} />}
        {post.caption ? (
          <p className="wrap-break-word whitespace-pre-line">{post.caption}</p>
        ) : (
          <p className="text-muted-foreground">Tanpa caption</p>
        )}
        <p className="text-sm text-muted-foreground">
          {[
            mediaSummary(post),
            POST_DATE.format(new Date(post.publishedAt)),
            post.likeCount > 0 && `${post.likeCount} suka`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {post.offer && (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Lock aria-hidden className="size-4" />
            {post.offer.priceCoins} Koin · akses permanen
          </p>
        )}
      </Link>
    </article>
  );
}

function PostSection({
  slug,
  id,
  title,
  posts,
}: {
  slug: string;
  id: string;
  title: string;
  posts: PublicPost[];
}) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {posts.map((post) => (
        <PostCard key={post.id} slug={slug} post={post} />
      ))}
    </section>
  );
}

/**
 * Published posts as Gratis / Premium previews. Premium cards show only the generated cover preview (US-048); post
 * media arrives through the access-checked path (US-021).
 */
export async function CreatorPosts({ slug }: { slug: string }) {
  // An API outage must not break the public page.
  const feed = await getPublicPosts(slug).catch(() => undefined);
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
  return (
    <div className="flex flex-col gap-6">
      <PostSection
        slug={slug}
        id="gratis"
        title="Gratis"
        posts={posts.filter((p) => p.visibility === 'FREE')}
      />
      <PostSection
        slug={slug}
        id="premium"
        title="Premium"
        posts={posts.filter((p) => p.visibility === 'PREMIUM')}
      />
    </div>
  );
}
