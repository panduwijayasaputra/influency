import { RESERVED_SLUGS, SLUG_PATTERN } from '@influency/shared';

const isCreatorSlug = (segment: string) => {
  const slug = segment.toLowerCase();
  return SLUG_PATTERN.test(slug) && !(RESERVED_SLUGS as readonly string[]).includes(slug);
};

/** Pages a guest may open: /login, /{creatorSlug}, /{creatorSlug}/posts/{postId}. Everything else needs login. */
export function isGuestPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 1) return isCreatorSlug(segments[0]!);
  return segments.length === 3 && segments[1] === 'posts' && isCreatorSlug(segments[0]!);
}
