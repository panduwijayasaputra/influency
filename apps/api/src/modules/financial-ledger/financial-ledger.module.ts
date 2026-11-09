import { Module } from '@nestjs/common';
import { RevenueLedgerService } from './revenue-ledger.service.js';

/** Creator/platform revenue ledger (purchases US-036). Spend modules post their sales through the exported service. */
@Module({
  providers: [RevenueLedgerService],
  exports: [RevenueLedgerService],
})
export class FinancialLedgerModule {}
