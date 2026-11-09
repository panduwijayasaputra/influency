import type { MediaRejectionReason, PostStatus, PostVisibility } from '@influency/shared';

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: 'Draf',
  PROCESSING: 'Diproses',
  PENDING_REVIEW: 'Menunggu tinjauan',
  PUBLISHED: 'Terbit',
  ARCHIVED: 'Diarsipkan',
  REMOVED: 'Dihapus',
};

export const VISIBILITY_LABELS: Record<PostVisibility, string> = {
  FREE: 'Gratis',
  PREMIUM: 'Premium',
};

/** Why an upload failed (US-049); items rejected before reasons existed fall back to MEDIA_REJECTION_FALLBACK. */
export const MEDIA_REJECTION_LABELS: Record<MediaRejectionReason, string> = {
  UPLOAD_EXPIRED: 'Unggahan tidak selesai tepat waktu.',
  PROCESSING_TIMEOUT: 'Pemrosesan video terlalu lama.',
  PROCESSING_FAILED: 'Video tidak dapat diproses.',
  TOO_LARGE: 'Ukuran file melebihi batas.',
  TOO_LONG: 'Durasi video melebihi batas.',
  UNSUPPORTED_TYPE: 'Format file tidak didukung.',
};
export const MEDIA_REJECTION_FALLBACK = 'Unggahan gagal.';
