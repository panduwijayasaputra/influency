import { describe, expect, it } from 'vitest';
import { markNotificationsReadSchema, notificationsPageSchema } from './notifications.js';

const item = {
  id: '0190a000-0000-7000-8000-000000000001',
  type: 'NEW_POST',
  actor: { displayName: 'Nadia', avatarUrl: null },
  text: 'memposting konten baru.',
  href: '/nadia/posts/0190a000-0000-7000-8000-000000000002',
  createdAt: '2026-11-09T00:00:00.000Z',
  read: false,
};

describe('notificationsPageSchema', () => {
  it('parses a page', () => {
    expect(notificationsPageSchema.parse({ items: [item], nextCursor: null }).items).toHaveLength(
      1,
    );
  });

  it('rejects an unknown type and an absolute link', () => {
    for (const bad of [
      { ...item, type: 'MENTION' },
      { ...item, href: 'https://evil.example' },
    ]) {
      expect(notificationsPageSchema.safeParse({ items: [bad], nextCursor: null }).success).toBe(
        false,
      );
    }
  });
});

describe('markNotificationsReadSchema', () => {
  it('needs a uuid and nothing else', () => {
    expect(markNotificationsReadSchema.safeParse({ upToId: item.id }).success).toBe(true);
    expect(markNotificationsReadSchema.safeParse({ upToId: 'x' }).success).toBe(false);
    expect(markNotificationsReadSchema.safeParse({ upToId: item.id, all: true }).success).toBe(
      false,
    );
  });
});
