import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { grantKoin } from './koin.js';

// pnpm db:grant-koin <amount> [userId | "display name" | latest]   (default: the most recently created user)
const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to grant free Koin with NODE_ENV=production.');
  process.exit(1);
}

const [amountArg, who = 'latest'] = process.argv.slice(2);
if (!amountArg || !/^[1-9]\d{0,8}$/.test(amountArg)) {
  console.error('Usage: pnpm db:grant-koin <amount> [userId | display name | latest]');
  process.exit(1);
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});
try {
  const user =
    who === 'latest'
      ? await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } })
      : /^[0-9a-f-]{36}$/.test(who)
        ? await prisma.user.findUnique({ where: { id: who } })
        : await prisma.user.findFirst({ where: { displayName: who } });
  if (!user) throw new Error(`No user matches "${who}".`);
  await grantKoin(prisma, user.id, BigInt(amountArg));
  const wallet = await prisma.coinWallet.findUniqueOrThrow({ where: { userId: user.id } });
  console.log(
    `${user.displayName} (${user.id}): +${amountArg} Koin, balance ${wallet.balanceCoins}`,
  );
} finally {
  await prisma.$disconnect();
}
