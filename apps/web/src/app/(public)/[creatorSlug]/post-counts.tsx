import { Clapperboard, ImageIcon } from 'lucide-react';
import { getPublicPosts } from '@/lib/api/public-posts';
import { StatItem } from './follow-state';

/** Stats row: photos and videos across the creator's published posts. An API failure just hides the two items. */
export async function PostCounts({ slug }: { slug: string }) {
  const feed = await getPublicPosts(slug).catch(() => null);
  if (!feed) return null;
  const images = feed.posts.reduce((n, p) => n + p.imageCount, 0);
  const videos = feed.posts.reduce((n, p) => n + p.videoCount, 0);
  return (
    <>
      <StatItem icon={<ImageIcon aria-hidden className="size-4.5" />} count={images} label="foto" />
      <StatItem
        icon={<Clapperboard aria-hidden className="size-4.5" />}
        count={videos}
        label="video"
      />
    </>
  );
}
