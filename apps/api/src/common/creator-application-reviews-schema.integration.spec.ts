import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../test/creator-profile.js';
import { createTestPrisma } from '../../test/prisma.js';

describe('creator_application_reviews constraints', () => {
  const prisma = createTestPrisma();
  const applicantId = '0190a000-0000-7000-8000-0000000d0001';
  const reviewerId = '0190a000-0000-7000-8000-0000000d0002';
  const profileId = '0190a000-0000-7000-8000-0000000d0101';
  const review = { creatorProfileId: profileId, reviewerId };

  beforeAll(async () => {
    for (const id of [applicantId, reviewerId]) {
      await prisma.user.create({ data: { id, displayName: 'Tester' } });
    }
    await prisma.creatorProfile.create({
      data: { id: profileId, userId: applicantId, slug: 'reviews-spec', ...profileFields() },
    });
  });

  afterAll(async () => {
    await prisma.creatorApplicationReview.deleteMany({ where: { creatorProfileId: profileId } });
    await prisma.creatorProfile.deleteMany({ where: { id: profileId } });
    await prisma.user.deleteMany({ where: { id: { in: [applicantId, reviewerId] } } });
    await prisma.$disconnect();
  });

  it('rejects a rejection without a reason and an approval with one', async () => {
    await expect(
      prisma.creatorApplicationReview.create({ data: { ...review, decision: 'REJECTED' } }),
    ).rejects.toThrow(/creator_application_reviews_reason/);
    await expect(
      prisma.creatorApplicationReview.create({
        data: { ...review, decision: 'APPROVED', reason: 'ok' },
      }),
    ).rejects.toThrow(/creator_application_reviews_reason/);
  });

  it('stores valid decisions with a server timestamp', async () => {
    const rejected = await prisma.creatorApplicationReview.create({
      data: { ...review, decision: 'REJECTED', reason: 'Foto tidak jelas' },
    });
    const approved = await prisma.creatorApplicationReview.create({
      data: { ...review, decision: 'APPROVED' },
    });
    expect(rejected.createdAt).toBeInstanceOf(Date);
    expect(approved.reason).toBeNull();
  });

  it('keeps the history: a profile with reviews cannot be deleted', async () => {
    await expect(prisma.creatorProfile.delete({ where: { id: profileId } })).rejects.toThrow();
  });
});
