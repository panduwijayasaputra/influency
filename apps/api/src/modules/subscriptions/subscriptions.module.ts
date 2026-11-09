import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { FinancialLedgerModule } from '../financial-ledger/financial-ledger.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WalletsModule } from '../wallets/wallets.module.js';
import { MySubscriptionsController } from './my-subscriptions.controller.js';
import { MySubscriptionsService } from './my-subscriptions.service.js';
import {
  SubscriptionPeriodCancelController,
  SubscriptionPeriodsController,
} from './subscription-periods.controller.js';
import { SubscriptionPeriodsService } from './subscription-periods.service.js';
import { SubscriptionPlansController } from './subscription-plans.controller.js';
import { SubscriptionPlansService } from './subscription-plans.service.js';

/** Creator subscription plans (purchases US-035) and subscribing / early renewal (US-037). */
@Module({
  imports: [WalletsModule, FinancialLedgerModule, EntitlementsModule, NotificationsModule],
  controllers: [
    SubscriptionPlansController,
    SubscriptionPeriodsController,
    SubscriptionPeriodCancelController,
    MySubscriptionsController,
  ],
  providers: [SubscriptionPlansService, SubscriptionPeriodsService, MySubscriptionsService],
  exports: [SubscriptionPlansService],
})
export class SubscriptionsModule {}
