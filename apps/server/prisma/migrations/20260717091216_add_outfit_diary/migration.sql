-- CreateTable
CREATE TABLE "outfits" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "worn_on" DATE NOT NULL,
    "occasion" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "weather" JSONB,
    "note" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outfits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outfit_items" (
    "id" TEXT NOT NULL,
    "outfit_id" TEXT NOT NULL,
    "garment_id" TEXT NOT NULL,

    CONSTRAINT "outfit_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outfits_owner_id_worn_on_idx" ON "outfits"("owner_id", "worn_on");

-- CreateIndex
CREATE INDEX "outfit_items_garment_id_idx" ON "outfit_items"("garment_id");

-- CreateIndex
CREATE UNIQUE INDEX "outfit_items_outfit_id_garment_id_key" ON "outfit_items"("outfit_id", "garment_id");

-- AddForeignKey
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_garment_id_fkey" FOREIGN KEY ("garment_id") REFERENCES "garments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
