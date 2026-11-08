import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * A Midtrans payment notification, also the shape of the Get Transaction Status response
 * (docs.midtrans.com: HTTP(S) notification, Get Transaction Status). Parsed loosely: Midtrans adds fields over time,
 * and the whole payload is stored for audit.
 */
export const midtransNotificationSchema = z.looseObject({
  order_id: z.string().min(1),
  status_code: z.string().min(1),
  /** A string such as "10000.00". The exact text is part of the signature. */
  gross_amount: z.string().min(1),
  signature_key: z.string().min(1),
  transaction_status: z.string().min(1),
  transaction_id: z.string().optional(),
  fraud_status: z.string().optional(),
  currency: z.string().optional(),
  merchant_id: z.string().optional(),
  payment_type: z.string().optional(),
  transaction_time: z.string().optional(),
  settlement_time: z.string().optional(),
});
export type MidtransNotification = z.infer<typeof midtransNotificationSchema>;

const sha512hex = (value: string) => createHash('sha512').update(value).digest('hex');

/** `SHA512(order_id + status_code + gross_amount + ServerKey)`, hex, over the exact payload strings. */
export function signMidtrans(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return sha512hex(orderId + statusCode + grossAmount + serverKey);
}

/** Constant-time check of a notification's `signature_key`. */
export function verifyMidtransSignature(n: MidtransNotification, serverKey: string): boolean {
  const expected = Buffer.from(signMidtrans(n.order_id, n.status_code, n.gross_amount, serverKey));
  const given = Buffer.from(n.signature_key.toLowerCase());
  return given.length === expected.length && timingSafeEqual(given, expected);
}
