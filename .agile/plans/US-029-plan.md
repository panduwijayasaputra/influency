# Technical Plan: US-029 — Koin Packages & Wallet Ledger API

## Architecture Overview

New `wallets` module (`apps/api/src/modules/wallets/`) owns packages, wallets, the Koin ledger and Koin lots. (The guideline's separate `coin-packages` module is folded in: packages are 5 locked rows with one read endpoint.)

The core is one method other modules call **inside their own transaction**:

```ts
WalletsService.creditInTx(tx: Prisma.TransactionClient, input: {
  userId: string; coins: bigint; entryType: CoinEntryType; sourceType: CoinSourceType; sourceId: string; basisIdr: bigint;
}): Promise<{ balanceCoins: bigint; entryId: string }>
```

It (1) ensures the wallet row exists (`INSERT … ON CONFLICT (user_id) DO NOTHING`), (2) locks it with `SELECT … FROM coin_wallets WHERE user_id = $1 FOR UPDATE`, (3) inserts the ledger entry with `balance_after_coins`, (4) inserts a Koin lot for the same source, (5) updates `coin_wallets.balance_coins` — all on `tx`. No other code writes `balance_coins`. `debitInTx` (with FIFO lot allocation) comes in `purchases`.

Append-only is enforced in the database: a trigger rejects `UPDATE`/`DELETE` on `coin_ledger_entries`.

## Dependencies

- One Prisma migration (raw SQL for CHECKs and the trigger).

## Risks

- **Race on first credit:** `ON CONFLICT DO NOTHING` + `FOR UPDATE` serialises concurrent credits to the same wallet; the unique source key makes a duplicate credit fail the whole transaction.
- **BigInt in JSON:** convert with `toSafeInt(b: bigint)` (throws above `Number.MAX_SAFE_INTEGER`) in the mapper; never `Number()` silently.
- **Lock ordering:** callers that also lock another row (top-up order in US-031) lock **that row first, then the wallet**. Document this on `creditInTx`.

## Tasks

### TASK-149: Wallet schema, migration and package seed

**Prisma schema** (`apps/api/prisma/schema.prisma`, conventions: uuidv7 ids, snake_case maps, `Timestamptz(3)`):

```prisma
enum CoinEntryType { TOPUP_CREDIT  @@map("coin_entry_type") }    // purchases adds debits later
enum CoinSourceType { TOPUP_ORDER  @@map("coin_source_type") }   // later: CONTENT_PURCHASE, SUBSCRIPTION_PERIOD, TIP, ADJUSTMENT

model CoinPackage {      // coin_packages
  id, coins Int (CHECK > 0, UNIQUE), priceIdr Int @map("price_idr") (CHECK > 0), active Boolean @default(true), createdAt
}
model CoinWallet {       // coin_wallets
  id, userId @unique (FK users RESTRICT), balanceCoins BigInt @default(0) @map("balance_coins") (CHECK >= 0), createdAt, updatedAt
}
model CoinLedgerEntry {  // coin_ledger_entries
  id, walletId (FK RESTRICT), entryType CoinEntryType, amountCoins BigInt (CHECK <> 0),
  balanceAfterCoins BigInt (CHECK >= 0), sourceType CoinSourceType, sourceId @db.Uuid, createdAt @default(now())
  @@unique([sourceType, sourceId, entryType])   // a source posts once per entry type
  @@index([walletId, createdAt(sort: Desc), id(sort: Desc)])
}
model CoinLot {          // coin_lots
  id, walletId (FK RESTRICT), sourceType CoinSourceType, sourceId @db.Uuid, issuedCoins BigInt (CHECK > 0),
  unspentCoins BigInt (CHECK unspent BETWEEN 0 AND issued), basisIdr BigInt (CHECK >= 0), createdAt
  @@unique([sourceType, sourceId])
  @@index([walletId, createdAt])                 // FIFO order for purchases
}
```

Migration `pnpm db:migrate --name koin_wallet`, then append raw SQL to the generated `migration.sql`:
- the CHECKs listed above (named `coin_wallets_balance_nonnegative`, `coin_ledger_entries_amount_nonzero`, `coin_ledger_entries_balance_after_nonnegative`, `coin_lots_unspent_range`, `coin_lots_basis_nonnegative`, `coin_packages_coins_positive`, `coin_packages_price_positive`);
- append-only trigger:
  ```sql
  CREATE FUNCTION coin_ledger_entries_append_only() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN RAISE EXCEPTION 'coin_ledger_entries is append-only'; END $$;
  CREATE TRIGGER coin_ledger_entries_no_update_delete BEFORE UPDATE OR DELETE ON coin_ledger_entries
    FOR EACH ROW EXECUTE FUNCTION coin_ledger_entries_append_only();
  ```
  The test DB is wiped by `DROP SCHEMA` once per run (`apps/api/test/global-setup.ts`) and specs create fresh users instead of deleting rows, so the trigger does not get in the way. Tests must never `deleteMany` ledger rows.
Run `pnpm --filter @influency/api generate`. `schema-conventions.integration.spec.ts` must still pass (BigInt is allowed; no float/numeric).

**Seed:** `apps/api/src/common/demo-ids.ts` gets `DEMO_COIN_PACKAGE_IDS` (5 fixed UUIDs). New `apps/api/prisma/seed/coin-packages.ts` `seedCoinPackages` upserts the LOCKED packages 10/25/50/100/250 Koin with `priceIdr = coins * 1000` (comment: LOCKED, Monetization Spec v1 §2; no bonus). Add `{ name: 'coin packages', run: seedCoinPackages }` to `seedSteps`. These are locked values, so not labelled EXAMPLE. Packages are also needed in tests: the integration helpers insert them via the same function.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | 4 models + 2 enums (+ back-relation on `User`) |
| CREATE | `apps/api/prisma/migrations/<ts>_koin_wallet/migration.sql` | Tables, CHECKs, trigger |
| MODIFY | `apps/api/src/common/demo-ids.ts` | Package ids |
| CREATE | `apps/api/prisma/seed/coin-packages.ts` | Seed step |
| MODIFY | `apps/api/prisma/seed/seed.ts` | Register step |
| CREATE | `apps/api/src/modules/wallets/wallet-schema.integration.spec.ts` | DB guarantees |

**Testing (real Postgres):** negative `balance_coins` update rejected by CHECK; ledger `UPDATE` and `DELETE` raise; duplicate `(source_type, source_id, entry_type)` rejected; lot `unspent > issued` rejected; seed run twice leaves exactly 5 packages.

---

### TASK-150: WalletsService ledger core and read API

**Shared** (`packages/shared/src/wallet.ts` from TASK-145) is the contract; add nothing unless a field is missing.

**`apps/api/src/modules/wallets/`:**
- `wallets.module.ts` — imports `CommonModule`; exports `WalletsService`; registers it in `AppModule`.
- `wallets.service.ts`:
  - `creditInTx(tx, input)` as in the overview. Uses `tx.$executeRaw` for the `INSERT … ON CONFLICT DO NOTHING` and `tx.$queryRaw` for `SELECT id, balance_coins FROM coin_wallets WHERE user_id = ${userId}::uuid FOR UPDATE`. `coins` must be > 0 (throw `Error`, programming error). New balance = locked balance + coins; insert ledger entry with `balanceAfterCoins`, insert lot (`issuedCoins = unspentCoins = coins`, `basisIdr`), `update` wallet balance. JSDoc: "Call inside the caller's transaction; lock any other row before calling (lock order: business row → wallet)."
  - `getWallet(userId) → { balanceCoins: number }` — no row → 0 (no insert on read).
  - `listTransactions(userId, cursor: string | null, limit = 20)` — keyset on `(created_at DESC, id DESC)`, opaque cursor = base64url of `createdAt|id` (reuse the feed's cursor helper if `feed-order.ts` exports one, else a local one). Maps `entryType`, signed `amountCoins`, `topupOrderId = sourceType === 'TOPUP_ORDER' ? sourceId : null`, `detail: null`.
  - `listPackages()` — active packages ordered by `coins`.
  - `toSafeInt(b: bigint): number` helper in `apps/api/src/common/bigint.ts` (+ unit test).
- `wallets.controller.ts` (`@Controller('wallet')`, every response `cache-control: no-store`):
  - `GET /wallet` — `SessionGuard` → `walletSchema`.
  - `GET /wallet/transactions?cursor=` — `SessionGuard`; query validated with a Zod schema (`cursor` optional string ≤ 200) → `walletTransactionsPageSchema`. Bad cursor → `VALIDATION_FAILED`.
  - `GET /wallet/packages` — public (no guard) → `coinPackagesResponseSchema`.
  - Ownership: the user id always comes from `req.authSession.userId`; there is no user id parameter.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/wallets/wallets.module.ts` | Module |
| CREATE | `apps/api/src/modules/wallets/wallets.service.ts` | Ledger core + reads |
| CREATE | `apps/api/src/modules/wallets/wallets.controller.ts` | 3 endpoints |
| CREATE | `apps/api/src/common/bigint.ts` (+ `.spec.ts`) | Safe BigInt → number |
| MODIFY | `apps/api/src/app.module.ts` | Register module |
| CREATE | `apps/api/src/modules/wallets/wallets.integration.spec.ts` | Tests |

**Testing (real Postgres, Fastify inject):**
- new user: `GET /wallet` → 0, no wallet row created; transactions empty.
- `creditInTx` twice with different sources → balance = sum; each entry's `balance_after_coins` matches the running sum; one lot per credit with `unspent = issued`.
- same source twice → second transaction rolls back (P2002), balance unchanged.
- **concurrency:** 10 parallel `prisma.$transaction(tx => creditInTx(tx, …))` with different sources for a fresh user → balance = 10 × coins, 10 entries, exactly one wallet row.
- invariant check helper used in the tests: `balance_coins == SUM(amount_coins)` per wallet.
- pagination over 25 entries (3 pages, no duplicates/skips); bad cursor → 400.
- guests get 401 on `/wallet` and `/wallet/transactions`; user A never sees user B's entries; `/wallet/packages` works without a session and returns 5 packages in order.

---

### TASK-151: Wire Dompet, drawer and purchase sheet to the wallet API

**`apps/web/src/lib/api/wallet.ts`:** replace the dummy bodies of `fetchWallet`, `fetchWalletTransactions`, `fetchCoinPackages` with `fetch(`/${API_PREFIX}/wallet…`, { credentials: 'include' })` + shared schema parse; non-OK → throw. Remove their dummy data and `shortcut:` comments (keep the top-up dummies for US-030).

**Purchase sheet** `apps/web/src/components/purchase-sheet.tsx` (agreed: in this story): replace `DEMO_KOIN_BALANCE` with `useWalletBalance(open)`; while loading show "…" and disable the confirm action; the "Isi Koin · kurang {n} Koin" link uses the real balance. Delete `DEMO_KOIN_BALANCE` from `apps/web/src/lib/demo.ts` (keep the other demo exports the purchase sheet still needs until `purchases`). Update `account-drawer.test.tsx` / purchase-sheet tests that referenced the constant.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/wallet.ts` (+ test) | Real fetches |
| MODIFY | `apps/web/src/components/purchase-sheet.tsx` (+ test) | Real balance |
| MODIFY | `apps/web/src/lib/demo.ts` | Remove demo balance |
| MODIFY | `apps/web/src/components/account-drawer.test.tsx` | Mock `fetchWallet` |

**Testing:** fetchers call the right URLs with `credentials: 'include'` and reject on non-OK / schema mismatch; purchase sheet shows "kurang n Koin" from a mocked balance and disables confirm while loading; `grep DEMO_KOIN_BALANCE` returns nothing.
