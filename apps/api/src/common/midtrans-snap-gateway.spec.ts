import { afterEach, describe, expect, it, vi } from 'vitest';
import { MidtransSnapGateway } from './midtrans-snap-gateway.js';
import { PaymentGatewayError } from './payment-gateway.js';

const SERVER_KEY = 'SB-Mid-server-secret';
const gateway = () =>
  new MidtransSnapGateway({ MIDTRANS_SERVER_KEY: SERVER_KEY, MIDTRANS_MERCHANT_ID: 'G123' });
const stub = (res: Response | Error) => {
  const fn = vi.fn(() => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res)));
  vi.stubGlobal('fetch', fn);
  return fn;
};
const INPUT = {
  orderNumber: 'INF-abc',
  grossIdr: 25000,
  itemName: '25 Koin',
  customerName: 'Ana',
  finishUrl: 'http://localhost:3000/wallet/topups/x',
  expiryMinutes: 60,
};

afterEach(() => vi.unstubAllGlobals());

describe('MidtransSnapGateway', () => {
  it('posts to the Sandbox Snap URL with Basic auth and the documented body', async () => {
    const fn = stub(
      Response.json(
        { token: 'tok', redirect_url: 'https://app.sandbox.midtrans.com/snap/v3/x' },
        { status: 201 },
      ),
    );
    expect(await gateway().createCheckout(INPUT)).toEqual({
      token: 'tok',
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v3/x',
    });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      transaction_details: { order_id: 'INF-abc', gross_amount: 25000 },
      item_details: [{ id: 'INF-abc', price: 25000, quantity: 1, name: '25 Koin' }],
      customer_details: { first_name: 'Ana' },
      callbacks: { finish: INPUT.finishUrl },
      expiry: { unit: 'minute', duration: 60 },
    });
  });

  it('turns an error status, a network failure and a bad body into PaymentGatewayError without the key', async () => {
    for (const res of [
      new Response('{"error_messages":["x"]}', { status: 401 }),
      new Response('nope', { status: 201 }),
      new Error(`connect failed with ${SERVER_KEY}`),
    ]) {
      stub(res);
      const error = await gateway()
        .createCheckout(INPUT)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PaymentGatewayError);
      expect(String((error as Error).message)).not.toContain(SERVER_KEY);
    }
  });

  it('reads a transaction status, and treats both kinds of not-found as null', async () => {
    const body = {
      order_id: 'INF-abc',
      status_code: '200',
      gross_amount: '25000.00',
      signature_key: 's',
      transaction_status: 'settlement',
    };
    const fn = stub(Response.json(body));
    expect((await gateway().getStatus('INF-abc'))?.transaction_status).toBe('settlement');
    expect((fn.mock.calls as unknown as [string][])[0]![0]).toBe(
      'https://api.sandbox.midtrans.com/v2/INF-abc/status',
    );
    stub(Response.json({ status_code: '404', status_message: "Transaction doesn't exist." }));
    expect(await gateway().getStatus('INF-abc')).toBeNull();
    stub(new Response('', { status: 404 }));
    expect(await gateway().getStatus('INF-abc')).toBeNull();
    stub(new Response('', { status: 500 }));
    await expect(gateway().getStatus('INF-abc')).rejects.toBeInstanceOf(PaymentGatewayError);
  });
});
