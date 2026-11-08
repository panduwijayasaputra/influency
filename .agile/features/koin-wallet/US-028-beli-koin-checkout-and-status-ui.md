# US-028: Beli Koin Checkout & Top-Up Status UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** koin-wallet

## Description

As a signed-in user, I want to confirm a Koin package, pay for it and then see whether my top-up went through, so that I know when my Koin are ready to use.

## Acceptance Criteria

- [x] Tapping "Beli {n} Koin" opens a BottomSheet confirmation: package Koin, price, channel fee (Rp0), **total due**, and "Lanjut ke pembayaran". A "Mode Sandbox — tidak ada uang sungguhan" badge is always visible.
- [x] Confirming starts checkout through one swappable checkout adapter. Until US-030 ships the adapter is a dummy that returns an order ID and goes straight to the status page; the button shows a loading state and cannot be double-submitted.
- [x] `/wallet/topups/[orderId]` shows the order status from the server (dummy until US-030):
  - **Menunggu pembayaran:** refreshes on an interval while pending and offers "Lanjutkan pembayaran" while the checkout is still open.
  - **Berhasil:** credited Koin and the new balance, with a link back to Dompet.
  - **Gagal / Kedaluwarsa / Dibatalkan:** a short reason and "Beli Koin lagi".
  - Unknown order or someone else's order: a not-found state.
- [x] The page never shows "Berhasil" based on a browser redirect or query parameter; only the server status decides it.
- [x] Each pending activity entry on Dompet links to its status page. Component tests cover the sheet, double-submit and every status state.

## Tasks

### TASK-147: Top-up confirmation sheet and checkout adapter
**Status:** done

### TASK-148: Top-up status page
**Status:** done
