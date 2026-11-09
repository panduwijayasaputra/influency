import type { MidtransNotification } from './midtrans.js';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CheckoutInput {
  /** Used as the provider's order_id. */
  orderNumber: string;
  grossIdr: number;
  itemName: string;
  customerName: string;
  /** Where the provider sends the browser after payment. Never proof of payment. */
  finishUrl: string;
  expiryMinutes: number;
}

/** Any non-success answer from the provider (network, timeout, 4xx/5xx, unreadable body). */
export class PaymentGatewayError extends Error {}

export interface PaymentGateway {
  /** The merchant a notification must belong to. */
  readonly merchantId: string;
  /** Server key used to verify notification signatures. Never leaves the backend. */
  readonly signatureKey: string;
  createCheckout(input: CheckoutInput): Promise<{ token: string; redirectUrl: string }>;
  /** Transaction status; null while the provider has no transaction yet (the customer has not picked a method). */
  getStatus(orderNumber: string): Promise<MidtransNotification | null>;
}
