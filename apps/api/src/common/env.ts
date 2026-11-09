import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { z } from 'zod';
import { PAYOUT_MIN_IDR } from '@influency/shared';
import { isFieldKey } from './field-encryption.js';

export const R2_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const;

export const MIDTRANS_VARS = [
  'MIDTRANS_SERVER_KEY',
  'MIDTRANS_CLIENT_KEY',
  'MIDTRANS_MERCHANT_ID',
] as const;

export const STREAM_VARS = ['CLOUDFLARE_STREAM_ACCOUNT_ID', 'CLOUDFLARE_STREAM_TOKEN'] as const;

/** An optional setting left empty or at the .env.example placeholder counts as unset. */
const unlessPlaceholder = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === 'SET_LOCALLY' ? undefined : v), schema);

/** One proxy address or CIDR, e.g. 127.0.0.1, ::1, 10.0.0.0/8. */
function isProxyAddress(entry: string): boolean {
  const [address = '', bits, ...rest] = entry.split('/');
  const family = isIP(address);
  if (family === 0 || rest.length > 0) return false;
  if (bits === undefined) return true;
  const n = Number(bits);
  return /^\d+$/.test(bits) && n <= (family === 4 ? 32 : 128);
}

/** Fastify `trustProxy`: unset → false, a hop count (1–5), or a list of proxy IPs/CIDRs. `true` is refused. */
function parseTrustProxy(
  value: string | undefined,
  ctx: z.RefinementCtx,
): false | number | string[] {
  if (!value) return false;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops >= 1 && hops <= 5) return hops;
    ctx.addIssue({ code: 'custom', message: 'hop count must be 1-5' });
    return z.NEVER;
  }
  if (value.toLowerCase() === 'true') {
    ctx.addIssue({
      code: 'custom',
      message: 'TRUST_PROXY=true trusts any client; list the proxy addresses or a hop count.',
    });
    return z.NEVER;
  }
  const entries = value.split(',').map((e) => e.trim());
  if (!entries.every(isProxyAddress)) {
    ctx.addIssue({
      code: 'custom',
      message: 'must be a hop count or comma-separated proxy IPs/CIDRs',
    });
    return z.NEVER;
  }
  return entries;
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    // Proxies whose X-Forwarded-For sets req.ip (rate-limit keys): hop count or IPs/CIDRs; unset = trust none.
    // Set it only where the edge overwrites X-Forwarded-For, or clients can pick their own key (docs/media-protection.md).
    TRUST_PROXY: z.string().trim().optional().transform(parseTrustProxy),
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
    // TBD placeholder: a video still processing this long after its upload slot expired is marked failed (US-049).
    VIDEO_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(600).max(86400).default(7200),
    // How often stale uploads are swept (in-process timer); 0 = off.
    MEDIA_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(300),
    // TBD placeholder (10–30 min): lifetime of minted media URLs / playback tokens; ≥ the 600 s max video duration.
    MEDIA_ACCESS_TTL_SECONDS: z.coerce.number().int().min(600).max(1800).default(1800),
    // Cloudflare Stream, required when VIDEO_DRIVER=stream; API token with Stream Write.
    CLOUDFLARE_STREAM_ACCOUNT_ID: z.string().min(1).optional(),
    CLOUDFLARE_STREAM_TOKEN: z.string().min(1).optional(),
    // Secret returned when registering the Stream webhook (docs/video-processing.md); unset = webhook off, polling only.
    CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().min(1).optional(),
    // TBD placeholder: when true, publishing sends posts to PENDING_REVIEW instead of PUBLISHED.
    POST_MODERATION_REQUIRED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // TBD placeholder (Video Infrastructure v1 §15.3): when true, a dedicated uploaded cover is public unblurred
    // (downscaled only). Post images and video frames always stay blurred. Applies when a preview is generated.
    PREMIUM_COVER_CLEAR_ALLOWED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // TBD placeholder (Monetization Spec v1 §2, engagement rules OPEN): when true, logged-in users may like a premium
    // post they have not unlocked. Default: only viewers with access.
    PREMIUM_LIKES_WITHOUT_ACCESS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // TBD placeholders (Monetization Spec v1 §2, engagement rules OPEN): when true, logged-in users may read / write
    // comments on a premium post they have not unlocked. Default: only viewers with access.
    PREMIUM_COMMENTS_READ_WITHOUT_ACCESS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // Payout account numbers are encrypted at rest with this AES-256-GCM key: base64 of exactly 32 random bytes
    // (`openssl rand -base64 32`). Required: losing it makes stored numbers unreadable, so keep a backup (creator-studio US-062).
    PAYOUT_ACCOUNT_ENC_KEY: z
      .string()
      .refine(isFieldKey, 'must be base64 of exactly 32 bytes (openssl rand -base64 32)'),
    // TBD placeholder (EXAMPLE value, creator-studio US-063): the bank transfer fee of a payout in whole rupiah, borne by the
    // creator and shown before they confirm. The real cost is OPEN ("Perlu konfirmasi"). Below the Rp100.000 minimum, so a
    // valid request always leaves a positive net.
    PAYOUT_TRANSFER_FEE_IDR: z.coerce
      .number()
      .int()
      .min(0)
      .max(PAYOUT_MIN_IDR - 1)
      .default(2500),
    // TBD placeholder: true once the transfer fee above is the confirmed real cost. While false the UI labels it "Perlu konfirmasi".
    PAYOUT_TRANSFER_FEE_CONFIRMED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // TBD placeholder: comments one user may create per rolling minute (spam brake).
    COMMENT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
    // Payments: `fake` (in-process gateway, development/test only) or `midtrans` (Snap Sandbox, needs the keys below).
    PAYMENT_PROVIDER: z.enum(['fake', 'midtrans']).default('fake'),
    MIDTRANS_SERVER_KEY: z.string().min(1).optional(),
    MIDTRANS_CLIENT_KEY: z.string().min(1).optional(),
    MIDTRANS_MERCHANT_ID: z.string().min(1).optional(),
    // How often pending top-ups are checked with the Midtrans status API (in-process timer); 0 = off.
    TOPUP_RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
    // TBD placeholder: how long a top-up checkout stays payable.
    TOPUP_EXPIRY_MINUTES: z.coerce.number().int().min(15).max(1440).default(60),
    // EXAMPLE (not final policy): notifications older than this are left out of the inbox and the unread count.
    NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
    // EXAMPLE: a follower gets at most one new-post notification per creator per window.
    NEW_POST_NOTIFY_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
    // EXAMPLE: how long before a subscription period ends the reminder is created.
    SUBSCRIPTION_REMINDER_LEAD_HOURS: z.coerce.number().int().min(1).max(720).default(72),
    // How often the subscription reminder sweep runs (in-process timer); 0 = off.
    SUBSCRIPTION_REMINDER_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(86400).default(3600),
    // The one official Influency bot (US-074, docs/telegram-bot.md). Unset (or the SET_LOCALLY placeholder from
    // .env.example) = Telegram notifications unavailable.
    TELEGRAM_BOT_TOKEN: unlessPlaceholder(
      z
        .string()
        .regex(/^\d+:[\w-]+$/, 'must be a BotFather token')
        .optional(),
    ),
    TELEGRAM_BOT_USERNAME: unlessPlaceholder(
      z
        .string()
        .regex(/^\w{5,32}$/, 'bot username without @')
        .optional(),
    ),
    // setWebhook secret_token: 1–256 of A-Z a-z 0-9 _ - (Telegram's rule).
    TELEGRAM_BOT_WEBHOOK_SECRET: unlessPlaceholder(
      z
        .string()
        .regex(/^[\w-]{1,256}$/)
        .optional(),
    ),
    // How often queued Telegram messages are sent (in-process timer, US-074); 0 = off. Never runs without a bot.
    NOTIFICATION_DELIVERY_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(10),
    // Sends per message before it is given up (FAILED).
    NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    MIDTRANS_IS_PRODUCTION: z
      .enum(['true', 'false'])
      .default('false')
      .refine((v) => v === 'false', 'production payments are disabled for the MVP (sandbox only)')
      .transform(() => false as const),
  })
  .superRefine((env, ctx) => {
    if (env.TELEGRAM_BOT_TOKEN) {
      for (const name of ['TELEGRAM_BOT_USERNAME', 'TELEGRAM_BOT_WEBHOOK_SECRET'] as const) {
        if (!env[name])
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'required when TELEGRAM_BOT_TOKEN is set',
          });
      }
    }
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
    if (env.PAYMENT_PROVIDER === 'midtrans') {
      for (const name of MIDTRANS_VARS) {
        if (!env[name])
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'required when PAYMENT_PROVIDER=midtrans',
          });
      }
    } else if (env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'fake payments are for development and test only',
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
