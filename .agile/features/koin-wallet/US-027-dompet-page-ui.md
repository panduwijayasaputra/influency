# US-027: Dompet Page UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** koin-wallet

## Description

As a signed-in user, I want a Dompet page that shows my Koin balance, the Koin packages and my wallet activity, so that I know what I can spend and how to get more Koin.

## Acceptance Criteria

- [x] `/wallet` replaces the ComingSoon placeholder (signed-in only; guests go to login with `returnTo=/wallet`). It follows the artboard Wallet state in Light Social with Indonesian copy:
  - **Saldo Koin** card on the koin surface: the balance in Koin and "≈ Rp… · 1 Koin = Rp1.000" (IDR formatted `id-ID`).
  - **Beli Koin** section: five package tiles (Koin + Rp price) as a single-select group (`aria-pressed`), one preselected, and a primary button "Beli {n} Koin · Rp…". Tapping the button is a stub until US-028.
  - A small policy note about refunds/expiry labelled "Perlu konfirmasi" (OPEN items, never stated as policy).
  - **Aktivitas** list: title (e.g. "Isi ulang · 50 Koin", "Buka post dari …"), date in Asia/Jakarta, and a signed amount (+ in success colour, − in normal text). Older entries load on scroll or "Muat lagi".
- [x] Until US-029 ships, the page reads balance, packages and activity from one swappable dummy source with the same shape as the planned API.
- [x] **States:** skeleton while loading; "Belum ada aktivitas." for an empty list; an inline Indonesian error with "Coba lagi" if loading fails.
- [x] The account drawer Koin card and its "Beli Koin" link point to `/wallet` and read the balance from the same source (the hard-coded demo balance is removed from the drawer).
- [x] Layout works at 360px width, touch targets ≥ 44px, package tiles are keyboard operable; component tests cover the states and the package selection.

## Tasks

### TASK-145: Shared wallet contract and interim wallet data source
**Status:** done

### TASK-146: Dompet page and drawer Koin card
**Status:** done
