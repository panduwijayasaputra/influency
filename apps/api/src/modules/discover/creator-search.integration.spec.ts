import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { CREATOR_SEARCH_LIMIT, creatorSearchResponseSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows. Every slug and name carries "qzx" so
// the queries below only ever match this spec's creators.
const id = (n: number) => `0190a000-0000-7000-8000-0000007000${String(n).padStart(2, '0')}`;
type Creator = {
  n: number;
  slug: string;
  name: string;
  status?: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED';
  suspended?: boolean;
};
const CREATORS: Creator[] = [
  { n: 1, slug: 'qzxnadia', name: 'Nadia Qzx' },
  { n: 2, slug: 'qzx', name: 'Zed Exact' },
  { n: 3, slug: 'aqzxb', name: 'Middle Match' },
  { n: 4, slug: 'kirana-qzx', name: 'Kirana' },
  { n: 5, slug: 'percent-qzx', name: 'Diskon 100% Qzx' },
  { n: 6, slug: 'under-qzx', name: 'Under_score Qzx' },
  { n: 7, slug: 'qzxpending', name: 'Pending Qzx', status: 'PENDING_REVIEW' },
  { n: 8, slug: 'qzxrejected', name: 'Rejected Qzx', status: 'REJECTED' },
  { n: 9, slug: 'qzxsuspended', name: 'Suspended Qzx', suspended: true },
];
// Plain user (no creator profile) whose name matches.
const PLAIN = id(50);
// Many matches to check the result cap.
const MANY = Array.from({ length: CREATOR_SEARCH_LIMIT + 3 }, (_, i) => ({
  n: 60 + i,
  slug: `qzxmany${String(i).padStart(2, '0')}`,
  name: `Banyak ${i}`,
}));

async function boot() {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue(parseEnv(process.env))
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false }),
      { logger: false },
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('GET /discover/creators', () => {
  const prisma = createTestPrisma();
  const all: Creator[] = [...CREATORS, ...MANY];
  const userIds = [...all.map((c) => id(c.n)), PLAIN];
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        ...all.map((c) => ({
          id: id(c.n),
          displayName: c.name,
          // Ranked last in GET /creators/recommended while it exists, so parallel specs aren't disturbed.
          createdAt: LEFTOVER_CREATED_AT,
          status: c.suspended ? ('SUSPENDED' as const) : ('ACTIVE' as const),
        })),
        { id: PLAIN, displayName: 'Plain Qzx User' },
      ],
    });
    for (const c of all) {
      await prisma.creatorProfile.create({
        data: {
          userId: id(c.n),
          slug: c.slug,
          status: c.status ?? 'APPROVED',
          ...profileFields(c.slug),
          displayName: c.name,
          // Ranked last in GET /creators/recommended while it exists, so parallel specs aren't disturbed.
          createdAt: LEFTOVER_CREATED_AT,
        },
      });
    }
    app = await boot();
  });

  afterAll(async () => {
    await app.close();
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const search = (q: string) =>
    app.inject({ method: 'GET', url: `/api/v1/discover/creators?q=${encodeURIComponent(q)}` });
  const slugs = async (q: string) => {
    const res = await search(q);
    expect(res.statusCode).toBe(200);
    return creatorSearchResponseSchema.parse(res.json()).creators.map((c) => c.slug);
  };

  it('is public, never cached, and returns only slug, name and avatar', async () => {
    const res = await search('kirana-qzx');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const [first] = res.json<{ creators: Record<string, unknown>[] }>().creators;
    expect(Object.keys(first!).sort()).toEqual(['avatarUrl', 'displayName', 'slug']);
  });

  it('matches names case-insensitively and slugs', async () => {
    expect(await slugs('KIRANA')).toEqual(['kirana-qzx']);
    expect(await slugs('middle match')).toEqual(['aqzxb']);
    expect(await slugs('  under-qzx  ')).toEqual(['under-qzx']);
  });

  it('ranks the exact slug, then slug prefixes, then other matches', async () => {
    const found = await slugs('qzx');
    expect(found).toHaveLength(CREATOR_SEARCH_LIMIT);
    expect(found[0]).toBe('qzx');
    // Prefix matches (qzxmany…, qzxnadia) come before contains-only matches (aqzxb, kirana-qzx…).
    const firstContains = found.findIndex((s) => !s.startsWith('qzx'));
    if (firstContains >= 0)
      expect(found.slice(firstContains).every((s) => !s.startsWith('qzx'))).toBe(true);
  });

  it('treats % and _ as plain characters', async () => {
    expect(await slugs('100%')).toEqual(['percent-qzx']);
    expect(await slugs('r_s')).toEqual(['under-qzx']);
    expect(await slugs('%')).toEqual(['percent-qzx']);
  });

  it('never returns pending, rejected or suspended creators or plain users', async () => {
    const found = await slugs('qzx');
    for (const hidden of ['qzxpending', 'qzxrejected', 'qzxsuspended']) {
      expect(found).not.toContain(hidden);
    }
    expect(await slugs('pending qzx')).toEqual([]);
    expect(await slugs('plain qzx')).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'q'.repeat(51)],
  ])('rejects a %s query', async (_label, q) => {
    const res = await search(q);
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a missing query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/discover/creators' });
    expect(res.statusCode).toBe(400);
  });
});
