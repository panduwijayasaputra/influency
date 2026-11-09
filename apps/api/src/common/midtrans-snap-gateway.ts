import { z } from 'zod';
import type { Env } from './env.js';
import { type MidtransNotification, midtransNotificationSchema } from './midtrans.js';
import { type CheckoutInput, type PaymentGateway, PaymentGatewayError } from './payment-gateway.js';

// Sandbox only: there is no production URL anywhere (MIDTRANS_IS_PRODUCTION is forced to false by env validation).
// docs.midtrans.com: Snap Backend Integration, Get Transaction Status.
const SNAP_URL = 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const STATUS_URL = 'https://api.sandbox.midtrans.com/v2';
const TIMEOUT_MS = 10_000;

const snapResponseSchema = z.object({ token: z.string().min(1), redirect_url: z.url() });

/** Midtrans Snap Sandbox. The Server Key stays in this class and is never logged or put in an error message. */
export class MidtransSnapGateway implements PaymentGateway {
  readonly merchantId: string;
  readonly signatureKey: string;
  private readonly auth: string;

  constructor(env: Pick<Env, 'MIDTRANS_SERVER_KEY' | 'MIDTRANS_MERCHANT_ID'>) {
    this.signatureKey = env.MIDTRANS_SERVER_KEY ?? '';
    this.merchantId = env.MIDTRANS_MERCHANT_ID ?? '';
    // HTTP Basic: Base64(ServerKey + ':').
    this.auth = `Basic ${Buffer.from(`${this.signatureKey}:`).toString('base64')}`;
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: this.auth,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PaymentGatewayError('Midtrans request failed (network or timeout)');
    }
  }

  async createCheckout(input: CheckoutInput): Promise<{ token: string; redirectUrl: string }> {
    const res = await this.call(SNAP_URL, {
      method: 'POST',
      body: JSON.stringify({
        transaction_details: { order_id: input.orderNumber, gross_amount: input.grossIdr },
        item_details: [
          {
            id: input.orderNumber,
            price: input.grossIdr,
            quantity: 1,
            name: input.itemName.slice(0, 50),
          },
        ],
        customer_details: { first_name: input.customerName.slice(0, 50) },
        callbacks: { finish: input.finishUrl },
        expiry: { unit: 'minute', duration: input.expiryMinutes },
      }),
    });
    if (!res.ok) throw new PaymentGatewayError(`Midtrans Snap answered ${res.status}`);
    const body = snapResponseSchema.safeParse(await res.json().catch(() => null));
    if (!body.success) throw new PaymentGatewayError('Midtrans Snap answered an unreadable body');
    return { token: body.data.token, redirectUrl: body.data.redirect_url };
  }

  async getStatus(orderNumber: string): Promise<MidtransNotification | null> {
    const res = await this.call(`${STATUS_URL}/${encodeURIComponent(orderNumber)}/status`, {
      method: 'GET',
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new PaymentGatewayError(`Midtrans status answered ${res.status}`);
    const json: unknown = await res.json().catch(() => null);
    // "Transaction doesn't exist." comes back in the body (status_code "404"), not as the HTTP status.
    if (json && typeof json === 'object' && 'status_code' in json && json.status_code === '404') {
      return null;
    }
    const body = midtransNotificationSchema.safeParse(json);
    if (!body.success) throw new PaymentGatewayError('Midtrans status answered an unreadable body');
    return body.data;
  }
}
