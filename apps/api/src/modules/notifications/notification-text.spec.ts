import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES, type NotificationType } from '@influency/shared';
import { renderNotification } from './notification-text.js';

const base = {
  coins: 1500,
  creatorName: 'Nadia Kirana',
  creatorSlug: 'nadia',
  postId: '0190a000-0000-7000-8000-000000000001',
};
const render = (type: NotificationType, over: Partial<typeof base> = {}) =>
  renderNotification({ type, ...base, ...over });

describe('renderNotification', () => {
  it.each([
    ['NEW_POST', 'memposting konten baru.', `/nadia/posts/${base.postId}`],
    ['COMMENT_REPLY', 'membalas komentarmu.', `/nadia/posts/${base.postId}`],
    ['COMMENT_LIKE', 'menyukai komentarmu.', `/nadia/posts/${base.postId}`],
    ['TOPUP_CREDITED', 'Top-up berhasil: 1.500 Koin masuk ke Dompet.', '/wallet'],
    ['SUBSCRIPTION_ENDING', 'Langgananmu ke Nadia Kirana akan berakhir.', '/nadia'],
    ['NEW_SUBSCRIBER', 'berlangganan ke kamu.', '/studio/earnings'],
    ['POST_UNLOCKED', 'membuka postinganmu (1.500 Koin).', '/studio/earnings'],
    ['TIP_RECEIVED', 'mengirim tip 1.500 Koin.', '/studio/earnings'],
    ['PAYOUT_STATUS', 'Status pencairan dana kamu berubah.', '/studio/earnings'],
  ] as const)('renders %s', (type, text, href) => {
    expect(render(type)).toEqual({ text, href });
  });

  it('covers every type with a same-origin link', () => {
    for (const type of NOTIFICATION_TYPES) expect(render(type)!.href.startsWith('/')).toBe(true);
  });

  it('returns null when the post or creator is no longer viewable', () => {
    expect(render('NEW_POST', { postId: null } as never)).toBeNull();
    expect(render('COMMENT_REPLY', { creatorSlug: null } as never)).toBeNull();
    expect(render('SUBSCRIPTION_ENDING', { creatorSlug: null } as never)).toBeNull();
  });
});
