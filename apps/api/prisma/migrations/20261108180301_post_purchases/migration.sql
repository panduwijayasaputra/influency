-- CreateTable
CREATE TABLE "post_purchases" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "post_offer_id" UUID NOT NULL,
    "price_coins" BIGINT NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_purchases_post_id_idx" ON "post_purchases"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_purchases_user_id_post_id_key" ON "post_purchases"("user_id", "post_id");

-- AddForeignKey
ALTER TABLE "post_purchases" ADD CONSTRAINT "post_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_purchases" ADD CONSTRAINT "post_purchases_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_purchases" ADD CONSTRAINT "post_purchases_post_offer_id_fkey" FOREIGN KEY ("post_offer_id") REFERENCES "post_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LOCKED (Monetization Spec v1 §2): unlock price 5–1,000 Koin, platform fee 20% (2,000 bps).
ALTER TABLE "post_purchases" ADD CONSTRAINT "post_purchases_price_range" CHECK ("price_coins" BETWEEN 5 AND 1000);
ALTER TABLE "post_purchases" ADD CONSTRAINT "post_purchases_fee_bps" CHECK ("fee_bps" = 2000);

-- A purchase is the permanent entitlement: it is never edited or removed (a takedown is handled separately).
CREATE FUNCTION post_purchases_append_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'post_purchases is append-only'; END $$;
CREATE TRIGGER post_purchases_no_update_delete BEFORE UPDATE OR DELETE ON "post_purchases"
  FOR EACH ROW EXECUTE FUNCTION post_purchases_append_only();
