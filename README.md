<div align="center">

# 👗 知衣 · Closer

**以「衣橱管理」为主干的智能穿搭助手**

把四季衣服搬到线上，更好地查看、管理、盘活自己的衣服 ✨

<p>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white" />
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-%3E%3D9-F69220?logo=pnpm&logoColor=white" />
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" />
  <img alt="nestjs" src="https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white" />
  <img alt="uni-app" src="https://img.shields.io/badge/uni--app-Vue%203-42B883?logo=vue.js&logoColor=white" />
  <img alt="postgres" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" />
</p>

</div>

---

## 🗂 目录

- [🤔 这是什么](#-这是什么)
- [✨ 功能特性](#-功能特性)
- [🧰 技术栈](#-技术栈)
- [🏗 系统架构](#-系统架构)
- [📁 目录结构](#-目录结构)
- [🚀 快速开始](#-快速开始)
- [🔑 环境变量](#-环境变量)
- [🤖 AI 多渠道多模型路由](#-ai-多渠道多模型路由)
- [🔌 API 接口清单](#-api-接口清单)
- [🗃 数据模型](#-数据模型)
- [💡 核心设计要点](#-核心设计要点)
- [⚙️ 常用脚本](#️-常用脚本)
- [🆘 常见问题](#-常见问题)
- [🗺 路线图](#-路线图)
- [🤝 参与贡献](#-参与贡献)
- [📄 许可证](#-许可证)

---

## 🤔 这是什么

**知衣**是一个自用向的智能衣橱应用（微信小程序 + NestJS 后端），核心命题只有一句：

> 🧺 让「把几十件衣服拍进去」这件事足够省力，然后让这个线上衣橱真正被用起来。

产品是一棵树 🌳 ——**衣橱是主干**，今日推荐、AI 试穿、穿搭日记、衣橱看板都是让主干长茂盛的枝叶，而不是三五个并列堆砌的功能。它刻意不做社交、不做 UGC、不做穿搭社区。

完整的产品构思、信息架构与用户旅程见 📖 [`docs/PRD.md`](docs/PRD.md)。

**技术上值得一看的地方：**

- 🧬 全栈单一语言 TypeScript，`@zhiyi/shared` 作为前后端契约的**单一事实来源**（枚举 / 领域类型 / AI 输出 Schema / 响应信封）。
- 🔀 **AI 能力与模型解耦**：渠道表 + 能力路由的两层配置，加渠道只加一条配置，某能力换模型只改一行；支持 Anthropic / OpenAI 双协议、能力级超时与自动兜底切换。
- 🛡 所有 AI 输出过 Zod 校验，非法枚举归「其他」，**任何一环 AI 失败都不阻塞主链路**（录入生命线）。

---

## ✨ 功能特性

### 📸 衣物录入（生命线）

| | 能力 | 说明 |
|---|------|------|
| 🪄 | 拍照 / 相册录入 | 上传 → AI 识别名称、品类、主色、材质、厚薄、季节、正式度、风格标签 |
| 🛍 | 购物截图提取 | 直接丢 1~3 张电商截图，AI 提取商品信息并**自动裁出商品图** |
| ✂️ | 一键抠图 | 本地推理（`@imgly/background-removal-node`）产出白底主图，失败静默回退原图 |
| 📚 | 连拍批量录入 | 拍摄不等识别，后台限并发追赶，回头一次性确认；进度落本地存储，**中途退出可恢复** |
| 🩹 | 识别失败兜底 | 转 422 提示，仍可「只存图」入库，属性稍后补齐 |

### 👚 衣橱与管理

- 🔍 多维筛选衣橱（服装 / 配饰两组），一个搜索框搜关键词 / 风格 / 场合 / 状态。
- ✏️ 衣物详情、编辑（改属性 / 换主图）、软删除、标记闲置、记一次穿着。
- 🏷 用户级自定义品类：内置模板首次访问惰性播种，设置页可增删；删除分类时把在用衣物重指派到「其他」。

### 🌤 每日盘活

- **今日推荐** ☀️ — 接和风天气实时数据 → 组织进 prompt → AI 给出当日搭配与理由。落表缓存，同用户同日同时段复用，冷启动 60s → 命中 0s；新增当季衣物只打 `stale` 软标记，由用户决定何时刷新。
- **智能搭配** 🎨 — 场合 / 风格 / 季节三维度自由组合出搭配方案。
- **AI 试穿** 🪞 — 全身照只传一次、长期复用，把搭配单品叠加穿上身看效果。

### 📈 数据飞轮与洞察

- **穿搭日记** 📔 — 拍照打卡，AI 预猜当天穿了哪几件（图生 itemIds），确认后自动给关联衣物 `wearCount +1`、更新 `lastWornAt`；月历回看，附当天天气快照。
- **衣橱看板** 📊 — 衣物总数、总价值、近 30 天利用率、压箱底清单；数据不足时不出图，避免误导性图表。

---

## 🧰 技术栈

| 层 | 选型 | 关键理由 |
|----|------|----------|
| 📱 前端 | uni-app 3 + Vue 3 `<script setup>` + Pinia | 一套代码 → 小程序 + App；App 端为自有渲染引擎，比 Taro 的 RN 路径更省心 |
| 🐈 后端 | NestJS 10 | 模块化 + 依赖注入，AI/存储/鉴权各自成模块 |
| 🔷 语言 | TypeScript 5.6（全栈） | 前后端共享类型，认知负担减半 |
| 🐘 数据库 | PostgreSQL 16 | JSONB 存 AI 半结构化属性；未来 pgvector 做以图搜图 |
| 🔺 ORM | Prisma 7（driver adapter 模式） | 类型安全 + 迁移友好；运行时注入连接串 |
| ⚡ 缓存/队列 | Redis 7 | 天气缓存、限流；BullMQ 队列位已预留 |
| 🔐 鉴权 | `@nestjs/jwt` | 多端统一身份收敛在 `unionid` |
| 🤖 AI | `@anthropic-ai/sdk` + `openai` | 双协议兼容，任意 OpenAI/Anthropic 兼容网关可接 |
| ✅ 校验 | class-validator（入参）+ Zod（AI 输出） | 边界双重把关 |
| 🖼 图像 | sharp + `@imgly/background-removal-node` | 截图裁剪、缩放降本、本地抠图 |
| ☁️ 存储 | 又拍云对象存储 + CDN | 表单直传，密钥不出服务端 |
| 🌦 天气 | 和风天气 QWeather | 实时事实数据交给天气 API，判断交给 AI |
| 📦 包管理 | pnpm 9 workspace | monorepo |

---

## 🏗 系统架构

```
          📱 微信小程序 (uni-app + Vue 3)
                    │
                    │ HTTPS  统一信封 { code, message, data }
                    ▼
          🌐 Nginx 反向代理 + SSL（生产）
                    │
                    ▼
          🐈 NestJS 应用 (@zhiyi/server)
   ┌────────────────┼─────────────────────────┐
   │                │                         │
   ▼                ▼                         ▼
🐘 PostgreSQL    ⚡ Redis                 🤖 AiService
(主数据/软删除    (天气缓存 / 限流         │
 /推荐缓存)        /队列位)                │  渠道表 + 能力路由
                                          │  ├─ recognize（识别 / 截图提取）
                                          │  ├─ recommend（今日推荐 / 搭配）
                                          │  ├─ guess    （打卡预猜单品）
                                          │  └─ tryon    （AI 试穿生图）
                                          ▼
                              Anthropic / OpenAI 兼容网关
                                    （主路由 + 兜底路由）

🖼 图片链路：小程序 → 后端签发又拍云直传凭证 → 前端直传对象存储 → 回传 URL 入库
```

前后端唯一的契约面是 `@zhiyi/shared`：枚举白名单、`Garment` / `Outfit` 等领域类型、AI 输出 Zod Schema、响应信封类型，三方（后端校验 / 前端表单 / AI prompt）共用，杜绝各改各的漂移 🙅。

---

## 📁 目录结构

```
elk-closet/
├── 📱 apps/
│   ├── client/                  # uni-app 前端（微信小程序）
│   │   └── src/
│   │       ├── api/             # 接口层：request 封装 + 各资源 api
│   │       ├── components/      # base 基础组件 + garment 业务组件
│   │       ├── composables/     # 上传/识别/抠图/截图提取/批量队列/定位/toast
│   │       ├── pages/           # index 首页 · closet 衣橱 · garment 详情&编辑
│   │       │                    # board 看板 · match 搭配 · diary 日记 · settings 设置
│   │       ├── store/           # Pinia
│   │       ├── styles/          # 设计 token + 基础样式
│   │       └── config/          # API 基址等运行时配置
│   └── server/                  # NestJS 后端
│       ├── prisma/              # schema.prisma + migrations
│       └── src/
│           ├── config/          # 分层 env 加载 + Zod 启动校验 + 强类型命名空间
│           ├── prisma/          # PrismaService（driver adapter 连库）
│           ├── auth/            # JWT：dev-login / wx-login / 守卫 / @CurrentUser
│           ├── user/            # 用户建号与查询（findOrCreate 收敛多端身份）
│           ├── category/        # 用户级自定义品类（惰性播种 + 删除重指派）
│           ├── garment/         # 衣物：识别/截图提取/抠图/CRUD/穿着/闲置
│           ├── outfit/          # 穿搭日记：预猜/打卡/月历/详情
│           ├── recommend/       # 今日推荐（缓存）+ 多维搭配
│           ├── tryon/           # AI 试穿 + 全身照管理
│           ├── ai/              # AiProvider 接口 + 双协议实现 + prompt + 兜底重试
│           ├── weather/         # 和风天气接入与降级
│           ├── upload/          # 又拍云表单直传签名
│           ├── common/          # 统一响应拦截器 + 全局异常过滤器
│           └── health/          # 健康检查
├── 🧬 packages/
│   └── shared/                  # @zhiyi/shared：枚举 / 领域类型 / AI 契约 / 响应信封
├── 📖 docs/
│   ├── PRD.md                   # 产品需求文档（构思、架构、用户旅程）
│   └── demo.html                # 交互原型
├── 🐳 docker-compose.yml        # 本地依赖：postgres + redis
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 🚀 快速开始

### 📋 前置要求

- 🟢 Node.js ≥ 20
- 🟠 pnpm ≥ 9
- 🐳 Docker（起本地 PostgreSQL / Redis）
- 💬 微信开发者工具（跑小程序端）
- 🤖 一个 Anthropic 或 OpenAI 兼容的大模型网关（需支持多模态 vision）
- ☁️ 又拍云存储空间（或自行替换为其他对象存储）

### 1️⃣ 克隆与安装

```bash
git clone <your-repo-url> elk-closet
cd elk-closet
pnpm install
```

### 2️⃣ 起本地依赖

```bash
docker compose up -d
```

> 💡 宿主机端口刻意错开为 **5433（pg）/ 6380（redis）**，避开常见占用。数据卷持久化，`docker compose down -v` 才会连数据一起删。

### 3️⃣ 构建共享包 + 生成 Prisma Client

```bash
pnpm shared:build                                        # 后端/前端都依赖它的产物
pnpm --filter @zhiyi/server exec prisma generate         # 生成到 src/generated/prisma（已 gitignore）
```

### 4️⃣ 配置密钥

```bash
cd apps/server
cp .env.example .env.local
```

在 `.env.local` 里填入真实密钥（AI 网关、又拍云、JWT）。详见 [🔑 环境变量](#-环境变量)。

### 5️⃣ 迁移数据库并启动后端

```bash
pnpm --filter @zhiyi/server exec prisma migrate deploy
pnpm server:dev
```

启动成功日志：

```
知衣后端已启动（development）：http://localhost:3100/api
```

冒烟验证：

```bash
curl http://localhost:3100/api/health
```

### 6️⃣ 启动小程序端

先把 `apps/client/src/config/index.ts` 的 `API_BASE_URL` 改成你的地址：

- 🖥 微信开发者工具模拟器：`http://localhost:3100/api`
- 📱 **真机预览/调试**：必须改成本机**局域网 IP**，如 `http://192.168.x.x:3100/api`（手机访问不到 localhost）

```bash
pnpm --filter @zhiyi/client dev:mp-weixin
```

然后用微信开发者工具导入 `apps/client/dist/dev/mp-weixin` 目录。开发阶段在工具里勾选「不校验合法域名」。

🎉 首次打开点击开发登录即可拿到 JWT（`POST /api/auth/dev-login` 会建/取测试用户）。

---

## 🔑 环境变量

配置按 `NODE_ENV` 分层加载，**非敏感值入库、密钥只放 `.env.local`（永不入库）**：

| 文件 | 用途 | 是否入库 |
|------|------|----------|
| `.env` | 全环境共享默认值 | ✅ |
| `.env.development` | 开发环境（连本地容器） | ✅ |
| `.env.production` | 生产环境非敏感值 | ✅ |
| `.env.local` | 本地密钥覆盖 | 🚫 gitignore |
| `.env.example` | 模板，列全所有 key | ✅ |

加载优先级（后者不覆盖前者）：`.env.{NODE_ENV}.local` → `.env.local` → `.env.{NODE_ENV}` → `.env`。

> ⚠️ **缺任何必填项，服务启动即失败并指明缺哪一项**（`config/env.validation.ts` 用 Zod 在启动时校验），不会带着半截配置跑起来。

### 主要配置项

| 变量 | 必填 | 说明 |
|------|------|------|
| `PORT` | — | 后端端口，开发默认 `3100` |
| `API_PREFIX` | — | 统一前缀，默认 `api` |
| `DATABASE_URL` | ✅ | PostgreSQL 连接串，本地默认连 `localhost:5433` |
| `REDIS_HOST` / `REDIS_PORT` | — | 本地默认 `localhost:6380` |
| `JWT_SECRET` | ✅ | 生产务必换随机串：`openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | — | 默认 `30d` |
| `AI_CHANNEL_*` | ✅ | AI 渠道表，见下节 |
| `AI_ROUTE_*` | ✅ | AI 能力路由，见下节 |
| `AI_TIMEOUT_MS` | — | 全局单次调用超时，默认 `30000` |
| `UPYUN_BUCKET` / `UPYUN_OPERATOR` / `UPYUN_PASSWORD` | ✅ | 又拍云凭据，密码从不下发前端 |
| `UPYUN_DOMAIN` | ✅ | CDN 加速域名 |
| `UPYUN_UPLOAD_DIR` / `UPYUN_SIGN_EXPIRE` | — | 上传目录前缀、签名有效期（秒） |
| `QWEATHER_API_HOST` / `QWEATHER_API_KEY` | — | 和风天气，**全部可选**；不配则今日推荐按季节降级，不阻塞链路 |
| `QWEATHER_DEFAULT_LON` / `_LAT` | — | 定位失败时的兜底城市经纬度，默认北京 |

---

## 🤖 AI 多渠道多模型路由

这套配置的目标是：**加渠道 = 加一条配置；某能力换模型 = 改一行** 🎯，代码零改动。

### 🏪 第一层：渠道表

```dotenv
# 格式：AI_CHANNEL_<渠道名>__<字段>，字段 ∈ PROTOCOL | BASE_URL | API_KEY
# PROTOCOL ∈ anthropic（走 @anthropic-ai/sdk，/anthropic 端点）| openai（走 openai SDK，/v1 端点）
AI_CHANNEL_MIMO__PROTOCOL=anthropic
AI_CHANNEL_MIMO__BASE_URL=https://your-gateway/anthropic
AI_CHANNEL_MIMO__API_KEY=sk-xxx

AI_CHANNEL_GPT__PROTOCOL=openai
AI_CHANNEL_GPT__BASE_URL=https://your-gateway/v1
AI_CHANNEL_GPT__API_KEY=sk-xxx
```

### 🚦 第二层：能力路由

```dotenv
# 格式：AI_ROUTE_<能力>__<字段>
AI_ROUTE_RECOGNIZE__CHANNEL=mimo
AI_ROUTE_RECOGNIZE__MODEL=claude-sonnet-4-6
AI_ROUTE_RECOGNIZE__VISION=true
# 可选：主路由失败时自动切兜底再试一次（须成对配置）
AI_ROUTE_RECOGNIZE__FALLBACK_CHANNEL=gpt
AI_ROUTE_RECOGNIZE__FALLBACK_MODEL=gpt-4o
# 可选：按能力覆盖全局超时，主/兜底两条腿都生效，并关闭 SDK 内建重试（预算不被重试翻倍）
AI_ROUTE_RECOGNIZE__TIMEOUT_MS=30000
```

| 能力 | 用途 | 需要 vision |
|------|------|-------------|
| 🔍 `RECOGNIZE` | 衣物识别 + 购物截图提取 | ✅ 必须 |
| 💡 `RECOMMEND` | 今日推荐 + 多维搭配 | ❌ 纯文本 |
| 🎯 `GUESS` | 打卡照预猜穿了哪几件 | ✅ 必须 |
| 🪞 `TRYON` | AI 试穿生图 | ✅ 必须 |

需要 vision 的能力若被配成 `VISION=false`，该能力**直接走降级**而不是报错崩掉（例如识别失败 → 前端仍可只存图）。

> ⏱ **为什么要能力级超时**：全局超时往往按最慢能力（试穿生图）设定；而识别是交互敏感路径，用户在等确认页。给识别单独配紧预算（如 30s），主模型卡死时能赶在前端超时前切兜底返回结果。

---

## 🔌 API 接口清单

所有响应为统一三段式信封：`{ code, message, data }`，`code === 0` 为成功，`message` 可直接展示给用户。

带 🔒 的接口需要 `Authorization: Bearer <token>`。

### ❤️ 健康检查与鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/auth/dev-login` | 开发登录，建/取测试用户并发 token |
| `POST` | `/api/auth/wx-login` | 微信静默登录（`jscode2session`） |
| `GET` | 🔒 `/api/auth/me` | 当前用户 |

### ☁️ 上传与用户

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | 🔒 `/api/upload/upyun-sign` | 签发又拍云表单直传凭证，按用户隔离目录 |
| `POST` | 🔒 `/api/user/closet-name` | 修改衣柜名称 |

### 👕 衣物

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | 🔒 `/api/garments/recognize` | AI 识别衣物属性（不入库），返回结果或带 reason 的失败标记 |
| `POST` | 🔒 `/api/garments/extract-screenshot` | 从 1~3 张购物截图提取商品信息 + 裁出商品图 |
| `POST` | 🔒 `/api/garments/cutout` | 抠图去背景，抠不出返回 `null`（前端回退原图） |
| `POST` | 🔒 `/api/garments` | 创建衣物（支持只传图先存后补） |
| `GET` | 🔒 `/api/garments` | 衣橱列表 |
| `GET` | 🔒 `/api/garments/:id` | 衣物详情 |
| `PUT` | 🔒 `/api/garments/:id` | 部分更新（全字段可选） |
| `DELETE` | 🔒 `/api/garments/:id` | 软删除，保留穿搭记录的历史引用 |
| `POST` | 🔒 `/api/garments/:id/wear` | 记一次穿着：`wearCount +1`、`lastWornAt` 置今天 |
| `POST` | 🔒 `/api/garments/:id/archive` | 标记 / 取消闲置 |

### 🏷 分类

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | 🔒 `/api/categories` | 列出用户全部分类（首次触达自动播种内置模板） |
| `POST` | 🔒 `/api/categories` | 新建分类 |
| `GET` | 🔒 `/api/categories/:id/usage` | 该分类在用件数（删除前确认用） |
| `POST` | 🔒 `/api/categories/:id/delete` | 删除分类，在用衣物重指派到「其他」 |

### 💡 推荐与试穿

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | 🔒 `/api/recommend/today` | 今日推荐（三态：可用 / 衣物不足 / 生成失败），带缓存 |
| `POST` | 🔒 `/api/recommend/outfits` | 场合 / 风格 / 季节多维搭配（四态） |
| `POST` | 🔒 `/api/tryon/outfit` | AI 试穿（三态：`no_body` / `ok` / `failed`） |
| `POST` | 🔒 `/api/tryon/body-photo` | 保存全身照（试穿底图，只传一次复用） |
| `POST` | 🔒 `/api/tryon/body-photo/remove` | 一键删除全身照（隐私操作，幂等） |

### 📔 穿搭日记

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | 🔒 `/api/outfits/guess` | 从打卡照预猜命中的衣物 id 列表 |
| `POST` | 🔒 `/api/outfits` | 打卡（同事务更新关联衣物的穿着统计） |
| `GET` | 🔒 `/api/outfits?year=&month=` | 按月列出打卡记录 |
| `GET` | 🔒 `/api/outfits/:id` | 打卡详情 |

> 📌 部分动作型接口（如删除全身照、删除分类）刻意用 `POST` 而非 `DELETE`——小程序端对非常规方法的支持与拦截器行为不够一致。

---

## 🗃 数据模型

```
User ──┬── Garment ──┬── OutfitItem ── Outfit
       │             │
       ├── Category  └── (wearCount / lastWornAt 由打卡回写)
       └── Recommendation（今日推荐缓存）
```

| 表 | 职责 | 关键设计 |
|----|------|----------|
| 🙋 `users` | 多端统一身份 | `unionid` 关联同一人的小程序 + App；`bodyPhotoUrl` 存试穿底图 |
| 🏷 `categories` | 用户级品类白名单 | 首次触达惰性播种内置模板，老用户无需回填 migration；「其他」禁删 |
| 👕 `garments` | 衣物核心实体 | 核心属性结构化落列（供筛选/推荐）+ `styleTags`/`extra` 落 JSONB（存 AI 额外发现，不频繁改表）；`deletedAt` 软删除 |
| 📔 `outfits` | 一次打卡 | `wornOn` 与 `createdAt` 分离，允许补记过去某天；`weather` 存当天天气快照 |
| 🔗 `outfit_items` | 穿搭-衣物关联 | 独立成表而非隐式多对多，便于挂元信息 + 按衣物反查所在搭配 |
| 💡 `recommendations` | 今日推荐缓存 | `(ownerId, date, timeslot)` 唯一；`stale` 软标记新增衣物；`outfits` 存完整视图，前端无需回查 |

完整字段与设计注释见 [`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma)。

---

## 💡 核心设计要点

🔀 **AI 契约模型无关。** `AiProvider` 接口 + Anthropic/OpenAI 双实现，换模型只改环境变量。所有 AI 输出过 `@zhiyi/shared` 的 Zod 校验，非法枚举一律归「其他」，失败自动重试或切兜底渠道。

🫀 **录入生命线不可断。** 管理型产品的生死在于用户能否熬过「把几十件衣服拍进去」。因此：识别失败 → 仍可只存图；抠图失败 → 静默回退原图；批量队列 → 每次状态变更即落本地存储，中途退出可恢复；识别与抠图并行发起，互不阻塞（一个读属性、一个处图，两件正交的事）。

🔐 **密钥不出服务端。** 图片走又拍云表单直传，后端只计算 policy + 签名，operator 密码从不下发前端；保存路径按 `<uploadDir>/<userId>/<uuid>` 隔离，前端无法越权覆盖他人文件。

🗑 **软删除。** 衣物删除只标记 `deletedAt`，保留穿搭记录对单品的历史引用，查询层统一过滤——避免「删了一件衣服，三个月前的日记裂开」。

⏳ **推荐缓存两层失效。** AI 生成一次约 60s，冷启动重复付这个代价不合理。落表缓存按「用户 + 日期 + 时段」唯一；**硬失效**是逐个校验用到的单品仍在库未闲置，**软过期**是新增当季衣物只置 `stale`、由用户点提示条决定何时重算——不替用户做「花 60s 重算」的决定。

🌦 **天气与 AI 分工。** 天气是实时确定性数据，必须接专业 API（大模型会幻觉编造）：天气 API 负责「事实」，AI 负责「拿到事实后判断穿什么」。天气取不到时推荐降级为不依赖天气的通用推荐，不开天窗。

📬 **统一信封 + 全局异常。** 成功与失败都是 `{ code, message, data }`，前端只判断 `code`，`message` 直接可展示。

---

## ⚙️ 常用脚本

在**仓库根**执行：

```bash
pnpm server:dev       # 🚀 启动后端（热重载）
pnpm server:build     # 📦 构建后端
pnpm shared:build     # 🧬 构建共享包（改了 shared 必须重新构建）
pnpm typecheck        # ✅ 全仓类型检查
```

子包命令：

```bash
# 🐈 后端
pnpm --filter @zhiyi/server start:prod                    # 生产启动
pnpm --filter @zhiyi/server lint                          # ESLint --fix
pnpm --filter @zhiyi/server exec prisma migrate dev       # 新建迁移
pnpm --filter @zhiyi/server exec prisma studio            # 可视化查库

# 📱 前端
pnpm --filter @zhiyi/client dev:mp-weixin                 # 小程序开发
pnpm --filter @zhiyi/client build:mp-weixin               # 小程序构建
pnpm --filter @zhiyi/client dev:h5                        # H5 开发
pnpm --filter @zhiyi/client typecheck                     # vue-tsc
```

---

## 🆘 常见问题

<details>
<summary>🧬 <b>改了 <code>@zhiyi/shared</code>，后端/前端却引用不到新类型</b></summary>

<br>

`shared` 是编译产物依赖（`main` 指向 `dist`）。改完必须重新构建：

```bash
pnpm shared:build
# 或开发时常驻监听
pnpm --filter @zhiyi/shared dev
```
</details>

<details>
<summary>🔺 <b>Prisma 相关：为什么从 <code>src/generated/prisma</code> 导入而不是 <code>@prisma/client</code></b></summary>

<br>

本项目用 Prisma 7 主推的新版 `prisma-client` generator（`moduleFormat = "cjs"`，产物落在 `src/generated/prisma`）。经典的 `prisma-client-js` 在 Prisma 7 + pnpm 下生成不完整。

同时 Prisma 7 强制 driver adapter 模式：连接串不写在 schema 里，迁移走 `prisma.config.ts`，运行时由 `PrismaService` 注入。

生成产物已 gitignore，clone 后需执行 `prisma generate`。
</details>

<details>
<summary>🟠 <b>pnpm install 后 uni-app 编译报找不到包</b></summary>

<br>

根 `.npmrc` 已设 `shamefully-hoist=true`（uni-app 官方模板推荐）与 `verify-deps-before-run=false`。若手动改过这两项或换了包管理器，会出现依赖解析失败。

另外 `sharp` / `onnxruntime-node` / `prisma` 等需要原生二进制的包已在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 白名单里，删掉会导致抠图与数据库不可用。
</details>

<details>
<summary>📱 <b>真机预览请求全部失败</b></summary>

<br>

逐项核对：

1. `apps/client/src/config/index.ts` 的 `API_BASE_URL` 是否为本机**局域网 IP**（不是 `localhost`）；
2. 换网络后 IP 是否变了；
3. 后端是否跑的是最新代码、手机与电脑是否同一网段；
4. 微信开发者工具是否勾选「不校验合法域名」。
</details>

<details>
<summary>🤖 <b>没有 AI 网关 / 天气 Key 能跑起来吗</b></summary>

<br>

天气 🌦 **完全可选**，不配则今日推荐按季节降级。

AI 🤖 是必填项——识别、推荐、试穿都依赖它；只要是 Anthropic 或 OpenAI 协议兼容的网关都能接，在 `AI_CHANNEL_*` 里填 `BASE_URL` 与 `API_KEY` 即可。识别/预猜/试穿需要模型支持 vision。
</details>

---

## 🗺 路线图

**🎉 已完成（MVP 全量）**

- ✅ **P0** — 衣物录入（AI 识别 / 截图提取 / 抠图 / 批量队列）、衣橱浏览与筛选、衣物详情与编辑、今日推荐（含缓存）
- ✅ **P1** — 穿搭日记（打卡 + 月历 + AI 预猜）、搜索、衣橱看板
- ✅ **P2** — AI 试穿、多维度智能搭配、用户级自定义品类

**🚧 规划中**

- ⏳ 微信静默登录接真实 `appid` / `secret` 完成线上闭环
- ⏳ BullMQ 异步队列接管试穿生图（当前同步，耗时较长）
- ⏳ pgvector 以图搜图 / 找相似单品
- ⏳ 敏感图（全身照 / 试穿图）改私有读 + 签名 URL
- ⏳ GitHub Actions CI/CD
- ⏳ App 端打包（uni-app 一套代码复用）

---

## 🤝 参与贡献

欢迎 Issue 与 PR 🙌 提交前请确保 `pnpm typecheck` 通过。

### 📝 提交信息规范

```
<type> : 【模块】<描述>
```

示例：

```
feat: 【衣物】新增编辑页支持改属性/换主图/删除
fix: 【录入】识别配独立 30s 超时，主模型卡死快速切兜底
perf: 【录入】识别喂图先缩到长边 1024
```

常用 `type`：`feat` / `fix` / `refactor` / `style` / `perf` / `docs` / `test` / `chore`。

> ✂️ **提交粒度**：按模块拆分，一次改动涉及多个模块时拆成多个提交，保证历史清晰、易 review 与回滚。

### 🧹 代码约定

- 💬 注释用 JSDoc，解释「为什么这么做」而非复述代码；代码变更时同步更新注释，不留过时注释。
- 🟩 Vue 一律用 Composition API + `<script setup>` + TypeScript。
- 🧬 新增/修改 AI 输出结构时，先改 `@zhiyi/shared` 的 Zod Schema——它是契约的单一事实来源。

---

## 📄 许可证

[MIT](LICENSE) © elk

---

<div align="center">

<sub>👗 「知衣」——懂你的衣服，也懂你。谐音「知己」。</sub>

</div>
