#!/bin/bash
#
# 服务器一键安装 + 构建。
#
# 为什么做成脚本：装依赖和构建是固定顺序的四步（shared → prisma → server → client），
# 手敲容易漏步、也容易在某个目录下执行错。顺序错了的典型表现是「编译报找不到 @zhiyi/shared」
# 或「找不到 generated/prisma」——排查成本远高于直接跑脚本。
#
# 用法（在仓库任意位置执行均可）：
#   bash scripts/server-setup.sh
#
# 只做构建，不碰数据库、不重启服务；迁移和 PM2 由发版脚本负责。

set -euo pipefail

# 切到仓库根，保证相对路径正确
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "仓库根目录：$ROOT"

# 国内镜像：registry 走 npmmirror；sharp 的 libvips 二进制只能从 GitHub 下，
# 国内服务器会超时，必须单独指向镜像
export npm_config_registry="${npm_config_registry:-https://registry.npmmirror.com}"
export npm_config_sharp_libvips_binary_host="${npm_config_sharp_libvips_binary_host:-https://registry.npmmirror.com/-/binary/sharp-libvips}"

echo ""
echo "== 1/5 安装依赖 =="
pnpm install --frozen-lockfile

echo ""
echo "== 2/5 构建共享包 =="
pnpm --filter @zhiyi/shared build

echo ""
echo "== 3/5 生成 Prisma Client =="
# NODE_ENV=production 让 prisma.config.ts 去加载 .env.production.local
NODE_ENV=production pnpm --filter @zhiyi/server exec prisma generate

echo ""
echo "== 4/5 构建后端 =="
pnpm --filter @zhiyi/server build

echo ""
echo "== 5/5 构建 H5 =="
pnpm --filter @zhiyi/client build:h5

echo ""
echo "== 检查产物 =="
fail=0
[ -f "$ROOT/apps/server/dist/main.js" ] || { echo "❌ 缺 apps/server/dist/main.js"; fail=1; }
[ -f "$ROOT/apps/client/dist/build/h5/index.html" ] || { echo "❌ 缺 H5 index.html"; fail=1; }
# Prisma 引擎检查。
# 注意 pnpm 的目录名带 peer 依赖哈希后缀（prisma@7.8.0_@types+react@...），
# 写死 prisma@7.8.0 会永远匹配不到，误报「引擎不存在」。
# 另外 Prisma 7 用 prisma-client generator + driver adapter，查询走 WASM，
# 不再有 query-engine 二进制；真正需要的是迁移用的 schema-engine。
if ! ls -d "$ROOT"/node_modules/.pnpm/prisma@*/node_modules/prisma/build >/dev/null 2>&1; then
  echo "⚠️  找不到 prisma/build 目录，prisma generate 可能未成功"
elif ! ls "$ROOT"/node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/schema-engine-* >/dev/null 2>&1; then
  echo "⚠️  找不到 schema-engine，迁移会失败（重跑 pnpm install 或 pnpm rebuild @prisma/engines）"
elif [ ! -f "$ROOT/apps/server/src/generated/prisma/client.ts" ]; then
  echo "⚠️  未生成 Prisma Client（缺 apps/server/src/generated/prisma/client.ts）"
else
  echo "✅ Prisma 引擎与 Client 就绪"
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "构建产物缺失，请检查上面的报错。"
  exit 1
fi

echo "✅ 构建完成"
echo "   后端：$ROOT/apps/server/dist/main.js"
echo "   H5  ：$ROOT/apps/client/dist/build/h5/"
