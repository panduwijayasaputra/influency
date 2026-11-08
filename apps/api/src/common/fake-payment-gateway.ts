import { type MidtransNotification, signMidtrans } from './midtrans.js';
import { type CheckoutInput, type PaymentGateway, PaymentGatewayError } from './payment-gateway.js';

/**
 * In-process gateway for development and tests (`PAYMENT_PROVIDER=fake`, refused in production by env validation).
 * Checkout goes straight back to the finish URL; tests choose what `getStatus` answers with `setStatus`.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly merchantId = 'FAKE-MERCHANT';
  readonly signatureKey = 'fake-server-key';
  readonly created: CheckoutInput[] = [];
  private failNext = false;
  private readonly statuses = new Map<string, MidtransNotification | null>();
  statusCalls = 0;

  failNextCreate(): void {
    this.failNext = true;
  }

  /** A signed notification as Midtrans would send it. */
  notification(
    orderNumber: string,
    grossIdr: number,
    fields: Partial<MidtransNotification> & { transaction_status: string },
  ): MidtransNotification {
    const status_code = fields.status_code ?? '200';
    const gross_amount = fields.gross_amount ?? `${grossIdr}.00`;
    return {
      order_id: orderNumber,
      status_code,
      gross_amount,
      currency: 'IDR',
      merchant_id: this.merchantId,
      transaction_id: `fake-tx-${orderNumber}`,
      signature_key: signMidtrans(orderNumber, status_code, gross_amount, this.signatureKey),
      ...fields,
    };
  }

  /** What `getStatus(orderNumber)` answers; null = not found. */
  setStatus(orderNumber: string, status: MidtransNotification | null): void {
    this.statuses.set(orderNumber, status);
  }

  createCheckout(input: CheckoutInput): Promise<{ token: string; redirectUrl: string }> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new PaymentGatewayError('fake gateway failure'));
    }
    this.created.push(input);
    return Promise.resolve({ token: `fake-${input.orderNumber}`, redirectUrl: input.finishUrl });
  }

  getStatus(orderNumber: string): Promise<MidtransNotification | null> {
    this.statusCalls += 1;
    return Promise.resolve(this.statuses.get(orderNumber) ?? null);
  }
}
