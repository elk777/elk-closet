#!/bin/bash
#
# 拉取代码：直连 GitHub 失败时自动切换到可用镜像。
#
# 为什么需要这个：腾讯云/阿里云的国内节点访问 github.com 经常超时或
# 「Failure when receiving data from the peer」，而 GitHub 的 codeload 与
# 第三方反代走的是不同 CDN，往往能通。手工试镜像很费时，封装成脚本一次试完。
#
# 用法：
#   bash scripts/pull-code.sh              # 更新已有仓库
#   bash scripts/pull-code.sh --clone      # 从零克隆到当前目录下的 elk-closet

set -uo pipefail

# macOS 没有 GNU timeout；服务器（OpenCloudOS/Debian）有。
# 这里包一层：没有就用后台进程 + 等待兜底，保证脚本在两端行为一致。
if command -v timeout >/dev/null 2>&1; then
  run_timeout() { timeout "$@"; }
else
  run_timeout() {
    local secs="$1"; shift
    "$@" & local pid=$!
    ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null ) & local watcher=$!
    local rc=0
    wait "$pid" 2>/dev/null || rc=$?
    kill -TERM "$watcher" 2>/dev/null
    return $rc
  }
fi

REPO="elk777/elk-closet"
BRANCH="${BRANCH:-feat/h5}"

# 依次尝试的 git 地址。直连排第一，失败再走镜像。
MIRRORS=(
  "https://github.com/$REPO.git"
  "https://ghfast.top/https://github.com/$REPO.git"
  "https://gh-proxy.com/https://github.com/$REPO.git"
  "https://ghproxy.net/https://github.com/$REPO.git"
)

# 判断某个地址能不能正常握手（git 的 refs 探测，不下载数据）。
# 必须带超时：直连 github.com 在国内常见「连上但不返回」，不加超时会永远挂住。
probe() {
  run_timeout 15 git ls-remote --heads "$1" "$BRANCH" >/dev/null 2>&1
}

# git 自身的网络超时，避免单次连接卡死（单位秒）
export GIT_HTTP_LOW_SPEED_LIMIT=1000
export GIT_HTTP_LOW_SPEED_TIME=20

if [ "${1:-}" = "--clone" ]; then
  echo "== 克隆 $REPO ($BRANCH) =="
  for url in "${MIRRORS[@]}"; do
    echo -n "尝试 $url ... "
    if probe "$url"; then
      echo "可用"
      run_timeout 300 git clone --depth 1 --branch "$BRANCH" "$url" elk-closet || {
        echo "克隆失败，换下一个源"
        rm -rf elk-closet
        continue
      }
      echo ""
      echo "✅ 克隆完成：$(pwd)/elk-closet"
      cd elk-closet
      git remote set-url origin "https://github.com/$REPO.git"
      echo "   origin 已改为官方地址（直连不行时用脚本自动换镜像）"
      exit 0
    else
      echo "不可用"
    fi
  done
  echo ""
  echo "❌ 所有源都失败。请检查服务器网络，或在本地打包上传："
  echo "   tar czf elk-closet.tar.gz --exclude=node_modules --exclude=dist elk-closet"
  exit 1
fi

# ---- 更新已有仓库 ----
cd "$(dirname "$0")/.."
echo "仓库：$(pwd)"

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  有未提交的本地改动，先处理再拉取："
  git status --short
  exit 1
fi

echo "== 拉取 $BRANCH =="
if run_timeout 30 git fetch origin "$BRANCH" 2>/dev/null; then
  git checkout "$BRANCH" 2>/dev/null || true
  git merge --ff-only "origin/$BRANCH"
  echo "✅ 已更新到 $(git log --oneline -1)"
  exit 0
fi

echo "直连失败，尝试镜像..."
for url in "${MIRRORS[@]:1}"; do
  echo -n "  尝试 $url ... "
  if probe "$url"; then
    echo "可用"
    run_timeout 120 git fetch "$url" "$BRANCH:refs/remotes/mirror/$BRANCH" && {
      git checkout "$BRANCH" 2>/dev/null || true
      git merge --ff-only "refs/remotes/mirror/$BRANCH"
      echo "✅ 已通过镜像更新到 $(git log --oneline -1)"
      exit 0
    }
  else
    echo "不可用"
  fi
done

echo "❌ 所有源都失败"
exit 1
