# Feature: Koin Wallet

**Slug:** koin-wallet
**Handoff phase:** Phase 4 — Coin wallet and purchase engine

## Overview

Every user has one Koin wallet usable across all creators. Balances are backed by an append-only ledger. Top-ups in this phase use a fake provider so business rules can be tested without a gateway. Koin are non-transferable and cannot be cashed out.

## ⚠ Rewrite before planning (Monetization Spec v1, LOCKED)

- Packages: 10 / 25 / 50 / 100 / 250 Koin at Rp1,000 per Koin, no bonus; channel fee only where lawful (never QRIS MDR).
- Track `coin_lots` per top-up and spend allocations per purchase (chargeback/refund tracing).

## Stories

- US-022: Wallet Balance & Transaction History (high)
- US-023: Koin Package Catalog (high)
- US-024: Simulated Top-Up for Development (high)
