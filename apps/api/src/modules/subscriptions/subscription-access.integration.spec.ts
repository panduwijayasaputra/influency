import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { publicPostDetailSchema, SESSION_COOKIE } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import type { PostStatus } from '../../generated/prisma/client.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const RUN = randomUUID().slice(0, 8);
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);

// Spec §15 "Premium and archive" and "Subscription": access from subscription periods, by timestamps and server time.
describe('subscriber access to premium posts', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let n = 0;

  beforeAll(async () => {
    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newCreator() {
    const user = await prisma.user.create({ data: { displayName: 'Access creator' } });
    const slug = `acc-${RUN}-${++n}`;
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Acc'),
      },
    });
    const plan = await prisma.creatorSubscriptionPlan.create({
      data: { creatorProfileId: profile.id, version: 1, priceCoins: 75n, active: true },
    });
    return { profileId: profile.id, slug, planId: plan.id };
  }
  async function newFan() {
    const user = await prisma.user.create({ data: { displayName: 'Access fan' } });
    const token = `acc-spec-${randomUUID()}`;
    await prisma.session.create({
      data: { userId: user.id, tokenHash: sha256hex(token), expiresAt: at(1) },
    });
    return { id: user.id, token };
  }
  type Creator = Awaited<ReturnType<typeof newCreator>>;
  type Fan = Awaited<ReturnType<typeof newFan>>;

  async function period(
    fan: Fan,
    creator: Creator,
    startsAt: Date,
    over: { canceledAt?: Date; planId?: string } = {},
  ) {
    return prisma.subscriptionPeriod.create({
      data: {
        userId: fan.id,
        creatorProfileId: creator.profileId,
        planId: over.planId ?? creator.planId,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * DAY),
        canceledAt: over.canceledAt ?? null,
      },
    });
  }
  async function post(creator: Creator, status: PostStatus = 'PUBLISHED', archivedAt?: Date) {
    const row = await prisma.post.create({
      data: {
        creatorProfileId: creator.profileId,
        visibility: 'PREMIUM',
        status,
        publishedAt: at(-60),
      },
    });
    await prisma.postOffer.create({ data: { postId: row.id, version: 1, priceCoins: 25n } });
    if (archivedAt) {
      await prisma.postArchiveEpisode.create({ data: { postId: row.id, archivedAt } });
    }
    return row.id;
  }
  const cookies = (fan: Fan | undefined): Record<string, string> =>
    fan ? { [SESSION_COOKIE]: fan.token } : {};
  const detail = async (fan: Fan | undefined, creator: Creator, postId: string) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/creators/${creator.slug}/posts/${postId}`,
      cookies: cookies(fan),
    });
    return res.statusCode === 200 ? publicPostDetailSchema.parse(res.json()) : res.statusCode;
  };
  /** 'full' | 'locked' from the detail, or 404 when the post is hidden. */
  const accessOf = async (fan: Fan | undefined, creator: Creator, postId: string) => {
    const d = await detail(fan, creator, postId);
    return typeof d === 'number' ? d : d.access;
  };
  const media = (fan: Fan | undefined, postId: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/media-access`,
      cookies: cookies(fan),
    });

  it('opens every published premium post for an active subscriber, including later ones', async () => {
    const creator = await newCreator();
    const [fan, other] = [await newFan(), await newFan()];
    const before = await post(creator);
    await period(fan, creator, at(-5));
    const later = await post(creator); // published after the subscription started
    for (const id of [before, later]) {
      expect(await accessOf(fan, creator, id)).toBe('full');
      expect((await media(fan, id)).statusCode).toBe(200);
      expect(await accessOf(other, creator, id)).toBe('locked');
      expect((await media(other, id)).statusCode).toBe(403);
      expect(await accessOf(undefined, creator, id)).toBe('locked');
    }
  });

  it('locks again once the period has ended or was cancelled', async () => {
    const creator = await newCreator();
    const [expired, cancelled] = [await newFan(), await newFan()];
    const id = await post(creator);
    await period(expired, creator, at(-40)); // ended 10 days ago
    await period(cancelled, creator, at(5), { canceledAt: new Date() }); // would start in 5 days
    expect(await accessOf(expired, creator, id)).toBe('locked');
    expect(await accessOf(cancelled, creator, id)).toBe('locked');
    const early = await newFan();
    await period(early, creator, at(5)); // prepaid, not started yet
    expect(await accessOf(early, creator, id)).toBe('locked');
  });

  it("does not let creator A's subscription open creator B's posts", async () => {
    const [a, b] = [await newCreator(), await newCreator()];
    const fan = await newFan();
    await period(fan, a, at(-1));
    const idB = await post(b);
    expect(await accessOf(fan, b, idB)).toBe('locked');
    expect((await media(fan, idB)).statusCode).toBe(403);
  });

  it('keeps an archived post open for who was subscribed at archival, until that period ends', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, at(-10)); // active now, until in 20 days
    const id = await post(creator, 'ARCHIVED', at(-2));
    expect(await accessOf(fan, creator, id)).toBe('full');
    expect((await media(fan, id)).statusCode).toBe(200);

    // The same grant after the period ended: gone.
    const gone = await newFan();
    await period(gone, creator, at(-40)); // [-40, -10)
    const old = await post(creator, 'ARCHIVED', at(-20)); // archived 20 days ago: the period was over by then too
    expect(await accessOf(gone, creator, old)).toBe(404);
    const endedSince = await post(creator, 'ARCHIVED', at(-30)); // archived inside that period
    expect(await accessOf(gone, creator, endedSince)).toBe(404); // the period has ended: no grant any more
  });

  it('gives nothing to who subscribes after the archive, or only has a prepaid renewal', async () => {
    const creator = await newCreator();
    const late = await newFan();
    const archived = await post(creator, 'ARCHIVED', at(-5));
    await period(late, creator, at(-1)); // started after the archive
    expect(await accessOf(late, creator, archived)).toBe(404);

    const renewal = await newFan();
    await period(renewal, creator, at(-35)); // ended 5 days ago
    await period(renewal, creator, at(-5)); // the early renewal that began right after
    const archivedBetween = await post(creator, 'ARCHIVED', at(-10)); // archived while the first period was active
    // The first period ended 5 days ago, so no live period covers the archive instant: no grant.
    expect(await accessOf(renewal, creator, archivedBetween)).toBe(404);
  });

  it('does not let a scheduled renewal extend an archive grant', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, at(-10)); // active: [-10, +20)
    await period(fan, creator, at(20)); // prepaid renewal: [+20, +50)
    const archived = await post(creator, 'ARCHIVED', at(-1));
    expect(await accessOf(fan, creator, archived)).toBe('full'); // via the first period only
    // Someone whose only period is a prepaid renewal has no period that was active at the archive instant.
    const renewalOnly = await newFan();
    await period(renewalOnly, creator, at(20));
    expect(await accessOf(renewalOnly, creator, archived)).toBe(404);
  });

  it('brings a republished post back to normal subscriber access, and a re-archive is judged again', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, at(-10));
    const id = await post(creator, 'ARCHIVED', at(-3));
    expect(await accessOf(fan, creator, id)).toBe('full');

    await prisma.postArchiveEpisode.updateMany({
      where: { postId: id },
      data: { restoredAt: new Date() },
    });
    await prisma.post.update({ where: { id }, data: { status: 'PUBLISHED' } });
    expect(await accessOf(fan, creator, id)).toBe('full'); // subscriber access again

    await prisma.post.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await prisma.postArchiveEpisode.create({ data: { postId: id, archivedAt: at(-1) } });
    expect(await accessOf(fan, creator, id)).toBe('full'); // fresh episode, period still covers it
    const stranger = await newFan();
    expect(await accessOf(stranger, creator, id)).toBe(404);
  });

  it('keeps a bought post open after the subscription expired', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, at(-40));
    const id = await post(creator);
    await prisma.postPurchase.create({
      data: {
        userId: fan.id,
        postId: id,
        postOfferId: (await prisma.postOffer.findFirstOrThrow({ where: { postId: id } })).id,
        priceCoins: 25n,
        feeBps: 2000,
      },
    });
    expect(await accessOf(fan, creator, id)).toBe('full');
    await prisma.post.update({ where: { id }, data: { status: 'ARCHIVED' } });
    expect(await accessOf(fan, creator, id)).toBe('full');
  });

  it('never opens a removed or draft post for a subscriber', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, at(-5));
    expect(await accessOf(fan, creator, await post(creator, 'REMOVED'))).toBe(404);
    expect(await accessOf(fan, creator, await post(creator, 'DRAFT'))).toBe(404);
  });

  it('reports viewer.subscribed only while a period is active', async () => {
    const creator = await newCreator();
    const [active, none, scheduledOnly] = [await newFan(), await newFan(), await newFan()];
    await period(active, creator, at(-5));
    await period(scheduledOnly, creator, at(5));
    const id = await post(creator);
    const subscribed = async (fan: Fan) => {
      const d = await detail(fan, creator, id);
      return typeof d === 'number' ? d : d.viewer?.subscribed;
    };
    expect(await subscribed(active)).toBe(true);
    expect(await subscribed(none)).toBe(false);
    expect(await subscribed(scheduledOnly)).toBe(false);
  });
});
