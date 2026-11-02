-- 用户邮箱：H5 端的主身份，同时作为将来小程序绑定已有账号的目标。
-- 两列均可空 —— 存量用户全部由微信 openid 建号，没有邮箱，
-- 设成必填会让迁移失败。emailVerifiedAt 非 null 才代表邮箱已通过验证码验证。

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
