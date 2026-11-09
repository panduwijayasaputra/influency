import type { Env } from './env.js';

/** The one official Influency bot (US-074, ADR 0001). Injected as null when no bot is configured. */
export const TELEGRAM_BOT = Symbol('TELEGRAM_BOT');

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      /** No retry helps: blocked bot, unknown chat, bad request. */
      permanent: boolean;
      /** Telegram flood control (429 `parameters.retry_after`). */
      retryAfterSeconds?: number;
      /** Status/description only, safe to store: never the URL (it holds the token). */
      code: string;
    };

export interface TelegramBot {
  sendMessage(chat: bigint, text: string): Promise<SendResult>;
}

interface BotApiResponse {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

/** Bot API over plain fetch (only sendMessage is needed; updates arrive by webhook). */
export class FetchTelegramBot implements TelegramBot {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async sendMessage(chat: bigint, text: string): Promise<SendResult> {
    let res: Response;
    try {
      res = await this.fetchFn(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Plain text (no parse_mode), so user names can't inject markup.
        body: JSON.stringify({
          chat_id: chat.toString(),
          text,
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      // The error message may contain the URL with the token: keep only its kind.
      return { ok: false, permanent: false, code: `network:${(err as Error).name}` };
    }
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as BotApiResponse;
    const code = `${res.status}:${(body.description ?? '').slice(0, 120)}`;
    if (res.status === 429) {
      return {
        ok: false,
        permanent: false,
        retryAfterSeconds: body.parameters?.retry_after ?? 30,
        code,
      };
    }
    // 403: the user blocked the bot or never started it; 400: chat not found / bad request.
    return { ok: false, permanent: res.status === 400 || res.status === 403, code };
  }
}

export const telegramBotFromEnv = (env: Env): TelegramBot | null =>
  env.TELEGRAM_BOT_TOKEN ? new FetchTelegramBot(env.TELEGRAM_BOT_TOKEN) : null;
