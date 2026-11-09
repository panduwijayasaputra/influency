import type { PostStatus, PostVisibility } from '@influency/shared';
import { describe, expect, it } from 'vitest';
import { decidePostAccess, type PostAccess, type PostViewer } from './post-access.js';

const OWNER = 'owner-user';
const viewers = {
  anonymous: null,
  stranger: { userId: 'other-user', isAdmin: false },
  owner: { userId: OWNER, isAdmin: false },
  admin: { userId: 'admin-user', isAdmin: true },
} satisfies Record<string, PostViewer>;

const decide = (
  status: PostStatus,
  visibility: PostVisibility,
  viewer: keyof typeof viewers,
  creatorPublic = true,
  paid = false,
) =>
  decidePostAccess(
    { status, visibility, ownerUserId: OWNER, creatorPublic, paid },
    viewers[viewer],
  );

describe('decidePostAccess', () => {
  it.each<[PostVisibility, PostAccess]>([
    ['FREE', 'full'],
    ['PREMIUM', 'locked'],
  ])('published %s post for anonymous and other users → %s', (visibility, expected) => {
    expect(decide('PUBLISHED', visibility, 'anonymous')).toBe(expected);
    expect(decide('PUBLISHED', visibility, 'stranger')).toBe(expected);
  });

  it.each<PostStatus>(['DRAFT', 'PROCESSING', 'PENDING_REVIEW', 'ARCHIVED', 'REMOVED'])(
    '%s post is hidden from the public',
    (status) => {
      for (const visibility of ['FREE', 'PREMIUM'] as const) {
        expect(decide(status, visibility, 'anonymous')).toBe('hidden');
        expect(decide(status, visibility, 'stranger')).toBe('hidden');
      }
    },
  );

  it.each<[PostStatus, PostVisibility]>([
    ['DRAFT', 'FREE'],
    ['PROCESSING', 'PREMIUM'],
    ['PENDING_REVIEW', 'PREMIUM'],
    ['ARCHIVED', 'PREMIUM'],
    ['PUBLISHED', 'PREMIUM'],
  ])('owner sees own %s %s post in full', (status, visibility) => {
    expect(decide(status, visibility, 'owner')).toBe('full');
  });

  it('removed post is hidden from its owner', () => {
    expect(decide('REMOVED', 'FREE', 'owner')).toBe('hidden');
  });

  it.each<[PostStatus, PostVisibility]>([
    ['REMOVED', 'PREMIUM'],
    ['DRAFT', 'FREE'],
    ['PUBLISHED', 'PREMIUM'],
  ])('admin sees any %s %s post in full', (status, visibility) => {
    expect(decide(status, visibility, 'admin')).toBe('full');
  });

  it('non-public creator: hidden from the public, still full for the owner', () => {
    expect(decide('PUBLISHED', 'FREE', 'anonymous', false)).toBe('hidden');
    expect(decide('PUBLISHED', 'FREE', 'owner', false)).toBe('full');
  });

  describe('paid access (purchase)', () => {
    it('unlocks a published premium post for who paid, not for who did not', () => {
      expect(decide('PUBLISHED', 'PREMIUM', 'stranger', true, true)).toBe('full');
      expect(decide('PUBLISHED', 'PREMIUM', 'stranger', true, false)).toBe('locked');
    });

    it('keeps an archived premium post private to who paid; everyone else gets hidden', () => {
      expect(decide('ARCHIVED', 'PREMIUM', 'stranger', true, true)).toBe('full');
      expect(decide('ARCHIVED', 'PREMIUM', 'stranger', true, false)).toBe('hidden');
      expect(decide('ARCHIVED', 'PREMIUM', 'anonymous', true, false)).toBe('hidden');
    });

    it.each<PostStatus>(['DRAFT', 'PROCESSING', 'PENDING_REVIEW', 'REMOVED'])(
      'never opens a %s post, paid or not',
      (status) => {
        expect(decide(status, 'PREMIUM', 'stranger', true, true)).toBe('hidden');
      },
    );

    it('does not open an archived FREE post, or any post of a non-public creator', () => {
      expect(decide('ARCHIVED', 'FREE', 'stranger', true, true)).toBe('hidden');
      expect(decide('PUBLISHED', 'PREMIUM', 'stranger', false, true)).toBe('hidden');
      expect(decide('ARCHIVED', 'PREMIUM', 'stranger', false, true)).toBe('hidden');
    });

    it('does not change what owner and admin see', () => {
      expect(decide('REMOVED', 'PREMIUM', 'owner', true, true)).toBe('hidden');
      expect(decide('REMOVED', 'PREMIUM', 'admin', true, false)).toBe('full');
    });
  });
});
