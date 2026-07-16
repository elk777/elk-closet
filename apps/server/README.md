# apps/server — 知衣后端（NestJS）

> 衣物录入生命线的后端：多环境配置、JWT 鉴权、又拍云直传签名、双协议 AI 识别、衣物入库。
> 全栈 TypeScript，前后端共享 `@zhiyi/shared` 的枚举 / 领域类型 / AI 契约 / 响应信封。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | NestJS 10 |
| ORM | Prisma 7（driver adapter 模式，运行时注入连接串） |
| 数据库 | PostgreSQL 16 |
| 缓存/队列 | Redis 7（本版仅起容器备用，队列待试穿模块接入） |
| 鉴权 | `@nestjs/jwt` |
| AI | `@anthropic-ai/sdk` + `openai`，按 `AI_PROVIDER` 切换 |
| 校验 | 入参 class-validator；AI 输出 Zod（`@zhiyi/shared`） |

---

## 目录结构

```
src/
├── config/            # 多环境配置：分层 env 加载 + Zod 启动校验 + 强类型命名空间
├── prisma/            # PrismaService（driver adapter 连库）+ 生成 client 的再导出
├── auth/              # JWT 鉴权：dev-login / wx-login 留桩 / JwtAuthGuard / @CurrentUser
├── user/              # 用户建号与查询（findOrCreate 收敛多端身份）
├── ai/                # AiProvider 接口 + Anthropic/OpenAI 双实现 + 重试
├── upload/            # 又拍云表单直传签名（密钥不出服务端）
├── garment/           # 录入核心：recognize / create / list / detail
├── common/            # 统一响应拦截器 + 全局异常过滤器（三段式信封）
├── health/            # 健康检查
└── generated/prisma/  # Prisma 生成产物（gitignore，勿手改）
```

---

## 快速开始

### 1. 起本地依赖（postgres + redis）

在**仓库根**执行（compose 文件在根目录）：

```bash
docker compose up -d
```

> 宿主机端口错开为 **5433（pg）/ 6380（redis）**，避开常见的 5432/6379 占用。
> 数据卷持久化，`docker compose down` 停容器，加 `-v` 连数据一起删。

### 2. 装依赖 + 生成 Prisma client

在仓库根执行：

```bash
pnpm install
pnpm --filter @zhiyi/shared build          # 共享包先构建，后端才能引用
pnpm --filter @zhiyi/server exec prisma generate
```

### 3. 配置密钥

配置按 `NODE_ENV` 分层加载，**非敏感值入库、密钥只放 `.env.local`（不入库）**：

| 文件 | 用途 | 入库 |
|------|------|------|
| `.env` | 全环境共享默认值 | ✅ |
| `.env.development` | 开发环境（连本地容器） | ✅ |
| `.env.production` | 生产环境（连线上资源）非敏感值 | ✅ |
| `.env.local` | 本地密钥覆盖 | ❌ gitignore |
| `.env.example` | 模板，列全所有 key | ✅ |

加载优先级（后者不覆盖前者）：`.env.{NODE_ENV}.local` → `.env.local` → `.env.{NODE_ENV}` → `.env`。

复制模板填入真实密钥：

```bash
cp .env.example .env.local
```

`.env.local` 里至少要填（其余用默认值即可跑）：

```dotenv
# AI（二选一，按 AI_PROVIDER 决定用哪套）
AI_PROVIDER=anthropic
AI_ANTHROPIC_BASE_URL=https://你的网关/anthropic
AI_ANTHROPIC_API_KEY=真实key
# 或 OpenAI 兼容：
# AI_PROVIDER=openai
# AI_OPENAI_BASE_URL=https://你的网关/v1
# AI_OPENAI_API_KEY=真实key

# 又拍云
UPYUN_BUCKET=你的bucket
UPYUN_OPERATOR=你的操作员
UPYUN_PASSWORD=操作员密码
UPYUN_DOMAIN=https://你的加速域名

# JWT（生产务必换随机串：openssl rand -base64 48）
JWT_SECRET=换成随机串
```

> **切换环境零改代码**：`NODE_ENV=production pnpm start:prod` 即整套连生产资源，
> 差异全部收敛在 env 文件里（十二要素应用）。缺任何必填项启动即失败并指明缺哪个。

### 4. 迁移 + 启动

```bash
pnpm --filter @zhiyi/server exec prisma migrate deploy   # 应用已有迁移
pnpm --filter @zhiyi/server start:dev                    # 开发（热重载）
```

启动成功日志：`知衣后端已启动（development）：http://localhost:3000/api`

---

## 录入主链路（前端对接流程）

```
①  POST /api/auth/dev-login                → 拿 JWT（微信端换 wx-login）
②  POST /api/upload/upyun-sign  {ext}       → 拿又拍云直传凭证 + imageUrl
③  前端表单直传又拍云（用②的 policy+authorization）
④  POST /api/garments/recognize {imageUrl}  → AI 识别属性（预填确认页；失败可跳过）
⑤  POST /api/garments {属性...}             → 确认后入库（或只传 imageUrl 先存图后补）
⑥  GET  /api/garments                       → 衣橱列表
⑦  GET  /api/garments/:id                   → 衣物详情
```

所有响应为统一信封：`{ code, message, data }`，`code === 0` 为成功。

---

## 接口清单

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/health` | — | 健康检查 |
| POST | `/api/auth/dev-login` | — | 开发登录，建/取测试用户发 token |
| POST | `/api/auth/wx-login` | — | 微信静默登录（留桩，待前端联调） |
| GET | `/api/auth/me` | ✅ | 当前用户 |
| POST | `/api/upload/upyun-sign` | ✅ | 又拍云直传凭证（按用户隔离目录） |
| POST | `/api/garments/recognize` | ✅ | AI 识别（不入库） |
| POST | `/api/garments` | ✅ | 创建衣物（支持先存图后补） |
| GET | `/api/garments` | ✅ | 衣橱列表 |
| GET | `/api/garments/:id` | ✅ | 衣物详情 |

---

## curl 冒烟验证

```bash
BASE=http://localhost:3000/api

# 1. 登录拿 token
TOKEN=$(curl -s -X POST $BASE/auth/dev-login | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')

# 2. 签发直传凭证
curl -s -X POST $BASE/upload/upyun-sign \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"ext":"jpg"}'

# 3. 识别（需已配 AI 密钥 + 真实可访问的图 URL）
curl -s -X POST $BASE/garments/recognize \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"imageUrl":"https://你的域名/some.jpg"}'

# 4. 先存图后补：只传图创建
curl -s -X POST $BASE/garments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"originalImageUrl":"https://你的域名/some.jpg"}'

# 5. 列表
curl -s $BASE/garments -H "Authorization: Bearer $TOKEN"
```

---

## 设计要点

- **AI 契约模型无关**（PRD 5.5）：`AiProvider` 接口 + 双协议实现，换模型只改 `AI_PROVIDER`。
  所有 AI 输出过 `@zhiyi/shared` 的 Zod 校验，非法枚举归「其他」，识别失败自动重试 1 次。
- **录入不可断**（PRD 5.6）：AI 识别失败转 422 提示，前端仍可「只存图」创建，兜底属性补齐。
- **密钥不出服务端**：又拍云走表单直传，后端只算 policy + 签名，operator 密码从不下发；
  保存路径按 `<uploadDir>/<userId>/<uuid>` 隔离，前端无法越权覆盖他人文件。
- **软删除**（PRD 5.6.2）：衣物删除标记 `deletedAt`，保留穿搭记录对单品的历史引用，查询统一过滤。
- **统一信封**：成功/失败都是 `{code, message, data}`，`message` 可直接展示给用户。

---

## 本版范围与后续

**已完成**：多环境配置、鉴权骨架、又拍云签名、双协议 AI 识别、衣物录入 CRUD、统一异常。

**刻意留后**（非遗漏）：
- **抠图去背景**：本版原图入库、`cutoutImageUrl` 置空（PRD 5.6.1 允许原图兜底），后续接又拍云图片处理或 AI 抠图。
- **微信静默登录**：`wx-login` 已留桩，待前端小程序联调时补 `jscode2session`（需真实 appid/secret）。
- **异步队列（BullMQ）**：识别走同步（几秒够快），队列留给试穿模块（几十秒必须异步）。
- **AI 识别真机验证**：需填真实 AI 密钥 + 可公开访问的图 URL 后跑通 `/garments/recognize`。
```
