import { existsSync } from 'node:fs';
import { z } from 'zod';

export const R2_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const;

export const STREAM_VARS = ['CLOUDFLARE_STREAM_ACCOUNT_ID', 'CLOUDFLARE_STREAM_TOKEN'] as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    // Public web origin; the browser reaches the API through its /api/v1 rewrite.
    WEB_ORIGIN: z.url({ protocol: /^https?$/ }),
    // Telegram Login (BotFather > Login Widget): client ID is the numeric Bot ID.
    TELEGRAM_OIDC_CLIENT_ID: z.string().regex(/^\d+$/, 'must be the numeric Bot ID'),
    TELEGRAM_OIDC_CLIENT_SECRET: z.string().min(1),
    TELEGRAM_OIDC_REDIRECT_URI: z.url({ protocol: /^https?$/ }),
    // Absolute session lifetime; a new Telegram login is needed after it.
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    // Object storage: `local` (filesystem, development/test only) or `r2` (Cloudflare R2, private bucket).
    STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
    LOCAL_STORAGE_DIR: z.string().min(1).default('.local-storage'),
    // Lifetime of presigned upload URLs.
    UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    // Cloudflare R2, required when STORAGE_DRIVER=r2; API token scoped to the bucket.
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    // Video: `stub` (private object storage + simulated processing; development/test only) or `stream` (Cloudflare Stream).
    VIDEO_DRIVER: z.enum(['stub', 'stream']).default('stub'),
    // Lifetime of a video upload slot; large uploads outlast the image TTL.
    VIDEO_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(120).max(21600).default(1800),
    // Cloudflare Stream, required when VIDEO_DRIVER=stream; API token with Stream Write.
    CLOUDFLARE_STREAM_ACCOUNT_ID: z.string().min(1).optional(),
    CLOUDFLARE_STREAM_TOKEN: z.string().min(1).optional(),
    // TBD placeholder: when true, publishing sends posts to PENDING_REVIEW instead of PUBLISHED.
    POST_MODERATION_REQUIRED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    MIDTRANS_IS_PRODUCTION: z
      .enum(['true', 'false'])
      .default('false')
      .refine((v) => v === 'false', 'production payments are disabled for the MVP (sandbox only)')
      .transform(() => false as const),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 'r2') {
      for (const name of R2_VARS) {
        if (!env[name])
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'required when STORAGE_DRIVER=r2',
          });
      }
    } else if (env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'local storage is for development only',
      });
    }
    if (env.VIDEO_DRIVER === 'stream') {
      for (const name of STREAM_VARS) {
        if (!env[name])
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'required when VIDEO_DRIVER=stream',
          });
      }
    } else if (env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['VIDEO_DRIVER'],
        message: 'stub video is for development only',
      });
    }
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
