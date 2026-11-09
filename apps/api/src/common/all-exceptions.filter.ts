import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { ERRORS, type ErrorCode, type ErrorResponse } from '@influency/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from './domain-error.js';

const HTTP_STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'AUTH_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  // Nest's Fastify adapter turns body-limit / missing-parser errors into these HttpExceptions.
  413: 'FILE_TOO_LARGE',
  415: 'UNSUPPORTED_FILE_TYPE',
};

/** Maps every error to `{ error: { code, message, requestId, details } }`; unknown errors become a generic 500. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const { code, details, message } = toError(exception);
    const { status } = ERRORS[code];
    if (status >= 500) request.log.error({ err: exception }, 'Unhandled error');

    const body: ErrorResponse = { error: { code, message, requestId: request.id, details } };
    void reply.status(status).send(body);
  }
}

function toError(exception: unknown): {
  code: ErrorCode;
  details: Record<string, unknown> | null;
  message: string;
} {
  if (exception instanceof DomainError) {
    return { code: exception.code, details: exception.details, message: exception.message };
  }
  const code = knownHttpCode(exception) ?? fastifyClientErrorCode(exception) ?? 'INTERNAL_ERROR';
  // Default messages only: Nest/Fastify/internal messages are never exposed.
  return { code, details: null, message: ERRORS[code].message };
}

function knownHttpCode(exception: unknown): ErrorCode | undefined {
  return exception instanceof HttpException ? HTTP_STATUS_CODES[exception.getStatus()] : undefined;
}

/** Fastify's own client errors (malformed JSON, bad content type, body too large). */
function fastifyClientErrorCode(exception: unknown): ErrorCode | undefined {
  if (!(exception instanceof Error) || !('code' in exception) || !('statusCode' in exception)) {
    return undefined;
  }
  const { code, statusCode } = exception;
  if (typeof code !== 'string' || !code.startsWith('FST_') || typeof statusCode !== 'number') {
    return undefined;
  }
  if (statusCode === 404) return 'NOT_FOUND';
  return statusCode >= 400 && statusCode < 500 ? 'VALIDATION_FAILED' : undefined;
}
