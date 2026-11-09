import { describe, expect, it, vi } from 'vitest';
import { FetchTelegramBot } from './telegram-bot.js';

const TOKEN = '123456:SECRET-TOKEN';
const botWith = (impl: () => Promise<Response>) => {
  const fetchFn = vi.fn((_url: string, _init?: RequestInit) => impl());
  return { bot: new FetchTelegramBot(TOKEN, fetchFn as unknown as typeof fetch), fetchFn };
};

describe('FetchTelegramBot', () => {
  it('sends plain text without link previews', async () => {
    const { bot, fetchFn } = botWith(() => Promise.resolve(Response.json({ ok: true })));
    expect(await bot.sendMessage(4_503_599_627_370_495n, 'Halo')).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init!.body as string)).toEqual({
      chat_id: '4503599627370495',
      text: 'Halo',
      link_preview_options: { is_disabled: true },
    });
  });

  it.each([
    [403, { description: 'Forbidden: bot was blocked by the user' }, true],
    [400, { description: 'Bad Request: chat not found' }, true],
    [500, {}, false],
  ])('maps %i (permanent: %s)', async (status, body, permanent) => {
    const { bot } = botWith(() =>
      Promise.resolve(Response.json({ ok: false, ...body }, { status })),
    );
    const res = await bot.sendMessage(1n, 'x');
    expect(res).toMatchObject({ ok: false, permanent });
    expect(res.ok === false && res.code.startsWith(String(status))).toBe(true);
  });

  it('passes flood control retry_after through', async () => {
    const { bot } = botWith(() =>
      Promise.resolve(
        Response.json({ ok: false, parameters: { retry_after: 7 } }, { status: 429 }),
      ),
    );
    expect(await bot.sendMessage(1n, 'x')).toMatchObject({
      ok: false,
      permanent: false,
      retryAfterSeconds: 7,
    });
  });

  it('never puts the token into a network error code', async () => {
    const { bot } = botWith(() =>
      Promise.reject(new TypeError(`fetch failed for https://api.telegram.org/bot${TOKEN}`)),
    );
    const res = await bot.sendMessage(1n, 'x');
    expect(res).toMatchObject({ ok: false, permanent: false });
    expect(JSON.stringify(res)).not.toContain('SECRET');
  });
});
