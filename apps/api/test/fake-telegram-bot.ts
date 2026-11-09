import type { SendResult, TelegramBot } from '../src/common/telegram-bot.js';

/** Test double for the official bot: records every message; `next` scripts the results of the coming sends. */
export function createFakeTelegramBot() {
  const sent: { chat: bigint; text: string }[] = [];
  const next: SendResult[] = [];
  const bot: TelegramBot = {
    sendMessage(chat, text) {
      sent.push({ chat, text });
      return Promise.resolve(next.shift() ?? { ok: true });
    },
  };
  return { bot, sent, next };
}
