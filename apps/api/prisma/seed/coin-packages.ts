import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { DEMO_COIN_PACKAGE_IDS } from '../../src/common/demo-ids.js';

/** LOCKED (Monetization Spec v1 §2): 1 Koin = Rp1.000, no bonus Koin. */
const IDR_PER_KOIN = 1000;

export async function seedCoinPackages(prisma: PrismaClient): Promise<void> {
  for (const [coins, id] of Object.entries(DEMO_COIN_PACKAGE_IDS)) {
    const n = Number(coins);
    await prisma.coinPackage.upsert({
      where: { id },
      create: { id, coins: n, priceIdr: n * IDR_PER_KOIN },
      // Re-seeding must not flip a package an operator deactivated.
      update: { coins: n, priceIdr: n * IDR_PER_KOIN },
    });
  }
}
