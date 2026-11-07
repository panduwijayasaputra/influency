# US-071: Wallet Page

**Status:** backlog
**Priority:** medium
**Feature:** mobile-first-ui

## Description

As a signed-in user, I want to see my Koin balance, buy Koin and review my activity, so that I can manage what I spend.

## Acceptance Criteria

- [ ] **Dompet** (`/wallet`) shows a Koin balance card with the coin mark, the balance in Koin, "≈ RpX · 1 Koin = Rp1.000" and a **Beli Koin** button.
- [ ] Beli Koin shows exactly the five packages 10 / 25 / 50 / 100 / 250 Koin with IDR prices (Rp10.000–Rp250.000), a note that the user can top up more than once, and a "Perlu konfirmasi: metode pembayaran" note. Until US-031 it ends in a Demo message and never credits Koin.
- [ ] An **Aktivitas** list shows top-ups (+), unlocks and subscriptions (−), each with a date, plus an empty state.
- [ ] Balance and activity are dummy until US-022 and are marked as demo. Amounts are formatted as integers in `id-ID`.
