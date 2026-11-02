import { existsSync } from 'node:fs';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  MIDTRANS_IS_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .refine((v) => v === 'false', 'production payments are disabled for the MVP (sandbox only)')
    .transform(() => false as const),
});

export type Env = z.infer<typeof envSchema>;

/** Injection token for the validated `Env` (`@Inject(ENV) env: Env`). */
export const ENV = Symbol('ENV');

/** Parses the environment; throws one Error listing every invalid or missing variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  // Only paths and messages — never values, which may be secrets.
  const lines = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(
    [
      'Invalid environment configuration (copy .env.example to .env at the repo root):',
      ...lines,
    ].join('\n'),
  );
}

/** Loads a dotenv file if present; variables already in process.env win. */
export function loadEnvFile(path: string): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
