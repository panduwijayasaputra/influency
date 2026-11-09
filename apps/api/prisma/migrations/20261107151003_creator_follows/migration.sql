-- CreateTable
CREATE TABLE "creator_follows" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "creator_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_follows_creator_profile_id_idx" ON "creator_follows"("creator_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_follows_user_id_creator_profile_id_key" ON "creator_follows"("user_id", "creator_profile_id");

-- AddForeignKey
ALTER TABLE "creator_follows" ADD CONSTRAINT "creator_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_follows" ADD CONSTRAINT "creator_follows_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
