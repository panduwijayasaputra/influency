import type { PostStatus, PostVisibility } from '@influency/shared';

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: 'Draf',
  PROCESSING: 'Diproses',
  PENDING_REVIEW: 'Menunggu tinjauan',
  PUBLISHED: 'Terbit',
  HIDDEN: 'Disembunyikan',
  REMOVED: 'Dihapus',
};

export const VISIBILITY_LABELS: Record<PostVisibility, string> = {
  FREE: 'Gratis',
  PREMIUM: 'Premium',
};
