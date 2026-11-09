import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WalletsModule } from '../wallets/wallets.module.js';
import { MidtransWebhookController } from './midtrans-webhook.controller.js';
import { TopupReconciler } from './topup-reconciler.js';
import { TopupReconcileService } from './topup-reconcile.service.js';
import { TopupCreditService } from './topup-credit.service.js';
import { TopupsController } from './topups.controller.js';
import { TopupsService } from './topups.service.js';

/** Koin top-up orders and their payment gateway (koin-wallet US-030 to US-032). */
@Module({
  imports: [WalletsModule, NotificationsModule],
  controllers: [TopupsController, MidtransWebhookController],
  providers: [TopupsService, TopupCreditService, TopupReconcileService, TopupReconciler],
  exports: [TopupsService, TopupCreditService, TopupReconcileService],
})
export class TopupsModule {}
