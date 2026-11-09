-- CreateEnum
CREATE TYPE "topup_status" AS ENUM ('CREATED', 'PENDING', 'CREDITED', 'FAILED', 'EXPIRED', 'CANCELED');

-- CreateTable
CREATE TABLE "topup_orders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "coins" BIGINT NOT NULL,
    "price_idr" BIGINT NOT NULL,
    "fee_idr" BIGINT NOT NULL DEFAULT 0,
    "total_idr" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "status" "topup_status" NOT NULL DEFAULT 'CREATED',
    "provider_status" TEXT,
    "provider_transaction_id" TEXT,
    "payment_type" TEXT,
    "redirect_url" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "credited_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "quarantined_at" TIMESTAMPTZ(3),
    "quarantine_reason" TEXT,
    "check_attempts" INTEGER NOT NULL DEFAULT 0,
    "next_check_at" TIMESTAMPTZ(3),
    "last_checked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topup_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topup_orders_order_number_key" ON "topup_orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "topup_orders_provider_transaction_id_key" ON "topup_orders"("provider_transaction_id");

-- CreateIndex
CREATE INDEX "topup_orders_user_id_created_at_idx" ON "topup_orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "topup_orders_status_next_check_at_idx" ON "topup_orders"("status", "next_check_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_scope_key_key" ON "idempotency_keys"("user_id", "scope", "key");

-- AddForeignKey
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "coin_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integer money, snapshot consistency, and "credited" only with a credit time (koin-wallet US-030).
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_coins_positive" CHECK ("coins" > 0);
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_price_positive" CHECK ("price_idr" > 0);
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_fee_nonnegative" CHECK ("fee_idr" >= 0);
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_total_matches" CHECK ("total_idr" = "price_idr" + "fee_idr");
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_currency_idr" CHECK ("currency" = 'IDR');
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_credited_has_time" CHECK (("status" = 'CREDITED') = ("credited_at" IS NOT NULL));
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_key_length" CHECK (char_length("key") BETWEEN 8 AND 128);
