import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { FinancialLedgerModule } from '../financial-ledger/financial-ledger.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WalletsModule } from '../wallets/wallets.module.js';
import { PostPurchasesController } from './post-purchases.controller.js';
import { TipsController } from './tips.controller.js';
import { TipsService } from './tips.service.js';
import { PostPurchasesService } from './post-purchases.service.js';

/** Koin spends: unlocking premium posts (purchases US-036) and tips (US-039); subscriptions live in the subscriptions module. */
@Module({
  imports: [WalletsModule, FinancialLedgerModule, EntitlementsModule, NotificationsModule],
  controllers: [PostPurchasesController, TipsController],
  providers: [PostPurchasesService, TipsService],
  exports: [PostPurchasesService],
})
export class PurchasesModule {}
