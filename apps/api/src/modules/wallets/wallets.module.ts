import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';

/** Koin wallet: packages, ledger, lots and balance (koin-wallet US-029). Other modules credit/debit via the exported service. */
@Module({
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
