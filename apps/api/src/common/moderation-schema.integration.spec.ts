import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../test/creator-profile.js';
import { createTestPrisma } from '../../test/prisma.js';

describe('post_reports / moderation_actions constraints', () => {
  const prisma = createTestPrisma();
  const creatorId = '0190a000-0000-7000-8000-000000420001';
  const reporterId = '0190a000-0000-7000-8000-000000420002';
  const adminId = '0190a000-0000-7000-8000-000000420003';
  const profileId = '0190a000-0000-7000-8000-000000420101';
  const postId = '0190a000-0000-7000-8000-000000420201';
  const report = { postId, reporterId, reason: 'SPAM' as const };

  beforeAll(async () => {
    for (const id of [creatorId, reporterId, adminId]) {
      await prisma.user.create({ data: { id, displayName: 'Tester' } });
    }
    await prisma.creatorProfile.create({
      data: { id: profileId, userId: creatorId, slug: 'moderation-spec', ...profileFields() },
    });
    await prisma.post.create({
      data: { id: postId, creatorProfileId: profileId, visibility: 'FREE', status: 'PUBLISHED' },
    });
  });

  afterAll(async () => {
    await prisma.postReport.deleteMany({ where: { postId } });
    await prisma.moderationAction.deleteMany({ where: { adminId } });
    await prisma.post.deleteMany({ where: { id: postId } });
    await prisma.creatorProfile.deleteMany({ where: { id: profileId } });
    await prisma.user.deleteMany({ where: { id: { in: [creatorId, reporterId, adminId] } } });
    await prisma.$disconnect();
  });

  it('allows one open report per reporter and post, and a new one once resolved', async () => {
    const first = await prisma.postReport.create({ data: report });
    await expect(prisma.postReport.create({ data: report })).rejects.toMatchObject({
      code: 'P2002',
    });

    const action = await prisma.moderationAction.create({
      data: { adminId, action: 'DISMISS', postId },
    });
    await prisma.postReport.update({
      where: { id: first.id },
      data: { resolvedByActionId: action.id },
    });
    await expect(prisma.postReport.create({ data: report })).resolves.toBeTruthy();
  });

  it('requires a note for OTHER and caps note length', async () => {
    await expect(
      prisma.postReport.create({ data: { ...report, reporterId: adminId, reason: 'OTHER' } }),
    ).rejects.toThrow(/post_reports_other_has_note/);
    await expect(
      prisma.postReport.create({ data: { ...report, reporterId: adminId, note: 'a'.repeat(501) } }),
    ).rejects.toThrow(/post_reports_note_length/);
    await expect(
      prisma.moderationAction.create({
        data: { adminId, action: 'DISMISS', postId, note: 'a'.repeat(501) },
      }),
    ).rejects.toThrow(/moderation_actions_note_length/);
  });

  it('ties post actions to a post and user actions to a user', async () => {
    await expect(
      prisma.moderationAction.create({
        data: { adminId, action: 'HIDE', postId, targetUserId: creatorId },
      }),
    ).rejects.toThrow(/moderation_actions_target/);
    await expect(
      prisma.moderationAction.create({ data: { adminId, action: 'REMOVE' } }),
    ).rejects.toThrow(/moderation_actions_target/);
    await expect(
      prisma.moderationAction.create({ data: { adminId, action: 'SUSPEND_USER', postId } }),
    ).rejects.toThrow(/moderation_actions_target/);
    await expect(
      prisma.moderationAction.create({
        data: { adminId, action: 'SUSPEND_USER', targetUserId: creatorId },
      }),
    ).resolves.toBeTruthy();
  });

  it('keeps history: a reported post cannot be deleted', async () => {
    await expect(prisma.post.delete({ where: { id: postId } })).rejects.toThrow();
  });
});
