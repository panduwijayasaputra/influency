import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitCreatorApplication } from './creator-apply';

const input = {
  displayName: 'Ana',
  slug: 'ana',
  bio: '',
  acceptAgreement: true as const,
  subscriptionPriceCoins: 50,
};
const stub = (res: Response) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(res)),
  );
const err = (status: number, code: string, message: string, details?: unknown) =>
  Response.json(
    { error: { code, message, requestId: 'r1', details: details ?? null } },
    { status },
  );

afterEach(() => vi.unstubAllGlobals());

describe('submitCreatorApplication', () => {
  it('posts JSON with credentials and returns ok', async () => {
    stub(Response.json({}, { status: 201 }));
    expect(await submitCreatorApplication(input)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/creators/apply',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(input),
      }),
    );
  });

  it('maps SLUG_TAKEN and field validation issues to a field', async () => {
    stub(err(409, 'SLUG_TAKEN', 'Dipakai'));
    expect(await submitCreatorApplication(input)).toEqual({
      ok: false,
      field: 'slug',
      message: 'Dipakai',
    });
    stub(
      err(400, 'VALIDATION_FAILED', 'x', {
        issues: [{ path: 'subscriptionPriceCoins', message: 'Harga' }],
      }),
    );
    expect(await submitCreatorApplication(input)).toEqual({
      ok: false,
      field: 'subscriptionPriceCoins',
      message: 'Harga',
    });
  });

  it('returns a message for other errors and never throws', async () => {
    stub(err(409, 'CREATOR_APPLICATION_EXISTS', 'Sudah ada'));
    expect(await submitCreatorApplication(input)).toEqual({ ok: false, message: 'Sudah ada' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('net'))),
    );
    expect(await submitCreatorApplication(input)).toEqual({
      ok: false,
      message: 'Gagal mengirim pengajuan. Silakan coba lagi.',
    });
  });
});
