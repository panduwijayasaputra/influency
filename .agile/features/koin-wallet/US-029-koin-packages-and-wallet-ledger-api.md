# US-029: Koin Packages & Wallet Ledger API

**Status:** ready_for_uat
**Priority:** high
**Feature:** koin-wallet

## Description

As a user, I want my Koin balance to come from a trustworthy ledger, so that every Koin I have can be traced and can never be lost or double-counted.

## Acceptance Criteria

- [x] **Packages:** the five LOCKED packages (10/25/50/100/250 Koin, Rp1.000 per Koin, no bonus) are seeded idempotently. `GET /wallet/packages` returns the active ones in Koin order, with integer Koin and IDR. Changing or deactivating a package later never changes existing orders.
- [x] **Wallet and ledger:**
  - Each user has exactly one wallet; a user with no movements reads as 0 Koin.
  - Every movement is an append-only ledger entry (signed integer Koin, type, source type + source ID, timestamp) written in a DB transaction with the wallet row locked. The cached balance is updated only in that same transaction and never goes negative (DB CHECK).
  - A DB unique constraint on the source key makes the same source impossible to post twice.
  - Ledger rows cannot be updated or deleted by application code; corrections are compensating entries.
- [x] **Koin lots:** every top-up credit creates a lot with its source order, issued Koin, IDR basis and unspent Koin, ready for spend allocation in `purchases`.
- [x] **Read API:** `GET /wallet` (balance) and `GET /wallet/transactions` (cursor-paginated, newest first, with a display title and related item) for the signed-in user only; guests get 401. Koin are integers end to end (BIGINT in DB, serialised safely in JSON).
- [x] The Dompet page and the drawer read this API instead of dummy data (package list, balance, activity). Integration tests cover: zero wallet, ledger/balance consistency, duplicate source rejected, negative balance rejected, a user cannot read another user's wallet.

## Tasks

### TASK-149: Wallet schema, migration and package seed
**Status:** done

### TASK-150: WalletsService ledger core and read API
**Status:** done

### TASK-151: Wire Dompet, drawer and purchase sheet to the wallet API
**Status:** done
