import { ERRORS, type ErrorCode } from '@influency/shared';

/** Expected business error; the global filter maps it to its HTTP status and the standard body. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: Record<string, unknown> | null = null,
    message?: string,
  ) {
    super(message ?? ERRORS[code].message);
  }
}
