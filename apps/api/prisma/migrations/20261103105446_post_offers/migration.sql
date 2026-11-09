-- Per-post unlock offers (US-018). Append-only versions; hand-edited to add the CHECKs.

-- CreateTable
CREATE TABLE "post_offers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "post_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "price_coins" BIGINT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_offers_post_id_version_key" ON "post_offers"("post_id", "version");

-- AddForeignKey
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariant floor only; the max price/duration are TBD placeholders enforced by the API.
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_price_coins_positive" CHECK ("price_coins" > 0);
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_duration_positive" CHECK ("duration_seconds" > 0);
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_version_positive" CHECK ("version" >= 1);
