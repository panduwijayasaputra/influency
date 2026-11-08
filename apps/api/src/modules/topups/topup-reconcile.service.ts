import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../common/env.js';
import { verifyMidtransSignature } from '../../common/midtrans.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../../common/payment-gateway.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { TopupOrder } from '../../generated/prisma/client.js';
import { TopupCreditService } from './topup-credit.service.js';

export const RECONCILE_BATCH = 50;
/** A paid-late payment can still land this long after the checkout expired, so expiry waits for it. */
const EXPIRY_GRACE_MS = 10 * 60_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 30 * 60_000;

/** 30 s, 60 s, 2 min … capped at 30 min, by how many checks already happened. */
export const nextCheckDelayMs = (attempts: number): number =>
  Math.min(BACKOFF_BASE_MS * 2 ** Math.min(attempts, 20), BACKOFF_MAX_MS);

/**
 * Asks Midtrans about orders that are still waiting (a lost or delayed notification) and closes abandoned ones. Every
 * answer goes through the same verified `applyProviderStatus` as a notification, so a check racing a late
 * notification still credits exactly once.
 */
@Injectable()
export class TopupReconcileService {
  private readonly logger = new Logger(TopupReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: TopupCreditService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Checks up to RECONCILE_BATCH due orders, oldest due first. Returns how many were checked. */
  async reconcileDue(now = new Date()): Promise<number> {
    const due = await this.prisma.topupOrder.findMany({
      where: {
        status: { in: ['CREATED', 'PENDING'] },
        quarantinedAt: null,
        OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }],
      },
      orderBy: { nextCheckAt: { sort: 'asc', nulls: 'first' } },
      select: { id: true },
      take: RECONCILE_BATCH,
    });
    for (const { id } of due) await this.reconcileOne(id, now);
    return due.length;
  }

  /** Never throws: a provider outage must not break the caller (a timer or a status read). */
  async reconcileOne(orderId: string, now = new Date()): Promise<void> {
    try {
      const order = await this.prisma.topupOrder.findUnique({ where: { id: orderId } });
      if (!order || order.quarantinedAt || !['CREATED', 'PENDING'].includes(order.status)) return;
      // A CREATED order never got a checkout, so there is nothing to ask the provider about.
      if (order.status === 'PENDING') await this.askProvider(order);
      await this.bookkeep(order.id, now);
    } catch (error) {
      this.logger.warn(`Top-up check failed for ${orderId}: ${(error as Error).message}`);
    }
  }

  private async askProvider(order: TopupOrder): Promise<void> {
    let status;
    try {
      status = await this.gateway.getStatus(order.orderNumber);
    } catch (error) {
      this.logger.warn(
        `Midtrans status check failed for ${order.orderNumber}: ${(error as Error).message}`,
      );
      return; // order unchanged; the next tick retries with a longer backoff
    }
    if (!status) return; // no transaction yet: the customer has not chosen a payment method
    const valid = verifyMidtransSignature(status, this.gateway.signatureKey);
    const eventId = await this.credit.storeEvent('midtrans_status', status, valid);
    if (!valid) {
      await this.prisma.topupOrder.update({
        where: { id: order.id },
        data: { quarantinedAt: new Date(), quarantineReason: 'STATUS_SIGNATURE_INVALID' },
      });
      await this.credit.finishEvent(eventId, 'REJECTED_SIGNATURE');
      return;
    }
    await this.credit.finishEvent(
      eventId,
      await this.credit.applyProviderStatus(status, 'STATUS_CHECK'),
    );
  }

  /** Schedules the next check and expires an abandoned order, under the order's row lock so it cannot undo a credit. */
  private async bookkeep(orderId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM topup_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.topupOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (order.status !== 'CREATED' && order.status !== 'PENDING') return; // credited or closed meanwhile
      const attempts = order.checkAttempts + 1;
      const payableUntil =
        order.expiresAt ??
        new Date(order.createdAt.getTime() + this.env.TOPUP_EXPIRY_MINUTES * 60_000);
      const expired = now.getTime() > payableUntil.getTime() + EXPIRY_GRACE_MS;
      await tx.topupOrder.update({
        where: { id: order.id },
        data: {
          checkAttempts: attempts,
          lastCheckedAt: now,
          nextCheckAt: new Date(now.getTime() + nextCheckDelayMs(attempts)),
          ...(expired ? { status: 'EXPIRED', failureReason: 'NOT_PAID_IN_TIME' } : {}),
        },
      });
    });
  }
}
