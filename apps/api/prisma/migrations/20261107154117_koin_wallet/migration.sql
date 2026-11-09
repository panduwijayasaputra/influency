-- CreateEnum
CREATE TYPE "coin_entry_type" AS ENUM ('TOPUP_CREDIT');

-- CreateEnum
CREATE TYPE "coin_source_type" AS ENUM ('TOPUP_ORDER');

-- CreateTable
CREATE TABLE "coin_packages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "coins" INTEGER NOT NULL,
    "price_idr" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_wallets" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "balance_coins" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_ledger_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wallet_id" UUID NOT NULL,
    "entry_type" "coin_entry_type" NOT NULL,
    "amount_coins" BIGINT NOT NULL,
    "balance_after_coins" BIGINT NOT NULL,
    "source_type" "coin_source_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_lots" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wallet_id" UUID NOT NULL,
    "source_type" "coin_source_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "issued_coins" BIGINT NOT NULL,
    "unspent_coins" BIGINT NOT NULL,
    "basis_idr" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_packages_coins_key" ON "coin_packages"("coins");

-- CreateIndex
CREATE UNIQUE INDEX "coin_wallets_user_id_key" ON "coin_wallets"("user_id");

-- CreateIndex
CREATE INDEX "coin_ledger_entries_wallet_id_created_at_id_idx" ON "coin_ledger_entries"("wallet_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "coin_ledger_entries_source_type_source_id_entry_type_key" ON "coin_ledger_entries"("source_type", "source_id", "entry_type");

-- CreateIndex
CREATE INDEX "coin_lots_wallet_id_created_at_idx" ON "coin_lots"("wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "coin_lots_source_type_source_id_key" ON "coin_lots"("source_type", "source_id");

-- AddForeignKey
ALTER TABLE "coin_wallets" ADD CONSTRAINT "coin_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_ledger_entries" ADD CONSTRAINT "coin_ledger_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "coin_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_lots" ADD CONSTRAINT "coin_lots_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "coin_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integer-only money, never negative (koin-wallet US-029). Names are asserted in wallet-schema.integration.spec.ts.
ALTER TABLE "coin_packages" ADD CONSTRAINT "coin_packages_coins_positive" CHECK ("coins" > 0);
ALTER TABLE "coin_packages" ADD CONSTRAINT "coin_packages_price_positive" CHECK ("price_idr" > 0);
ALTER TABLE "coin_wallets" ADD CONSTRAINT "coin_wallets_balance_nonnegative" CHECK ("balance_coins" >= 0);
ALTER TABLE "coin_ledger_entries" ADD CONSTRAINT "coin_ledger_entries_amount_nonzero" CHECK ("amount_coins" <> 0);
ALTER TABLE "coin_ledger_entries" ADD CONSTRAINT "coin_ledger_entries_balance_after_nonnegative" CHECK ("balance_after_coins" >= 0);
ALTER TABLE "coin_lots" ADD CONSTRAINT "coin_lots_issued_positive" CHECK ("issued_coins" > 0);
ALTER TABLE "coin_lots" ADD CONSTRAINT "coin_lots_unspent_range" CHECK ("unspent_coins" >= 0 AND "unspent_coins" <= "issued_coins");
ALTER TABLE "coin_lots" ADD CONSTRAINT "coin_lots_basis_nonnegative" CHECK ("basis_idr" >= 0);

-- The ledger is append-only: corrections are new compensating entries, never edits.
CREATE FUNCTION coin_ledger_entries_append_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'coin_ledger_entries is append-only'; END $$;
CREATE TRIGGER coin_ledger_entries_no_update_delete BEFORE UPDATE OR DELETE ON "coin_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION coin_ledger_entries_append_only();
