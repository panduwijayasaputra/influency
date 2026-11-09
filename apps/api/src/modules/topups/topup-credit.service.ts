import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../common/env.js';
import { type MidtransNotification, verifyMidtransSignature } from '../../common/midtrans.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../../common/payment-gateway.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { TopupOrder } from '../../generated/prisma/client.js';
import { NotificationProducer } from '../notifications/notification-producer.service.js';
import { WalletsService } from '../wallets/wallets.service.js';
import {
  mapMidtransStatus,
  notificationFingerprint,
  parseGrossAmountIdr,
  parseMidtransTime,
} from './midtrans-status.js';

export type ApplyOutcome =
  | 'CREDITED'
  | 'ALREADY_CREDITED'
  | 'STATUS_UPDATED'
  | 'NO_CHANGE'
  | 'QUARANTINED'
  | 'UNKNOWN_ORDER';
export type EventOutcome = ApplyOutcome | 'REJECTED_SIGNATURE';
export type StatusSource = 'NOTIFICATION' | 'STATUS_CHECK';

const TERMINAL_UNPAID = ['FAILED', 'EXPIRED', 'CANCELED'] as const;

/**
 * The only place that turns a provider payment status into an order state and, for a verified success, into Koin.
 * Notifications and status checks both come through `applyProviderStatus`, so they cannot double-credit.
 */
@Injectable()
export class TopupCreditService {
  private readonly logger = new Logger(TopupCreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationProducer,
  ) {}

  /** Stores a payload before anything else (the same delivery twice keeps one row), then returns its id. */
  async storeEvent(
    provider: 'midtrans' | 'midtrans_status',
    n: MidtransNotification,
    signatureValid: boolean,
  ): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO payment_webhook_events (provider, order_number, fingerprint, signature_valid, payload)
      VALUES (${provider}, ${n.order_id}, ${notificationFingerprint(n)}, ${signatureValid}, ${JSON.stringify(n)}::jsonb)
      ON CONFLICT (fingerprint) DO UPDATE
        SET signature_valid = payment_webhook_events.signature_valid OR EXCLUDED.signature_valid
      RETURNING id::text AS id`;
    return row!.id;
  }

  async finishEvent(eventId: string, outcome: EventOutcome): Promise<void> {
    await this.prisma.paymentWebhookEvent.update({
      where: { id: eventId },
      data: { outcome, processedAt: new Date() },
    });
  }

  /**
   * HTTP notification: store → verify signature → apply. Throws if the event cannot be stored (the caller answers
   * non-2xx so Midtrans retries); a bad signature is stored and rejected without touching any order.
   */
  async handleNotification(n: MidtransNotification): Promise<EventOutcome> {
    const signatureValid = verifyMidtransSignature(n, this.gateway.signatureKey);
    const eventId = await this.storeEvent('midtrans', n, signatureValid);
    const outcome: EventOutcome = signatureValid
      ? await this.applyProviderStatus(n, 'NOTIFICATION')
      : 'REJECTED_SIGNATURE';
    await this.finishEvent(eventId, outcome);
    return outcome;
  }

  /**
   * creditOnce. One transaction: lock the order row (first), check it against the provider answer, then move its state
   * and, for a verified success, credit the wallet (which locks the wallet row second). Idempotent: repeated,
   * concurrent and out-of-order deliveries leave exactly one credit, protected by the ledger's unique source key too.
   * The caller verified the signature.
   */
  async applyProviderStatus(n: MidtransNotification, source: StatusSource): Promise<ApplyOutcome> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<ApplyOutcome> => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM topup_orders WHERE order_number = ${n.order_id} FOR UPDATE`;
      if (!locked) return 'UNKNOWN_ORDER';
      const order = await tx.topupOrder.findUniqueOrThrow({ where: { id: locked.id } });

      const mismatch = await this.findMismatch(tx, order, n);
      const result = mapMidtransStatus(n);
      const quarantine = async (reason: string): Promise<ApplyOutcome> => {
        await tx.topupOrder.update({
          where: { id: order.id },
          data: {
            quarantinedAt: order.quarantinedAt ?? new Date(),
            quarantineReason: order.quarantineReason ?? reason,
            providerStatus: n.transaction_status,
          },
        });
        this.logger.warn(`Top-up ${order.orderNumber} quarantined: ${reason} (${source})`);
        return 'QUARANTINED';
      };

      if (mismatch) return quarantine(mismatch);

      if (order.status === 'CREDITED') {
        if (result === 'REVIEW')
          return quarantine(`PROVIDER_STATUS_${n.transaction_status.toUpperCase()}`);
        if (result === 'SUCCESS') return 'ALREADY_CREDITED';
        // A paid order reported as failed later (a documented reversal for some VAs) needs a person, not an automatic debit.
        if (result !== 'PENDING')
          this.logger.warn(`Credited top-up ${order.orderNumber} reported ${result}`);
        return 'NO_CHANGE';
      }
      if ((TERMINAL_UNPAID as readonly string[]).includes(order.status)) {
        if (result === 'SUCCESS') return quarantine('PAID_AFTER_TERMINAL');
        if (result === 'REVIEW')
          return quarantine(`PROVIDER_STATUS_${n.transaction_status.toUpperCase()}`);
        return 'NO_CHANGE';
      }

      // CREATED / PENDING from here on.
      const common = {
        providerStatus: n.transaction_status,
        paymentType: n.payment_type ?? order.paymentType,
      };
      switch (result) {
        case 'SUCCESS': {
          if (order.quarantinedAt) return 'QUARANTINED'; // flagged earlier: an operator decides, not a later message
          const now = new Date();
          await this.wallets.creditInTx(tx, {
            userId: order.userId,
            coins: order.coins,
            entryType: 'TOPUP_CREDIT',
            sourceType: 'TOPUP_ORDER',
            sourceId: order.id,
            basisIdr: order.priceIdr,
          });
          await tx.topupOrder.update({
            where: { id: order.id },
            data: {
              ...common,
              status: 'CREDITED',
              providerTxRef: n.transaction_id ?? order.providerTxRef,
              paidAt:
                parseMidtransTime(n.settlement_time) ??
                parseMidtransTime(n.transaction_time) ??
                now,
              creditedAt: now,
            },
          });
          // Outbox row in the same transaction; it can never undo the credit (savepoint).
          await this.notifications.notifyInTx(tx, {
            userId: order.userId,
            type: 'TOPUP_CREDITED',
            dedupeKey: `topup:${order.id}`,
            sourceId: order.id,
            coins: order.coins,
          });
          return 'CREDITED';
        }
        case 'PENDING':
          await tx.topupOrder.update({
            where: { id: order.id },
            data: {
              ...common,
              status: 'PENDING',
              providerTxRef: n.transaction_id ?? order.providerTxRef,
            },
          });
          return 'STATUS_UPDATED';
        case 'REVIEW':
          return quarantine(`PROVIDER_STATUS_${n.transaction_status.toUpperCase()}`);
        default:
          await tx.topupOrder.update({
            where: { id: order.id },
            data: {
              ...common,
              status: result,
              failureReason: `PROVIDER_${n.transaction_status.toUpperCase()}`,
              providerTxRef: n.transaction_id ?? order.providerTxRef,
            },
          });
          return 'STATUS_UPDATED';
      }
    });
    return outcome;
  }

  /** Reason the provider answer does not belong to this order, or null. Nothing is credited on a mismatch. */
  private async findMismatch(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    order: TopupOrder,
    n: MidtransNotification,
  ): Promise<string | null> {
    const gross = parseGrossAmountIdr(n.gross_amount);
    if (gross === null || gross !== order.totalIdr) return 'AMOUNT_MISMATCH';
    if (n.currency && n.currency !== 'IDR') return 'CURRENCY_MISMATCH';
    if (n.merchant_id && n.merchant_id !== this.gateway.merchantId) return 'MERCHANT_MISMATCH';
    if (n.transaction_id) {
      const other = await tx.topupOrder.findFirst({
        where: { providerTxRef: n.transaction_id, NOT: { id: order.id } },
        select: { id: true },
      });
      if (other) return 'TRANSACTION_ID_REUSED';
    }
    return null;
  }
}
