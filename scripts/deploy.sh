#!/bin/bash
#
# 日常发版：拉代码 → 构建 → 迁移 → 发布静态站 → 重启后端。
#
# 与 server-setup.sh 的区别：那个是首次安装（含装依赖），这个是每次改完代码后跑。
# 合并成一个脚本会让首次安装变复杂，分开更好排查。
#
# 用法：
#   bash scripts/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
H5_DIR="${H5_DIR:-/www/wwwroot/elk-zhiyi/zhiyi-h5}"

echo "== 1/5 拉取代码 =="
# 用 pull-code.sh 而不是直接 git pull：国内服务器直连 GitHub 常失败，
# 脚本会自动切镜像重试
bash "$ROOT/scripts/pull-code.sh"

echo ""
echo "== 2/5 安装依赖 =="
export npm_config_registry="${npm_config_registry:-https://registry.npmmirror.com}"
export npm_config_sharp_libvips_binary_host="${npm_config_sharp_libvips_binary_host:-https://registry.npmmirror.com/-/binary/sharp-libvips}"
pnpm install --frozen-lockfile

echo ""
echo "== 3/5 构建 =="
pnpm --filter @zhiyi/shared build
NODE_ENV=production pnpm --filter @zhiyi/server exec prisma generate
pnpm --filter @zhiyi/server build
pnpm --filter @zhiyi/client build:h5

echo ""
echo "== 4/5 数据库迁移 =="
NODE_ENV=production pnpm --filter @zhiyi/server exec prisma migrate deploy

echo ""
echo "== 5/5 发布静态站并重启后端 =="
mkdir -p "$H5_DIR"
# -a 保留属性，--delete 清掉旧哈希文件，避免历史产物堆积
rsync -a --delete "$ROOT/apps/client/dist/build/h5/" "$H5_DIR/"
pm2 restart zhiyi-server || pm2 start "$ROOT/ecosystem.config.js"
nginx -s reload 2>/dev/null || true

echo ""
echo "== 验收 =="
curl -s -o /dev/null -w 'health:%{http_code}\n' http://127.0.0.1:3000/api/health
echo "✅ 发版完成"
