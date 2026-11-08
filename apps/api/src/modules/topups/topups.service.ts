import { Inject, Injectable, Logger } from '@nestjs/common';
import { type CreateTopupResponse, type TopupOrder, type TopupStatus } from '@influency/shared';
import { z } from 'zod';
import { toSafeInt } from '../../common/bigint.js';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { IdempotencyService, requestHash } from '../../common/idempotency.js';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
  PaymentGatewayError,
} from '../../common/payment-gateway.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { TopupOrder as TopupRow } from '../../generated/prisma/client.js';
import { TopupReconcileService } from './topup-reconcile.service.js';
import { WalletsService } from '../wallets/wallets.service.js';

export const TOPUP_IDEMPOTENCY_SCOPE = 'topup';
const PENDING_LIST_LIMIT = 5;
/** At most one provider check per order in this window, and none that waits longer than the timeout. */
const ON_DEMAND_MIN_GAP_MS = 10_000;
const ON_DEMAND_TIMEOUT_MS = 5_000;
const uuid = z.uuid();

@Injectable()
export class TopupsService {
  private readonly logger = new Logger(TopupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly wallets: WalletsService,
    private readonly reconcile: TopupReconcileService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private finishUrl(orderId: string): string {
    return `${this.env.WEB_ORIGIN}/wallet/topups/${orderId}`;
  }

  /**
   * Creates (or replays) a top-up order for a package. The price and Koin come from the package row, never from the
   * client. Step 1 is one transaction: claim the Idempotency-Key + snapshot the order. Step 2 talks to the gateway
   * outside any transaction, so a slow provider never holds a database lock.
   */
  async create(userId: string, packageId: string, key: string): Promise<CreateTopupResponse> {
    const { orderId, replay } = await this.prisma.$transaction(async (tx) => {
      const claim = await this.idempotency.claim(tx, {
        userId,
        scope: TOPUP_IDEMPOTENCY_SCOPE,
        key,
        requestHash: requestHash({ packageId }),
      });
      if (claim.status === 'replay') {
        if (!claim.resultId) throw new DomainError('REQUEST_IN_PROGRESS');
        return { orderId: claim.resultId, replay: true };
      }
      const pkg = await tx.coinPackage.findFirst({ where: { id: packageId, active: true } });
      if (!pkg) throw new DomainError('PACKAGE_NOT_AVAILABLE');
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
      const id = row!.id;
      await tx.topupOrder.create({
        data: {
          id,
          userId,
          packageId: pkg.id,
          orderNumber: `INF-${id.replaceAll('-', '')}`,
          coins: BigInt(pkg.coins),
          priceIdr: BigInt(pkg.priceIdr),
          feeIdr: 0n, // no channel fee in the MVP (QRIS MDR may never be passed on)
          totalIdr: BigInt(pkg.priceIdr),
        },
      });
      await this.idempotency.complete(tx, {
        userId,
        scope: TOPUP_IDEMPOTENCY_SCOPE,
        key,
        resultId: id,
      });
      return { orderId: id, replay: false };
    });

    const order = await this.prisma.topupOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (replay) return this.replayResult(order);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    try {
      const checkout = await this.gateway.createCheckout({
        orderNumber: order.orderNumber,
        grossIdr: toSafeInt(order.totalIdr),
        itemName: `${order.coins} Koin`,
        customerName: user.displayName,
        finishUrl: this.finishUrl(order.id),
        expiryMinutes: this.env.TOPUP_EXPIRY_MINUTES,
      });
      const now = Date.now();
      await this.prisma.topupOrder.updateMany({
        where: { id: order.id, status: 'CREATED' },
        data: {
          status: 'PENDING',
          redirectUrl: checkout.redirectUrl,
          expiresAt: new Date(now + this.env.TOPUP_EXPIRY_MINUTES * 60_000),
          nextCheckAt: new Date(now + 60_000),
        },
      });
      return { orderId: order.id, redirectUrl: checkout.redirectUrl };
    } catch (error) {
      if (!(error instanceof PaymentGatewayError)) throw error;
      this.logger.warn(`Checkout creation failed for ${order.orderNumber}: ${error.message}`);
      await this.prisma.topupOrder.updateMany({
        where: { id: order.id, status: 'CREATED' },
        data: { status: 'FAILED', failureReason: 'GATEWAY_CREATE_FAILED' },
      });
      throw new DomainError('PAYMENT_GATEWAY_UNAVAILABLE');
    }
  }

  private replayResult(order: TopupRow): CreateTopupResponse {
    if (order.status === 'CREATED') throw new DomainError('REQUEST_IN_PROGRESS');
    if (order.status === 'FAILED') throw new DomainError('PAYMENT_GATEWAY_UNAVAILABLE');
    return { orderId: order.id, redirectUrl: order.redirectUrl ?? this.finishUrl(order.id) };
  }

  /** The owner's order; someone else's order (or a malformed id) is a 404. */
  async getForOwner(userId: string, orderId: string): Promise<TopupOrder> {
    if (!uuid.safeParse(orderId).success) throw new DomainError('TOPUP_NOT_FOUND');
    let order = await this.prisma.topupOrder.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new DomainError('TOPUP_NOT_FOUND');
    if (this.dueForOnDemandCheck(order)) {
      // Opening the status page asks Midtrans itself, so a top-up is credited even when no notification arrives
      // (local development has no public URL). Bounded, and never throws.
      await Promise.race([
        this.reconcile.reconcileOne(order.id),
        new Promise((resolve) => setTimeout(resolve, ON_DEMAND_TIMEOUT_MS).unref()),
      ]);
      order = await this.prisma.topupOrder.findFirstOrThrow({ where: { id: orderId, userId } });
    }
    return this.toPublic(order);
  }

  async listPending(userId: string): Promise<TopupOrder[]> {
    const orders = await this.prisma.topupOrder.findMany({
      where: { userId, status: 'PENDING', quarantinedAt: null },
      orderBy: { createdAt: 'desc' },
      take: PENDING_LIST_LIMIT,
    });
    return Promise.all(orders.map((o) => this.toPublic(o)));
  }

  private dueForOnDemandCheck(order: TopupRow): boolean {
    return (
      order.status === 'PENDING' &&
      !order.quarantinedAt &&
      (!order.lastCheckedAt || Date.now() - order.lastCheckedAt.getTime() >= ON_DEMAND_MIN_GAP_MS)
    );
  }

  private async toPublic(order: TopupRow): Promise<TopupOrder> {
    // Money may have arrived for a flagged order, so it never reads as plain "failed" or "pending".
    const status: TopupStatus =
      order.quarantinedAt && order.status !== 'CREDITED'
        ? 'UNDER_REVIEW'
        : order.status === 'CREATED'
          ? 'PENDING'
          : order.status;
    const payable =
      order.status === 'PENDING' &&
      !order.quarantinedAt &&
      !!order.expiresAt &&
      order.expiresAt > new Date();
    return {
      id: order.id,
      status,
      coins: toSafeInt(order.coins),
      priceIdr: toSafeInt(order.priceIdr),
      feeIdr: toSafeInt(order.feeIdr),
      totalIdr: toSafeInt(order.totalIdr),
      createdAt: order.createdAt.toISOString(),
      creditedAt: order.creditedAt?.toISOString() ?? null,
      balanceCoins:
        order.status === 'CREDITED'
          ? (await this.wallets.getWallet(order.userId)).balanceCoins
          : null,
      redirectUrl: payable ? order.redirectUrl : null,
    };
  }
}
