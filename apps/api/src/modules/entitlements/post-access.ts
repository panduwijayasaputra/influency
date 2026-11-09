import type { PostStatus, PostVisibility } from '@influency/shared';

/** full = whole post incl. media; locked = premium paywall preview; hidden = answer as 404. */
export type PostAccess = 'full' | 'locked' | 'hidden';

export interface PostAccessFacts {
  status: PostStatus;
  visibility: PostVisibility;
  ownerUserId: string;
  /** Creator is APPROVED and their user ACTIVE (PUBLIC_CREATOR). */
  creatorPublic: boolean;
  /** The viewer has paid for this post (purchase now; subscription and archive grant with US-037). */
  paid: boolean;
}

/** null = anonymous. Always built from the session and DB, never from request data. */
export type PostViewer = { userId: string; isAdmin: boolean } | null;

/**
 * Single access rule for every post view (handoff §6.4). `paid` unlocks a published premium post, and a premium post
 * the creator archived stays privately available to who paid for it (spec §4); REMOVED never is.
 */
export function decidePostAccess(post: PostAccessFacts, viewer: PostViewer): PostAccess {
  if (viewer?.isAdmin) return 'full';
  if (post.status === 'REMOVED') return 'hidden';
  if (viewer?.userId === post.ownerUserId) return 'full';
  if (!post.creatorPublic) return 'hidden';
  if (post.status === 'PUBLISHED')
    return post.visibility === 'FREE' || post.paid ? 'full' : 'locked';
  if (post.status === 'ARCHIVED' && post.visibility === 'PREMIUM' && post.paid) return 'full';
  return 'hidden';
}
