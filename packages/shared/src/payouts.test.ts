import { describe, expect, it } from 'vitest';
import {
  EARNINGS_PENDING_DAYS,
  earningsActivityItemSchema,
  earningsActivityQuerySchema,
  createPayoutSchema,
  earningsBalanceSchema,
  PAYOUT_MIN_IDR,
  payoutAccountInputSchema,
  payoutAccountSchema,
  payoutBankName,
  payoutQuoteQuerySchema,
  payoutQuoteSchema,
  payoutSchema,
} from './index.js';

const ID = '0190a000-0000-7000-8000-000000000001';
const AT = '2026-11-09T00:00:00.000Z';

describe('payout constants', () => {
  it('keep the LOCKED values', () => {
    expect(EARNINGS_PENDING_DAYS).toBe(14);
    expect(PAYOUT_MIN_IDR).toBe(100_000);
  });
});

describe('earningsBalanceSchema', () => {
  const balance = {
    pendingIdr: 0,
    availableIdr: 248_500,
    reservedIdr: 0,
    paidOutIdr: 0,
    nextMaturityAt: null,
    nextMaturityIdr: 0,
  };
  it('accepts integer IDR', () => {
    expect(earningsBalanceSchema.parse(balance)).toEqual(balance);
  });
  it.each([
    ['a fractional amount', { availableIdr: 10.5 }],
    ['a negative balance', { pendingIdr: -1 }],
    ['a bad date', { nextMaturityAt: 'soon' }],
  ])('rejects %s', (_label, over) => {
    expect(earningsBalanceSchema.safeParse({ ...balance, ...over }).success).toBe(false);
  });
});

describe('earningsActivityQuerySchema', () => {
  it('defaults the type to all and rejects unknown types', () => {
    expect(earningsActivityQuerySchema.parse({}).type).toBe('all');
    expect(earningsActivityQuerySchema.safeParse({ type: 'refund' }).success).toBe(false);
  });
});

describe('earningsActivityItemSchema', () => {
  const item = {
    id: ID,
    type: 'unlock',
    kind: 'SALE',
    occurredAt: AT,
    buyerName: 'Bima',
    postCaption: null,
    grossKoin: 25,
    feeBps: 2000,
    netIdr: 20_000,
    status: 'PENDING',
    availableAt: AT,
  };
  it('accepts a sale and a negative reversal', () => {
    expect(earningsActivityItemSchema.safeParse(item).success).toBe(true);
    expect(
      earningsActivityItemSchema.safeParse({ ...item, kind: 'REVERSAL', netIdr: -20_000 }).success,
    ).toBe(true);
  });
  it('rejects a fee above 100% and a zero-Koin row', () => {
    expect(earningsActivityItemSchema.safeParse({ ...item, feeBps: 10_001 }).success).toBe(false);
    expect(earningsActivityItemSchema.safeParse({ ...item, grossKoin: 0 }).success).toBe(false);
  });
});

describe('payoutSchema', () => {
  const payout = {
    id: ID,
    amountIdr: 120_000,
    feeIdr: 2_500,
    netIdr: 117_500,
    feeIsPlaceholder: true,
    status: 'REQUESTED',
    destination: { bankCode: 'BCA', bankName: 'BCA', last4: '4821', holderName: 'Nadia Kirana' },
    requestedAt: AT,
    updatedAt: AT,
  };
  it('accepts a requested payout', () => {
    expect(payoutSchema.safeParse(payout).success).toBe(true);
  });
  it('rejects a full account number in place of the last 4 digits', () => {
    const bad = { ...payout, destination: { ...payout.destination, last4: '1234564821' } };
    expect(payoutSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects an unknown status', () => {
    expect(payoutSchema.safeParse({ ...payout, status: 'DONE' }).success).toBe(false);
  });
});

describe('payout accounts', () => {
  const input = { bankCode: 'BCA', accountNumber: '1234 5648 21', holderName: '  Nadia Kirana ' };

  it('strips spaces from the number, trims the holder and defaults makeActive to false', () => {
    expect(payoutAccountInputSchema.parse(input)).toEqual({
      bankCode: 'BCA',
      accountNumber: '1234564821',
      holderName: 'Nadia Kirana',
      makeActive: false,
    });
  });

  it.each(['12345', '1'.repeat(21), '12ab56', ''])('rejects the number %j', (accountNumber) => {
    expect(payoutAccountInputSchema.safeParse({ ...input, accountNumber }).success).toBe(false);
  });

  it('accepts 6 and 20 digits', () => {
    expect(payoutAccountInputSchema.safeParse({ ...input, accountNumber: '123456' }).success).toBe(
      true,
    );
    expect(
      payoutAccountInputSchema.safeParse({ ...input, accountNumber: '1'.repeat(20) }).success,
    ).toBe(true);
  });

  it.each([
    ['an empty holder', { holderName: '   ' }],
    ['a holder over 100 characters', { holderName: 'x'.repeat(101) }],
    ['an unknown bank', { bankCode: 'XYZ' }],
    ['an unknown key', { role: 'ADMIN' }],
  ])('rejects %s', (_label, over) => {
    expect(payoutAccountInputSchema.safeParse({ ...input, ...over }).success).toBe(false);
  });

  it('names banks, falling back to the code', () => {
    expect(payoutBankName('JAGO')).toBe('Bank Jago');
    expect(payoutBankName('OLD')).toBe('OLD');
  });

  it('exposes only the masked account', () => {
    const account = {
      id: ID,
      bankCode: 'BCA',
      bankName: 'BCA',
      last4: '4821',
      holderName: 'Nadia',
      active: true,
      createdAt: AT,
    };
    expect(payoutAccountSchema.safeParse(account).success).toBe(true);
    expect(payoutAccountSchema.safeParse({ ...account, last4: '1234564821' }).success).toBe(false);
  });
});

describe('payout quote and request', () => {
  it('coerces the quoted amount from the query string and enforces the minimum', () => {
    expect(payoutQuoteQuerySchema.parse({ amountIdr: '100000' }).amountIdr).toBe(100_000);
    expect(payoutQuoteQuerySchema.safeParse({ amountIdr: '99999' }).success).toBe(false);
    expect(payoutQuoteQuerySchema.safeParse({ amountIdr: '150000.5' }).success).toBe(false);
    expect(payoutQuoteQuerySchema.safeParse({ amountIdr: 'abc' }).success).toBe(false);
  });

  it('parses a quote', () => {
    const quote = {
      amountIdr: 150_000,
      feeIdr: 2_500,
      netIdr: 147_500,
      feeIsPlaceholder: true,
      availableIdr: 248_500,
      destination: { bankCode: 'BCA', bankName: 'BCA', last4: '4821', holderName: 'Nadia' },
    };
    expect(payoutQuoteSchema.safeParse(quote).success).toBe(true);
  });

  it('requires the amount and the fee shown, and nothing else', () => {
    expect(
      createPayoutSchema.safeParse({ amountIdr: 100_000, expectedFeeIdr: 2_500 }).success,
    ).toBe(true);
    expect(createPayoutSchema.safeParse({ amountIdr: 99_999, expectedFeeIdr: 0 }).success).toBe(
      false,
    );
    expect(createPayoutSchema.safeParse({ amountIdr: 100_000 }).success).toBe(false);
    expect(
      createPayoutSchema.safeParse({ amountIdr: 100_000, expectedFeeIdr: 0, netIdr: 1 }).success,
    ).toBe(false);
  });
});
