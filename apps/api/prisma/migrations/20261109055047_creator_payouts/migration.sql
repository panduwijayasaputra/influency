-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('REQUESTED', 'CANCELED', 'REJECTED', 'PAID_OUT');

-- CreateTable
CREATE TABLE "creator_payout_accounts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creator_profile_id" UUID NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_number_enc" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "creator_payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_payouts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creator_profile_id" UUID NOT NULL,
    "payout_account_id" UUID NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_last4" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "amount_idr" BIGINT NOT NULL,
    "fee_idr" BIGINT NOT NULL,
    "net_idr" BIGINT NOT NULL,
    "fee_is_placeholder" BOOLEAN NOT NULL,
    "status" "payout_status" NOT NULL DEFAULT 'REQUESTED',
    "requested_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "creator_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_payout_status_changes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payout_id" UUID NOT NULL,
    "from_status" "payout_status",
    "to_status" "payout_status" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_payout_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_payout_accounts_creator_profile_id_idx" ON "creator_payout_accounts"("creator_profile_id");

-- CreateIndex
CREATE INDEX "creator_payouts_creator_profile_id_created_at_idx" ON "creator_payouts"("creator_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "creator_payout_status_changes_payout_id_created_at_idx" ON "creator_payout_status_changes"("payout_id", "created_at");

-- AddForeignKey
ALTER TABLE "creator_payout_accounts" ADD CONSTRAINT "creator_payout_accounts_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_payout_account_id_fkey" FOREIGN KEY ("payout_account_id") REFERENCES "creator_payout_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_payout_status_changes" ADD CONSTRAINT "creator_payout_status_changes_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "creator_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_payout_status_changes" ADD CONSTRAINT "creator_payout_status_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- creator-studio US-060 -------------------------------------------------------------------------------------------

-- Payout accounts: exactly one active, non-deleted account per creator. This is the backstop; the service also
-- serializes writes with a creator-row lock.
CREATE UNIQUE INDEX "creator_payout_accounts_one_active" ON "creator_payout_accounts"("creator_profile_id")
  WHERE "active" AND "deleted_at" IS NULL;
ALTER TABLE "creator_payout_accounts" ADD CONSTRAINT "creator_payout_accounts_last4" CHECK ("last4" ~ '^[0-9]{4}$');
ALTER TABLE "creator_payout_accounts" ADD CONSTRAINT "creator_payout_accounts_holder_length"
  CHECK (char_length("holder_name") BETWEEN 1 AND 100);
-- A deleted account is never active.
ALTER TABLE "creator_payout_accounts" ADD CONSTRAINT "creator_payout_accounts_deleted_inactive"
  CHECK (NOT ("active" AND "deleted_at" IS NOT NULL));

-- Only active and deleted_at may change, and a deleted account stays deleted. Never a real DELETE: payouts reference it.
CREATE FUNCTION creator_payout_accounts_guard() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'creator_payout_accounts rows are never deleted';
  END IF;
  IF (to_jsonb(NEW) - 'active' - 'deleted_at') IS DISTINCT FROM (to_jsonb(OLD) - 'active' - 'deleted_at')
     OR (OLD."deleted_at" IS NOT NULL AND NEW."deleted_at" IS DISTINCT FROM OLD."deleted_at") THEN
    RAISE EXCEPTION 'creator_payout_accounts allows only changing active and soft-deleting';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER creator_payout_accounts_guard_trigger BEFORE UPDATE OR DELETE ON "creator_payout_accounts"
  FOR EACH ROW EXECUTE FUNCTION creator_payout_accounts_guard();

-- Payouts: the minimum withdrawal is LOCKED at Rp100.000 (measured before the transfer fee).
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_min_amount" CHECK ("amount_idr" >= 100000);
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_fee" CHECK ("fee_idr" >= 0);
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_net" CHECK ("net_idr" = "amount_idr" - "fee_idr" AND "net_idr" > 0);
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_last4" CHECK ("account_last4" ~ '^[0-9]{4}$');

-- Never deleted. The only update is REQUESTED -> a final status (status and updated_at change, nothing else).
CREATE FUNCTION creator_payouts_guard() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'creator_payouts rows are never deleted';
  END IF;
  IF OLD."status" <> 'REQUESTED'
     OR NEW."status" = 'REQUESTED'
     OR (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'creator_payouts allows only moving a REQUESTED payout to its final status';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER creator_payouts_guard_trigger BEFORE UPDATE OR DELETE ON "creator_payouts"
  FOR EACH ROW EXECUTE FUNCTION creator_payouts_guard();

-- The audit trail is append-only.
CREATE FUNCTION creator_payout_status_changes_append_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'creator_payout_status_changes is append-only'; END $$;
CREATE TRIGGER creator_payout_status_changes_no_update_delete BEFORE UPDATE OR DELETE ON "creator_payout_status_changes"
  FOR EACH ROW EXECUTE FUNCTION creator_payout_status_changes_append_only();
