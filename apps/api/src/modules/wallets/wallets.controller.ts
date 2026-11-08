import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { CoinPackage, Wallet, WalletTransactionsPage } from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ledgerCursorSchema } from './ledger-cursor.js';
import { WalletsService } from './wallets.service.js';

/** Koin wallet reads (US-029). The user always comes from the session: there is no user id parameter. */
@Controller('wallet')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get()
  @UseGuards(SessionGuard)
  @Header('cache-control', 'no-store')
  get(@Req() req: FastifyRequest): Promise<Wallet> {
    return this.wallets.getWallet(req.authSession!.userId);
  }

  @Get('transactions')
  @UseGuards(SessionGuard)
  @Header('cache-control', 'no-store')
  transactions(
    @Query('cursor', new ZodValidationPipe(ledgerCursorSchema.optional()))
    cursor: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<WalletTransactionsPage> {
    return this.wallets.listTransactions(req.authSession!.userId, cursor ?? null);
  }

  /** Public: the five LOCKED packages are not private. */
  @Get('packages')
  @Header('cache-control', 'public, max-age=60')
  async packages(): Promise<{ items: CoinPackage[] }> {
    return { items: await this.wallets.listPackages() };
  }
}
