import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  PAYOUT_ACCOUNT_MAX,
  type PayoutAccountInput,
  payoutAccountListSchema,
  payoutAccountSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { decryptField, loadFieldKey } from '../../common/field-encryption.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { PayoutAccountsService } from './payout-accounts.service.js';

const WEB_ORIGIN = 'http://localhost:3000';

type Creator = { userId: string; creatorProfileId: string; token: string };

// Payout accounts are soft-delete only (and their creator is referenced), so nothing is deleted: a fresh creator per
// test, with LEFTOVER_CREATED_AT so the leftovers sink in ranked lists.
describe('payout accounts', () => {
  const prisma = createTestPrisma();
  const key = loadFieldKey(process.env.PAYOUT_ACCOUNT_ENC_KEY ?? '');
  let app: NestFastifyApplication;
  let accounts: PayoutAccountsService;
  // Sessions are created once, here: the auth spec counts sessions across a request.
  let alice: Creator;
  let bob: Creator;
  let limited: Creator;
  let plain: Creator;

  beforeAll(async () => {
    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    accounts = app.get(PayoutAccountsService);
    [alice, bob, limited] = await Promise.all([
      newCreator(true),
      newCreator(true),
      newCreator(true),
    ]);
    plain = await newUser(true);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newUser(withSession: boolean): Promise<Creator> {
    const user = await prisma.user.create({ data: { displayName: 'Accounts spec' } });
    const token = `payout-accounts-spec-${randomUUID()}`;
    if (withSession) {
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256hex(token),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    return { userId: user.id, creatorProfileId: '', token };
  }
  async function newCreator(withSession = false): Promise<Creator> {
    const user = await newUser(withSession);
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.userId,
        slug: `acct-${randomUUID().slice(0, 10)}`,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Accounts'),
      },
    });
    return { ...user, creatorProfileId: profile.id };
  }

  let seq = 0;
  /** A valid input; every call gets a different number so accounts are told apart. */
  const input = (over: Partial<PayoutAccountInput> = {}): PayoutAccountInput => ({
    bankCode: 'BCA',
    accountNumber: String(1_000_000_000 + seq++),
    holderName: 'Nadia Kirana',
    makeActive: false,
    ...over,
  });
  const activeCount = async (creatorProfileId: string) =>
    prisma.creatorPayoutAccount.count({
      where: { creatorProfileId, active: true, deletedAt: null },
    });

  describe('service', () => {
    it('makes the first account active, later ones inactive unless asked', async () => {
      const c = await newCreator();
      const first = await accounts.create(c.creatorProfileId, input());
      const second = await accounts.create(c.creatorProfileId, input());
      expect([first.active, second.active]).toEqual([true, false]);
      const third = await accounts.create(c.creatorProfileId, input({ makeActive: true }));
      expect(third.active).toBe(true);
      expect((await accounts.list(c.creatorProfileId)).map((a) => a.active)).toEqual([
        true,
        false,
        false,
      ]);
      expect(await activeCount(c.creatorProfileId)).toBe(1);
    });

    it(`refuses a ${PAYOUT_ACCOUNT_MAX + 1}th account`, async () => {
      const c = await newCreator();
      for (let i = 0; i < PAYOUT_ACCOUNT_MAX; i++)
        await accounts.create(c.creatorProfileId, input());
      await expect(accounts.create(c.creatorProfileId, input())).rejects.toMatchObject({
        code: 'PAYOUT_ACCOUNT_LIMIT',
      });
      expect(await accounts.list(c.creatorProfileId)).toHaveLength(PAYOUT_ACCOUNT_MAX);
    });

    it('does not count a deleted account toward the limit', async () => {
      const c = await newCreator();
      await accounts.create(c.creatorProfileId, input());
      const extras = [
        await accounts.create(c.creatorProfileId, input()),
        await accounts.create(c.creatorProfileId, input()),
      ];
      await accounts.remove(c.creatorProfileId, extras[0]!.id);
      await expect(accounts.create(c.creatorProfileId, input())).resolves.toBeDefined();
    });

    it('encrypts the number: the database holds ciphertext bound to the creator, last4 is separate', async () => {
      const c = await newCreator();
      const other = await newCreator();
      const created = await accounts.create(
        c.creatorProfileId,
        input({ accountNumber: '9876543210' }),
      );
      const row = await prisma.creatorPayoutAccount.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row.accountNumberEnc).not.toContain('9876543210');
      expect(row.accountNumberEnc.startsWith('v1:')).toBe(true);
      expect(row.last4).toBe('3210');
      expect(decryptField(row.accountNumberEnc, key, c.creatorProfileId)).toBe('9876543210');
      // The same ciphertext does not open under another creator.
      expect(() => decryptField(row.accountNumberEnc, key, other.creatorProfileId)).toThrow();
    });

    it('stores the same number differently each time', async () => {
      const c = await newCreator();
      const a = await accounts.create(c.creatorProfileId, input({ accountNumber: '5555555555' }));
      const b = await accounts.create(c.creatorProfileId, input({ accountNumber: '5555555555' }));
      const rows = await prisma.creatorPayoutAccount.findMany({
        where: { id: { in: [a.id, b.id] } },
      });
      expect(new Set(rows.map((r) => r.accountNumberEnc)).size).toBe(2);
    });

    it('activates one account and deactivates the others', async () => {
      const c = await newCreator();
      await accounts.create(c.creatorProfileId, input());
      const second = await accounts.create(c.creatorProfileId, input());
      const list = await accounts.activate(c.creatorProfileId, second.id);
      expect(list.filter((a) => a.active).map((a) => a.id)).toEqual([second.id]);
      // Activating the active one again changes nothing.
      expect(
        (await accounts.activate(c.creatorProfileId, second.id)).filter((a) => a.active),
      ).toHaveLength(1);
    });

    it('refuses to delete the active account, and the only account is the active one', async () => {
      const c = await newCreator();
      const only = await accounts.create(c.creatorProfileId, input());
      await expect(accounts.remove(c.creatorProfileId, only.id)).rejects.toMatchObject({
        code: 'PAYOUT_ACCOUNT_ACTIVE',
      });
      expect(await accounts.list(c.creatorProfileId)).toHaveLength(1);
    });

    it('soft-deletes an inactive account: gone from the list, the row stays', async () => {
      const c = await newCreator();
      await accounts.create(c.creatorProfileId, input());
      const extra = await accounts.create(c.creatorProfileId, input());
      await accounts.remove(c.creatorProfileId, extra.id);
      expect(await accounts.list(c.creatorProfileId)).toHaveLength(1);
      const row = await prisma.creatorPayoutAccount.findUniqueOrThrow({ where: { id: extra.id } });
      expect(row.deletedAt).not.toBeNull();
      // A deleted account is gone for every action.
      await expect(accounts.remove(c.creatorProfileId, extra.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(accounts.activate(c.creatorProfileId, extra.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it("cannot touch another creator's account", async () => {
      const mine = await newCreator();
      const theirs = await newCreator();
      await accounts.create(theirs.creatorProfileId, input());
      const [theirAccount] = await accounts.list(theirs.creatorProfileId);
      await expect(
        accounts.activate(mine.creatorProfileId, theirAccount!.id),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(accounts.remove(mine.creatorProfileId, theirAccount!.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(await accounts.list(mine.creatorProfileId)).toEqual([]);
      expect(await accounts.list(theirs.creatorProfileId)).toHaveLength(1);
    });

    it('exposes the active account for a payout request, without the number', async () => {
      const c = await newCreator();
      expect(
        await prisma.$transaction((tx) => accounts.activeInTx(tx, c.creatorProfileId)),
      ).toBeNull();
      const created = await accounts.create(
        c.creatorProfileId,
        input({ accountNumber: '1234564821' }),
      );
      const active = await prisma.$transaction((tx) => accounts.activeInTx(tx, c.creatorProfileId));
      expect(active).toEqual({
        id: created.id,
        bankCode: 'BCA',
        last4: '4821',
        holderName: 'Nadia Kirana',
      });
    });

    describe('concurrency', () => {
      it(`never exceeds ${PAYOUT_ACCOUNT_MAX} accounts or two active ones when creates race`, async () => {
        const c = await newCreator();
        const results = await Promise.allSettled(
          Array.from({ length: 8 }, () =>
            accounts.create(c.creatorProfileId, input({ makeActive: true })),
          ),
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(PAYOUT_ACCOUNT_MAX);
        for (const r of results.filter((r) => r.status === 'rejected')) {
          expect(r.reason).toMatchObject({
            code: 'PAYOUT_ACCOUNT_LIMIT',
          });
        }
        expect(await accounts.list(c.creatorProfileId)).toHaveLength(PAYOUT_ACCOUNT_MAX);
        expect(await activeCount(c.creatorProfileId)).toBe(1);
      });

      it('leaves exactly one active account when activations race', async () => {
        const c = await newCreator();
        const created = [
          await accounts.create(c.creatorProfileId, input()),
          await accounts.create(c.creatorProfileId, input()),
          await accounts.create(c.creatorProfileId, input()),
        ];
        await Promise.all(created.map((a) => accounts.activate(c.creatorProfileId, a.id)));
        expect(await activeCount(c.creatorProfileId)).toBe(1);
      });

      it('never deletes the account that a racing activation just moved off', async () => {
        const c = await newCreator();
        const first = await accounts.create(c.creatorProfileId, input());
        const second = await accounts.create(c.creatorProfileId, input());
        // Delete the second while it is being made active: either it is deleted first (then activating it is a
        // NOT_FOUND) or it becomes active first (then deleting it is refused). Never an active, deleted account.
        const results = await Promise.allSettled([
          accounts.activate(c.creatorProfileId, second.id),
          accounts.remove(c.creatorProfileId, second.id),
        ]);
        expect(results.some((r) => r.status === 'rejected')).toBe(true);
        expect(await activeCount(c.creatorProfileId)).toBe(1);
        const rows = await prisma.creatorPayoutAccount.findMany({
          where: { creatorProfileId: c.creatorProfileId },
        });
        expect(rows.some((r) => r.active && r.deletedAt !== null)).toBe(false);
        expect(rows.find((r) => r.id === first.id)).toBeDefined();
      });
    });
  });

  describe('HTTP', () => {
    const call = (
      who: Creator | undefined,
      method: 'GET' | 'POST' | 'DELETE',
      url: string,
      payload?: unknown,
      /** A string, or null for a request that carries no Origin header at all. */
      origin: string | null = WEB_ORIGIN,
    ) =>
      app.inject({
        method,
        url: `/api/v1/me/payout-accounts${url}`,
        headers: origin && method !== 'GET' ? { origin } : {},
        cookies: who ? { influency_session: who.token } : {},
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
    const body = (over: Record<string, unknown> = {}) => ({
      bankCode: 'BCA',
      accountNumber: '1234 5648 21',
      holderName: 'Nadia Kirana',
      ...over,
    });

    it('creates, lists, activates and deletes, answering with the masked account only', async () => {
      const created = await call(alice, 'POST', '', body());
      expect(created.statusCode).toBe(201);
      expect(created.headers['cache-control']).toBe('no-store');
      const first = payoutAccountSchema.parse(created.json());
      expect(first).toMatchObject({ bankName: 'BCA', last4: '4821', active: true });
      expect(JSON.stringify(created.json())).not.toContain('1234564821');
      expect(Object.keys(created.json<object>()).sort()).toEqual(
        ['active', 'bankCode', 'bankName', 'createdAt', 'holderName', 'id', 'last4'].sort(),
      );

      const second = payoutAccountSchema.parse(
        (
          await call(alice, 'POST', '', body({ accountNumber: '9988776655', bankCode: 'JAGO' }))
        ).json(),
      );
      expect(second).toMatchObject({ active: false, bankName: 'Bank Jago', last4: '6655' });

      const listed = await call(alice, 'GET', '');
      expect(listed.statusCode).toBe(200);
      expect(JSON.stringify(listed.json())).not.toMatch(/accountNumber|1234564821|9988776655/);
      const list = payoutAccountListSchema.parse(listed.json()).accounts;
      expect(list.map((a) => a.id)).toEqual([first.id, second.id]);

      const activated = await call(alice, 'POST', `/${second.id}/activate`);
      expect(activated.statusCode).toBe(200);
      expect(
        payoutAccountListSchema
          .parse(activated.json())
          .accounts.filter((a) => a.active)
          .map((a) => a.id),
      ).toEqual([second.id]);

      expect((await call(alice, 'DELETE', `/${second.id}`)).statusCode).toBe(409);
      const removed = await call(alice, 'DELETE', `/${first.id}`);
      expect(removed.statusCode).toBe(204);
      expect(
        payoutAccountListSchema.parse((await call(alice, 'GET', '')).json()).accounts,
      ).toHaveLength(1);
    });

    it('answers PAYOUT_ACCOUNT_ACTIVE with 409 and PAYOUT_ACCOUNT_LIMIT with 409', async () => {
      const del = await call(alice, 'GET', '');
      const [active] = payoutAccountListSchema.parse(del.json()).accounts.filter((a) => a.active);
      const refused = await call(alice, 'DELETE', `/${active!.id}`);
      expect(refused.statusCode).toBe(409);
      expect(refused.json<{ error: { code: string } }>().error.code).toBe('PAYOUT_ACCOUNT_ACTIVE');
      for (let i = 0; i < PAYOUT_ACCOUNT_MAX; i++) {
        await call(alice, 'POST', '', body({ accountNumber: String(2_000_000_000 + i) }));
      }
      const over = await call(alice, 'POST', '', body({ accountNumber: '3000000000' }));
      expect(over.statusCode).toBe(409);
      expect(over.json<{ error: { code: string } }>().error.code).toBe('PAYOUT_ACCOUNT_LIMIT');
    });

    it.each([
      ['5 digits', { accountNumber: '12345' }],
      ['21 digits', { accountNumber: '1'.repeat(21) }],
      ['letters', { accountNumber: '12ab5678' }],
      ['an unknown bank', { bankCode: 'XYZ' }],
      ['an empty holder', { holderName: '   ' }],
      ['a holder over 100 characters', { holderName: 'x'.repeat(101) }],
      ['an extra key', { role: 'ADMIN' }],
    ])('400s %s without echoing the number', async (_label, over) => {
      const res = await call(bob, 'POST', '', body(over));
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
      expect(res.body).not.toContain('1234');
      expect(
        await prisma.creatorPayoutAccount.count({
          where: { creatorProfileId: bob.creatorProfileId },
        }),
      ).toBe(0);
    });

    it("404s another creator's account and a missing one; 400s a malformed id", async () => {
      await call(bob, 'POST', '', body({ accountNumber: '7777777777' }));
      const [theirs] = payoutAccountListSchema.parse((await call(bob, 'GET', '')).json()).accounts;
      for (const [method, url] of [
        ['POST', `/${theirs!.id}/activate`],
        ['DELETE', `/${theirs!.id}`],
        ['POST', '/0190a000-0000-7000-8000-00000000dead/activate'],
        ['DELETE', '/0190a000-0000-7000-8000-00000000dead'],
      ] as const) {
        expect((await call(alice, method, url)).statusCode).toBe(404);
      }
      expect((await call(alice, 'DELETE', '/nope')).statusCode).toBe(400);
      expect(
        payoutAccountListSchema.parse((await call(bob, 'GET', '')).json()).accounts,
      ).toHaveLength(1);
    });

    it('401s a guest, 403s a non-creator, and 403s a cross-site write', async () => {
      expect((await call(undefined, 'GET', '')).statusCode).toBe(401);
      const nonCreator = await call(plain, 'GET', '');
      expect(nonCreator.statusCode).toBe(403);
      expect(nonCreator.json<{ error: { code: string } }>().error.code).toBe(
        'CREATOR_NOT_APPROVED',
      );
      const crossSite = await call(alice, 'POST', '', body(), 'https://evil.example');
      expect(crossSite.statusCode).toBe(403);
      const noOrigin = await call(alice, 'POST', '', body(), null);
      expect(noOrigin.statusCode).toBe(403);
    });

    it('rate-limits writes per creator', async () => {
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await call(limited, 'POST', '/0190a000-0000-7000-8000-00000000dead/activate');
        codes.push(res.statusCode);
      }
      expect(codes.slice(0, 10).every((c) => c === 404)).toBe(true);
      expect(codes.slice(10)).toEqual([429, 429]);
    });
  });
});
