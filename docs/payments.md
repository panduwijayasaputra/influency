# Payments: Koin top-up (Midtrans Snap Sandbox)

Sandbox only. `MIDTRANS_IS_PRODUCTION=true` makes the API refuse to start, and there is no production URL in the code.

## Drivers

`PAYMENT_PROVIDER` in the root `.env`:

| Value            | Use                          | Notes                                                                                                                                                           |
| ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fake` (default) | tests, CI, offline dev       | In-process gateway; checkout returns straight to the status page, which then stays "Menunggu pembayaran" (nothing pays it). Refused when `NODE_ENV=production`. |
| `midtrans`       | trying real Sandbox checkout | Needs `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID` from your Midtrans **Sandbox** account. Never commit them.                           |

Automated tests always use `fake` (`apps/api/vitest.config.ts` pins it, whatever your `.env` says).

## Try a top-up with Midtrans Sandbox

1. Put your Sandbox keys in `.env`, set `PAYMENT_PROVIDER=midtrans`, restart `pnpm dev`.
2. Open `/wallet`, pick a package, **Beli** → **Lanjut ke pembayaran**. You land on the Snap page.
3. Pay with the Midtrans simulator (Sandbox payment simulator in the dashboard or the test card numbers in the Midtrans docs).
4. Snap sends you back to `/wallet/topups/{orderId}`. Koin are credited by the server, never by that redirect:
   - by the **payment notification** (needs a public HTTPS URL, below), or
   - by the **status check** the API makes when the status page is open and by the background reconciler (no tunnel needed).

## Payment notification (optional locally)

Midtrans cannot reach `localhost`. To receive notifications, expose the API with a tunnel and set the Sandbox dashboard's
Payment Notification URL to `https://<tunnel>/api/v1/webhooks/payments/midtrans`. Every notification is stored, its
`signature_key` is verified (`SHA512(order_id + status_code + gross_amount + ServerKey)`), and the amount, currency and
merchant are checked before any Koin are credited.

## Rules that never change

- The price comes from the database package, never from the browser.
- Koin are credited only from a verified notification or a status check, exactly once.
- A top-up is not creator revenue; revenue is allocated when Koin are spent.
