import type { PostStatus, PostVisibility } from '@influency/shared';

/** full = whole post incl. media; locked = premium paywall preview; hidden = answer as 404. */
export type PostAccess = 'full' | 'locked' | 'hidden';

export interface PostAccessFacts {
  status: PostStatus;
  visibility: PostVisibility;
  ownerUserId: string;
  /** Creator is APPROVED and their user ACTIVE (PUBLIC_CREATOR). */
  creatorPublic: boolean;
}

/** null = anonymous. Always built from the session and DB, never from request data. */
export type PostViewer = { userId: string; isAdmin: boolean } | null;

/** Single access rule for every post view (handoff §6.4). US-050 adds paid sources before 'locked'. */
export function decidePostAccess(post: PostAccessFacts, viewer: PostViewer): PostAccess {
  if (viewer?.isAdmin) return 'full';
  if (post.status === 'REMOVED') return 'hidden';
  if (viewer?.userId === post.ownerUserId) return 'full';
  if (post.status !== 'PUBLISHED' || !post.creatorPublic) return 'hidden';
  return post.visibility === 'FREE' ? 'full' : 'locked';
}
