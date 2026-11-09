import { API_PREFIX, errorResponseSchema } from '@influency/shared';

/** An API error response, with the shared error code so callers branch on `code`, not on the message. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

/**
 * Send a request to the same-origin API and parse the answer with
 * `schema`. `idempotencyKey` is kept across retries of one attempt. Rejects with an `ApiError`.
 */
export async function sendJson<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  schema: { parse: (data: unknown) => T },
  opts: { body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const res = await fetch(`/${API_PREFIX}${path}`, {
    method,
    credentials: 'include',
    headers: {
      // The API rejects a JSON content type without a body.
      ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    const err = errorResponseSchema.safeParse(await res.json().catch(() => null));
    if (err.success) {
      throw new ApiError(err.data.error.code, err.data.error.message, err.data.error.details);
    }
    throw new ApiError('INTERNAL_ERROR', 'Terjadi kesalahan. Coba lagi.');
  }
  // 204 has no body (e.g. a DELETE); pass `z.undefined()` as the schema.
  if (res.status === 204) return schema.parse(undefined);
  return schema.parse(await res.json());
}

/** POST variant of `sendJson`. */
export const postJson = <T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  opts: { body?: unknown; idempotencyKey?: string } = {},
): Promise<T> => sendJson('POST', path, schema, opts);
