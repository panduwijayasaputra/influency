import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { DomainError } from './domain-error.js';

/** `@Body(new ZodValidationPipe(schema))` — invalid input becomes 400 VALIDATION_FAILED. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // Path + message only, never the submitted values.
      throw new DomainError('VALIDATION_FAILED', {
        issues: result.error.issues.map((i) => ({
          path: i.path.map(String).join('.'),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
