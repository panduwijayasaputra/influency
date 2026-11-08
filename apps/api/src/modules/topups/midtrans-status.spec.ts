import { describe, expect, it } from 'vitest';
import {
  mapMidtransStatus,
  notificationFingerprint,
  parseGrossAmountIdr,
  parseMidtransTime,
  type ProviderResult,
} from './midtrans-status.js';

const map = (transaction_status: string, fraud_status?: string, status_code = '200') =>
  mapMidtransStatus({ transaction_status, fraud_status, status_code });

describe('mapMidtransStatus', () => {
  it.each<[string, string | undefined, ProviderResult]>([
    ['settlement', undefined, 'SUCCESS'],
    ['settlement', 'accept', 'SUCCESS'],
    ['SETTLEMENT', undefined, 'SUCCESS'],
    ['capture', 'accept', 'SUCCESS'],
    ['capture', 'challenge', 'PENDING'],
    ['capture', undefined, 'PENDING'],
    ['capture', 'deny', 'FAILED'],
    ['settlement', 'challenge', 'PENDING'],
    ['settlement', 'deny', 'FAILED'],
    ['pending', undefined, 'PENDING'],
    ['authorize', 'accept', 'PENDING'],
    ['deny', undefined, 'FAILED'],
    ['failure', undefined, 'FAILED'],
    ['expire', undefined, 'EXPIRED'],
    ['cancel', undefined, 'CANCELED'],
    ['refund', undefined, 'REVIEW'],
    ['partial_refund', undefined, 'REVIEW'],
    ['chargeback', undefined, 'REVIEW'],
    ['partial_chargeback', undefined, 'REVIEW'],
    ['something_new', undefined, 'REVIEW'],
  ])('%s + fraud %s → %s', (status, fraud, expected) => {
    expect(map(status, fraud)).toBe(expected);
  });

  it('does not treat a paid status with a non-200 status_code as paid', () => {
    expect(map('settlement', undefined, '201')).toBe('REVIEW');
    expect(map('capture', 'accept', '201')).toBe('REVIEW');
  });
});

describe('parseGrossAmountIdr', () => {
  it('accepts whole rupiah, with or without .00', () => {
    expect(parseGrossAmountIdr('10000.00')).toBe(10000n);
    expect(parseGrossAmountIdr('10000')).toBe(10000n);
  });

  it.each(['10000.50', '-5', '1e3', 'abc', '', '10,000', '10000.0'])('rejects %j', (v) => {
    expect(parseGrossAmountIdr(v)).toBeNull();
  });
});

describe('parseMidtransTime', () => {
  it('reads GMT+7 times as UTC instants', () => {
    expect(parseMidtransTime('2026-11-07 20:30:00')?.toISOString()).toBe(
      '2026-11-07T13:30:00.000Z',
    );
    expect(parseMidtransTime('2026-11-07 00:10:00')?.toISOString()).toBe(
      '2026-11-06T17:10:00.000Z',
    );
  });

  it('returns null for missing or odd formats', () => {
    expect(parseMidtransTime(undefined)).toBeNull();
    expect(parseMidtransTime('2026-11-07T20:30:00Z')).toBeNull();
    expect(parseMidtransTime('2026-13-45 99:99:99')).toBeNull();
  });
});

describe('notificationFingerprint', () => {
  const base = {
    order_id: 'INF-a',
    status_code: '200',
    gross_amount: '10000.00',
    transaction_status: 'settlement',
    transaction_id: 't1',
    signature_key: 'x',
  };

  it('is stable, ignores the signature, and changes with the delivery', () => {
    expect(notificationFingerprint(base)).toBe(
      notificationFingerprint({ ...base, signature_key: 'y' }),
    );
    expect(notificationFingerprint(base)).not.toBe(
      notificationFingerprint({ ...base, transaction_status: 'capture' }),
    );
  });
});
