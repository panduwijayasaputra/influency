import { describe, expect, it } from 'vitest';
import { type MidtransNotification, signMidtrans, verifyMidtransSignature } from './midtrans.js';

const KEY = 'SB-Mid-server-key';
// Independently computed: sha512("INF-abc" + "200" + "10000.00" + KEY).
const VECTOR =
  'd98498dbb763e17f8f03a92afec8c2f71067029b042e1585b1ed4226be13e362c6c226275cb933236f61b63dc444cd45b36e08ab7ff8144098414801e6e27708';
const note = (over: Partial<MidtransNotification> = {}): MidtransNotification => ({
  order_id: 'INF-abc',
  status_code: '200',
  gross_amount: '10000.00',
  transaction_status: 'settlement',
  signature_key: VECTOR,
  ...over,
});

describe('Midtrans signature', () => {
  it('matches the documented formula', () => {
    expect(signMidtrans('INF-abc', '200', '10000.00', KEY)).toBe(VECTOR);
    expect(verifyMidtransSignature(note(), KEY)).toBe(true);
  });

  it('fails when any signed field or the key changes', () => {
    expect(verifyMidtransSignature(note({ gross_amount: '10000' }), KEY)).toBe(false);
    expect(verifyMidtransSignature(note({ order_id: 'INF-abd' }), KEY)).toBe(false);
    expect(verifyMidtransSignature(note({ status_code: '201' }), KEY)).toBe(false);
    expect(verifyMidtransSignature(note(), 'other-key')).toBe(false);
  });

  it('rejects a wrong-length signature without throwing', () => {
    expect(verifyMidtransSignature(note({ signature_key: 'abc' }), KEY)).toBe(false);
  });
});
