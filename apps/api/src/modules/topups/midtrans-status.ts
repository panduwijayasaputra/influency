import { createHash } from 'node:crypto';
import type { MidtransNotification } from '../../common/midtrans.js';

/** What a provider status means for our order. */
export type ProviderResult = 'SUCCESS' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'CANCELED' | 'REVIEW';

/**
 * docs.midtrans.com (Transaction Status, Get Transaction Status; checked 2026-11-07):
 * - `settlement` is the paid status for non-card methods (QRIS, VA, e-wallet); `capture` exists for cards only and
 *   counts as paid only with `fraud_status` "accept"; `challenge` is not paid until approved; `deny` is a failure.
 * - Paid also needs `status_code` "200".
 * - refund / chargeback statuses and anything unknown go to review, never to an automatic credit or reversal.
 */
export function mapMidtransStatus(
  n: Pick<MidtransNotification, 'transaction_status' | 'fraud_status' | 'status_code'>,
): ProviderResult {
  const status = n.transaction_status.toLowerCase();
  const fraud = n.fraud_status?.toLowerCase();
  if (fraud === 'deny') return 'FAILED';
  switch (status) {
    case 'settlement':
      if (fraud === 'challenge') return 'PENDING';
      return n.status_code === '200' ? 'SUCCESS' : 'REVIEW';
    case 'capture':
      if (fraud === 'accept') return n.status_code === '200' ? 'SUCCESS' : 'REVIEW';
      return 'PENDING'; // challenge, or no fraud verdict yet
    case 'pending':
    case 'authorize':
      return 'PENDING';
    case 'deny':
    case 'failure':
      return 'FAILED';
    case 'expire':
      return 'EXPIRED';
    case 'cancel':
      return 'CANCELED';
    default:
      return 'REVIEW';
  }
}

/** "10000.00" / "10000" → 10000n; anything else (decimals, signs, text) → null. */
export function parseGrossAmountIdr(value: string): bigint | null {
  const m = /^(\d{1,15})(?:\.00)?$/.exec(value);
  return m ? BigInt(m[1]!) : null;
}

/** Midtrans times are "YYYY-MM-DD HH:mm:ss" in GMT+7. */
export function parseMidtransTime(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value.replace(' ', 'T')}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Same delivery → same fingerprint (the signature is left out on purpose: a forged copy must not mask the real one). */
export function notificationFingerprint(n: MidtransNotification): string {
  const parts = [
    n.order_id,
    n.transaction_status,
    n.status_code,
    n.transaction_id ?? '',
    n.fraud_status ?? '',
    n.gross_amount,
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
