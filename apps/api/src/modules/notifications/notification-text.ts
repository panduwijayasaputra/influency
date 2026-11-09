import type { NotificationType } from '@influency/shared';

const NUMBER = new Intl.NumberFormat('id-ID');

export interface NotificationTextInput {
  type: NotificationType;
  coins: number | null;
  /** Display name of the creator the notification is about (subscription reminder). */
  creatorName: string | null;
  /** Slug for links to a creator page or post; null when that creator is no longer public. */
  creatorSlug: string | null;
  /** Set when the linked post is still viewable (published or archived). */
  postId: string | null;
}

export const UNAVAILABLE_TEXT = 'Notifikasi ini tidak lagi tersedia.';

/**
 * Text (shown after the bold actor name, or alone) and same-origin link of a notification, in Bahasa Indonesia. Never
 * includes comment bodies, captions or media: only the type, an amount and a creator name. Returns null when the
 * target is gone, so the caller can render the neutral fallback.
 */
export function renderNotification(
  n: NotificationTextInput,
): { text: string; href: string } | null {
  const koin = n.coins === null ? '' : `${NUMBER.format(n.coins)} Koin`;
  const post = n.creatorSlug && n.postId ? `/${n.creatorSlug}/posts/${n.postId}` : null;
  switch (n.type) {
    case 'NEW_POST':
      return post ? { text: 'memposting konten baru.', href: post } : null;
    case 'COMMENT_REPLY':
      return post ? { text: 'membalas komentarmu.', href: post } : null;
    case 'COMMENT_LIKE':
      return post ? { text: 'menyukai komentarmu.', href: post } : null;
    case 'TOPUP_CREDITED':
      return { text: `Top-up berhasil: ${koin} masuk ke Dompet.`, href: '/wallet' };
    case 'SUBSCRIPTION_ENDING':
      return n.creatorSlug && n.creatorName
        ? { text: `Langgananmu ke ${n.creatorName} akan berakhir.`, href: `/${n.creatorSlug}` }
        : null;
    case 'NEW_SUBSCRIBER':
      return { text: 'berlangganan ke kamu.', href: '/studio/earnings' };
    case 'POST_UNLOCKED':
      return { text: `membuka postinganmu (${koin}).`, href: '/studio/earnings' };
    case 'TIP_RECEIVED':
      return { text: `mengirim tip ${koin}.`, href: '/studio/earnings' };
    case 'PAYOUT_STATUS':
      return { text: 'Status pencairan dana kamu berubah.', href: '/studio/earnings' };
  }
}
