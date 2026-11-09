-- CreateTable
CREATE TABLE "creator_subscription_plans" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creator_profile_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "price_coins" BIGINT NOT NULL,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_subscription_plans_creator_profile_id_version_key" ON "creator_subscription_plans"("creator_profile_id", "version");

-- AddForeignKey
ALTER TABLE "creator_subscription_plans" ADD CONSTRAINT "creator_subscription_plans_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
