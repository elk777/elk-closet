-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "unionid" TEXT,
    "wx_mini_openid" TEXT,
    "wx_app_openid" TEXT,
    "nickname" TEXT,
    "avatar_url" TEXT,
    "closet_name" TEXT NOT NULL DEFAULT '我的衣橱',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "major_type" TEXT NOT NULL,
    "main_color" TEXT NOT NULL,
    "color_hex" TEXT NOT NULL,
    "material" TEXT NOT NULL DEFAULT '',
    "thickness" TEXT NOT NULL,
    "seasons" JSONB NOT NULL,
    "formality" TEXT NOT NULL,
    "style_tags" JSONB NOT NULL DEFAULT '[]',
    "extra" JSONB NOT NULL DEFAULT '{}',
    "original_image_url" TEXT NOT NULL,
    "cutout_image_url" TEXT,
    "brand" TEXT,
    "price" INTEGER,
    "purchased_at" TIMESTAMP(3),
    "purchase_channel" TEXT,
    "purchase_url" TEXT,
    "wear_count" INTEGER NOT NULL DEFAULT 0,
    "last_worn_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_unionid_key" ON "users"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "users_wx_mini_openid_key" ON "users"("wx_mini_openid");

-- CreateIndex
CREATE UNIQUE INDEX "users_wx_app_openid_key" ON "users"("wx_app_openid");

-- CreateIndex
CREATE INDEX "garments_owner_id_deleted_at_idx" ON "garments"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "garments_owner_id_category_idx" ON "garments"("owner_id", "category");

-- AddForeignKey
ALTER TABLE "garments" ADD CONSTRAINT "garments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
