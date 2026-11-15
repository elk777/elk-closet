#!/bin/bash
#
# 在服务器上初始化 PostgreSQL 账号与数据库（可重复执行，已存在则跳过）。
#
# 为什么要脚本：PostgreSQL 镜像只在「数据目录为空」的首启动时按 POSTGRES_USER/DB 建库，
# 面板安装常留空或用默认 postgres，导致容器跑起来但业务库/业务账号根本不存在，
# 表现为迁移报 P1000（账号密码不对）或 P1003（库不存在），很难一眼看出根因。
#
# 用法：
#   PGCT=<postgres容器名> PGPASS=<新密码> bash scripts/db-init.sh
#
# 容器名用这条查：docker ps --format '{{.Names}}' | grep -i postgres

set -euo pipefail

: "${PGCT:?请设置 PGCT=<postgres 容器名>}"
: "${PGPASS:?请设置 PGPASS=<数据库密码>}"

echo "目标容器：$PGCT"

# 密码只允许字母数字：连接串是标准 URL，密码里的 @ : / ? # 会让解析错位，
# 表现成「密码看着没错但一直认证失败」，极难排查。
if ! [[ "$PGPASS" =~ ^[A-Za-z0-9]+$ ]]; then
  echo "❌ 密码只能是字母和数字（当前含特殊字符，会导致 DATABASE_URL 解析错位）"
  exit 1
fi

echo "== 1/4 建账号（已存在则改密码）=="
docker exec -i "$PGCT" psql -U postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zhiyi') THEN
    CREATE ROLE zhiyi WITH LOGIN PASSWORD '$PGPASS';
  ELSE
    ALTER ROLE zhiyi WITH LOGIN PASSWORD '$PGPASS';
  END IF;
END
\$\$;
SQL

echo "== 2/4 建数据库（已存在则跳过）=="
# CREATE DATABASE 不能放在 DO 块里，只能先查再执行
EXIST=$(docker exec -i "$PGCT" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='zhiyi'")
if [ "$EXIST" != "1" ]; then
  docker exec -i "$PGCT" psql -U postgres -c "CREATE DATABASE zhiyi OWNER zhiyi;"
else
  docker exec -i "$PGCT" psql -U postgres -c "ALTER DATABASE zhiyi OWNER TO zhiyi;" >/dev/null
  echo "数据库已存在，已确保所有者为 zhiyi"
fi

echo "== 3/4 授权 public schema =="
# PostgreSQL 15+ 收紧了 public schema 的默认建表权限，漏这步迁移会报
# permission denied for schema public —— 而建库本身是成功的，极易误判
docker exec -i "$PGCT" psql -U postgres -d zhiyi -v ON_ERROR_STOP=1 <<'SQL'
GRANT ALL ON SCHEMA public TO zhiyi;
ALTER SCHEMA public OWNER TO zhiyi;
SQL

echo "== 4/4 验证登录与权限 =="
docker exec -e PGPASSWORD="$PGPASS" -i "$PGCT" psql -h 127.0.0.1 -U zhiyi -d zhiyi -tAc \
  "SELECT current_user, current_database(), has_schema_privilege('zhiyi','public','CREATE');"

echo ""
echo "✅ 数据库就绪。上面应显示：zhiyi | zhiyi | t"
echo ""
echo "把这段写进 apps/server/.env.production.local（端口换成 docker port 查到的宿主机端口）："
echo "DATABASE_URL=postgresql://zhiyi:$PGPASS@127.0.0.1:35432/zhiyi?schema=public"
