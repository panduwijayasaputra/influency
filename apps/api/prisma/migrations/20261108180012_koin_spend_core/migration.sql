-- CreateEnum
CREATE TYPE "revenue_account" AS ENUM ('CREATOR', 'PLATFORM');

-- CreateEnum
CREATE TYPE "revenue_source_type" AS ENUM ('POST_PURCHASE');

-- CreateEnum
CREATE TYPE "revenue_entry_kind" AS ENUM ('SALE', 'REVERSAL');

-- AlterEnum
ALTER TYPE "coin_entry_type" ADD VALUE 'POST_PURCHASE_DEBIT';

-- AlterEnum
ALTER TYPE "coin_source_type" ADD VALUE 'POST_PURCHASE';

-- CreateTable
CREATE TABLE "coin_spend_allocations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "ledger_entry_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "coins" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_spend_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_ledger_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creator_profile_id" UUID NOT NULL,
    "account" "revenue_account" NOT NULL,
    "kind" "revenue_entry_kind" NOT NULL,
    "amount_idr" BIGINT NOT NULL,
    "gross_idr" BIGINT NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "source_type" "revenue_source_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "accrues_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coin_spend_allocations_lot_id_idx" ON "coin_spend_allocations"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "coin_spend_allocations_ledger_entry_id_lot_id_key" ON "coin_spend_allocations"("ledger_entry_id", "lot_id");

-- CreateIndex
CREATE INDEX "revenue_ledger_entries_creator_profile_id_accrues_at_idx" ON "revenue_ledger_entries"("creator_profile_id", "accrues_at");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_ledger_entries_source_type_source_id_account_kind_key" ON "revenue_ledger_entries"("source_type", "source_id", "account", "kind");

-- AddForeignKey
ALTER TABLE "coin_spend_allocations" ADD CONSTRAINT "coin_spend_allocations_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "coin_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_spend_allocations" ADD CONSTRAINT "coin_spend_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "coin_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_ledger_entries" ADD CONSTRAINT "revenue_ledger_entries_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A spend allocation takes at least one Koin from a lot.
ALTER TABLE "coin_spend_allocations" ADD CONSTRAINT "coin_spend_allocations_coins_positive" CHECK ("coins" > 0);

-- Revenue rows: a sale adds IDR, a reversal takes it back; fee in basis points; the gross is always positive.
ALTER TABLE "revenue_ledger_entries" ADD CONSTRAINT "revenue_ledger_entries_amount_sign"
  CHECK (("kind" = 'SALE' AND "amount_idr" > 0) OR ("kind" = 'REVERSAL' AND "amount_idr" < 0));
ALTER TABLE "revenue_ledger_entries" ADD CONSTRAINT "revenue_ledger_entries_fee_bps_range" CHECK ("fee_bps" BETWEEN 0 AND 10000);
ALTER TABLE "revenue_ledger_entries" ADD CONSTRAINT "revenue_ledger_entries_gross_positive" CHECK ("gross_idr" > 0);

-- Both tables are append-only: corrections are new compensating rows, never edits.
CREATE FUNCTION coin_spend_allocations_append_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'coin_spend_allocations is append-only'; END $$;
CREATE TRIGGER coin_spend_allocations_no_update_delete BEFORE UPDATE OR DELETE ON "coin_spend_allocations"
  FOR EACH ROW EXECUTE FUNCTION coin_spend_allocations_append_only();

CREATE FUNCTION revenue_ledger_entries_append_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'revenue_ledger_entries is append-only'; END $$;
CREATE TRIGGER revenue_ledger_entries_no_update_delete BEFORE UPDATE OR DELETE ON "revenue_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION revenue_ledger_entries_append_only();
