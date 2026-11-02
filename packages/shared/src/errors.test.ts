import { describe, expect, it } from 'vitest';
import { ERRORS, errorResponseSchema } from './index.js';

describe('error contract', () => {
  it.each(Object.entries(ERRORS))('%s has an HTTP error status and a message', (_, error) => {
    expect(error.status).toBeGreaterThanOrEqual(400);
    expect(error.status).toBeLessThan(600);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('parses a sample error body', () => {
    const body = {
      error: {
        code: 'INSUFFICIENT_COINS',
        message: ERRORS.INSUFFICIENT_COINS.message,
        requestId: 'req_1',
        details: { required: 5, available: 3 },
      },
    };

    expect(errorResponseSchema.parse(body)).toEqual(body);
    expect(errorResponseSchema.parse({ error: { ...body.error, details: null } })).toBeTruthy();
  });
});
