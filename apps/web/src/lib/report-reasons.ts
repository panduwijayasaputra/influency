import type { PostReportReason } from '@influency/shared';

/** Labels for POST_REPORT_REASONS (TBD policy list, US-042). */
export const REPORT_REASON_LABELS: Record<PostReportReason, string> = {
  SPAM: 'Spam',
  SEXUAL_CONTENT: 'Konten seksual',
  VIOLENCE: 'Kekerasan',
  HARASSMENT: 'Pelecehan atau kebencian',
  ILLEGAL: 'Kegiatan ilegal',
  COPYRIGHT: 'Pelanggaran hak cipta',
  OTHER: 'Lainnya',
};
