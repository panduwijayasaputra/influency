import { Module } from '@nestjs/common';
import { EarningsController } from './earnings.controller.js';
import { EarningsService } from './earnings.service.js';
import { PayoutAccountsController } from './payout-accounts.controller.js';
import { PayoutAccountsService } from './payout-accounts.service.js';
import { PayoutsController } from './payouts.controller.js';
import { PayoutsService } from './payouts.service.js';

/**
 * Creator earnings and payouts (creator-studio US-060 to US-064): the earnings balance and activity, payout accounts,
 * and requesting / cancelling a payout. Nothing here moves money: a payout is only requested and reserved.
 */
@Module({
  controllers: [EarningsController, PayoutAccountsController, PayoutsController],
  providers: [EarningsService, PayoutAccountsService, PayoutsService],
  exports: [EarningsService, PayoutAccountsService, PayoutsService],
})
export class PayoutsModule {}
