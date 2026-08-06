-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeslot" TEXT NOT NULL,
    "weather" JSONB,
    "outfits" JSONB NOT NULL,
    "garment_ids" JSONB NOT NULL,
    "seasonal_count" INTEGER NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendations_owner_id_stale_idx" ON "recommendations"("owner_id", "stale");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_owner_id_date_timeslot_key" ON "recommendations"("owner_id", "date", "timeslot");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
