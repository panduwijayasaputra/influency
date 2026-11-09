import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { STREAM_WEBHOOK_TOLERANCE_SECONDS, verifyStreamWebhook } from './stream-webhook.js';

const SECRET = 'test-webhook-secret';
const NOW = new Date('2026-11-04T00:00:00.000Z');
const TIME = NOW.getTime() / 1000;
const BODY = Buffer.from('{"uid":"6b9e68b07dfee8cc2d116e4c51d6a957","readyToStream":true}\n');
const sign = (time: number, body: Buffer = BODY, secret = SECRET) =>
  `time=${time},sig1=${createHmac('sha256', secret).update(`${time}.`).update(body).digest('hex')}`;

describe('verifyStreamWebhook', () => {
  it('accepts a correctly signed body', () => {
    expect(verifyStreamWebhook(BODY, sign(TIME), SECRET, NOW)).toBe(true);
  });

  it('accepts timestamps at the edge of the tolerance', () => {
    const edge = STREAM_WEBHOOK_TOLERANCE_SECONDS;
    expect(verifyStreamWebhook(BODY, sign(TIME - edge), SECRET, NOW)).toBe(true);
    expect(verifyStreamWebhook(BODY, sign(TIME + edge), SECRET, NOW)).toBe(true);
  });

  it.each([
    ['a tampered body', BODY, sign(TIME, Buffer.from('{"uid":"other"}'))],
    ['the wrong secret', BODY, sign(TIME, BODY, 'other-secret')],
    ['a stale timestamp', BODY, sign(TIME - STREAM_WEBHOOK_TOLERANCE_SECONDS - 1)],
    ['a future timestamp', BODY, sign(TIME + STREAM_WEBHOOK_TOLERANCE_SECONDS + 1)],
    ['a missing header', BODY, undefined],
    ['an empty header', BODY, ''],
    ['no sig1', BODY, `time=${TIME}`],
    ['no time', BODY, sign(TIME).replace(/^time=\d+,/, '')],
    ['a non-numeric time', BODY, sign(TIME).replace(/^time=\d+/, 'time=abc')],
    ['a short signature', BODY, `time=${TIME},sig1=abcd`],
    ['a non-hex signature', BODY, `time=${TIME},sig1=${'z'.repeat(64)}`],
  ])('rejects %s', (_name, body, header) => {
    expect(verifyStreamWebhook(body, header, SECRET, NOW)).toBe(false);
  });
});
