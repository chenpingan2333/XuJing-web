# 叙境 (Xujing) — 项目全貌文档：供 GPT 审核提示词与代码

> **生成日期**: 2026-06-09  
> **目标读者**: 用于传递给另一个 GPT/Claude 实例进行提示词审核、代码审查和架构评审  
> **覆盖范围**: 产品定义、架构设计、全部源文件、设计文档、当前完成度、待办清单

---

## 第一部分：产品定义与核心约束

### 1.1 产品定位

| 维度 | 内容 |
|------|------|
| **产品名称** | 叙境 (Xujing) |
| **定位** | AI 恋爱陪伴平台 |
| **目标用户** | 18 岁以上成年用户 |
| **核心卖点** | 鲜活角色、长期记忆、自然关系发展、网络文化适配、成年人情感陪伴 |
| **部署环境** | Vercel Serverless + Neon PostgreSQL + Upstash Redis |
| **生产域名** | xujing.modelbridge.top |

### 1.2 用户体系

| 维度 | FREE 用户 | VIP 用户 |
|------|----------|---------|
| **角色配额** | 12 个 | 无限 |
| **记忆容量** | 100 条/角色 | 10000 条/角色 |
| **API 连接** | 仅限自备 API Key | 可使用自带 API Key 或平台专属模型 |
| **星钻系统** | 送 100 星钻 | 月卡/季卡/年卡，首月优惠 990 星钻 |

### 1.3 MVP 包含（Must Have）
- 邮箱 + 图形验证码 + 邮箱验证码 + 密码注册/登录（Resend 发邮件，bcrypt 12 轮哈希）
- 用户协议弹窗（同意后方可进入登录页）
- 角色创建（必填：名字/设定/开场白；可选：图片/高级定义/扩展字段/系统指令）
- JSON 角色卡导入（叙境/Tavern/SillyTavern 三格式）
- 角色管理（编辑/导出/复制/删除）
- 5 个内建平台 + 3 种自定义兼容协议的 API 连接
- API Key AES-256 加密存储
- 微信风格聊天界面 + SSE 流式回复
- AI 消息操作（重新生成/再回一句/AI帮我回复）
- 记忆系统（关键词检索 + 重要性权重 eviction）
- 星钻充值（6 档：4.9~199.9 元，上传截图 → 后台审核）
- VIP 会员购买
- 底部固定 4 项导航（角色/聊天/商店/我的），禁止首页

### 1.4 MVP 明确不包含（Will NOT Have）
| 排除项 |
|--------|
| 数值化系统（好感度/亲密度/爱情值/关系等级） |
| 世界系统、剧情系统、任务系统、签到系统、排行榜 |
| 角色广场（严格不开发，不做数据库设计） |
| 多角色群聊 |
| 首页（登录后直接进入角色页面） |
| Agent 系统、邀请码系统 |

---

## 第二部分：技术栈

| 层级 | 技术 | 备注 |
|------|------|------|
| **前端框架** | Next.js 15 + React 19（App Router） | |
| **样式** | Tailwind CSS 4 | |
| **语言** | TypeScript 5.7 | |
| **数据库** | PostgreSQL 16 + Drizzle ORM 0.45.2 | **于 6/9 从 0.39 升级** |
| **迁移工具** | drizzle-kit 0.31.10 | **于 6/9 从 0.30 升级** |
| **数据库驱动** | @neondatabase/serverless 1.1.0 | |
| **缓存/Session** | Redis 7 (ioredis) | |
| **Auth** | JWT（15min access + 7天 refresh）+ JTI 黑名单 + Refresh Rotation + bcrypt 密码 | |
| **加密** | AES-256-CBC（API Key 加密存储） | |
| **邮件** | Resend（验证码发送） | |
| **AI Provider** | OpenAI / Anthropic / Gemini / DeepSeek / Grok + 3 自定义兼容协议 | |
| **部署** | Vercel（自动迁移 + 自动部署） | CI/CD: `drizzle-kit migrate && next build` |
| **包管理** | pnpm | |

---

## 第三部分：完整源文件清单

### 3.1 根目录配置（12 文件）

| 文件 | 用途 |
|------|------|
| `package.json` | 依赖和脚本（build 含自动迁移） |
| `pnpm-workspace.yaml` / `pnpm-lock.yaml` | pnpm 配置 |
| `tsconfig.json` | TypeScript 配置 |
| `next.config.ts` | Next.js 配置 |
| `postcss.config.mjs` | PostCSS 配置 |
| `drizzle.config.ts` | Drizzle Kit 配置（dialect: postgresql） |
| `docker-compose.yml` | 本地 Docker 服务编排 |
| `.env` | 本地开发环境变量 |
| `.env.example` | 环境变量模板 |
| `playwright.config.ts` | E2E 测试配置 |
| `.gitignore` | Git 忽略规则（drizzle/ 未被忽略） |

### 3.2 数据库层 (`src/db/`) — 16 文件

| 文件 | 用途 |
|------|------|
| `src/db/index.ts` | Drizzle 客户端初始化：`drizzle({ client: neon(url), schema })` |
| `src/db/enums.ts` | 枚举定义（role, status, platform 等） |
| `src/db/helpers.ts` | 辅助函数（timestamps, uuidv7 等） |
| `src/db/indexes.ts` | 索引定义 |
| `src/db/relations.ts` | 表关系定义 |
| `src/db/schema/index.ts` | Schema 统一导出 |
| `src/db/schema/users.ts` | users 表（email, passwordHash, role, status, vipExpiresAt, starDiamonds 等） |
| `src/db/schema/characters.ts` | characters 表（12 字段 + 软删除） |
| `src/db/schema/messages.ts` | messages 表（user_id, character_id, role, content） |
| `src/db/schema/memories.ts` | memories 表（user_id, character_id, content, keywords, importance） |
| `src/db/schema/conversations.ts` | conversations 表（Phase 9 新增） |
| `src/db/schema/api-configs.ts` | api_configs 表（加密 API Key） |
| `src/db/schema/orders.ts` | orders 表（充值订单 + 截图审核） |
| `src/db/schema/vip-records.ts` | vip_records 表（VIP 开通记录） |
| `src/db/schema/star-diamond-transactions.ts` | 星钻交易流水表 |
| `src/db/schema/admin-logs.ts` | 管理员操作日志表 |

### 3.3 服务端业务层 (`src/server/`) — 28 文件

#### Auth 模块 (`src/server/auth/`) — 4 文件
| 文件 | 用途 |
|------|------|
| `src/server/auth/jwt.ts` | JWT 签发和验证（access 15min + refresh 7天） |
| `src/server/auth/redis-session.ts` | Redis Session 管理（refresh token, JTI blacklist, 验证码, captcha, rate limit） |
| `src/server/auth/guard.ts` | Auth Guard（从 header 提取用户上下文） |
| `src/server/auth/context.ts` | Auth 上下文类型定义 |

#### 数据仓库层 (`src/server/repositories/`) — 9 文件
| 文件 | 用途 |
|------|------|
| `src/server/repositories/user.repository.ts` | 用户 CRUD + 查询（已全部迁至 db.select） |
| `src/server/repositories/character.repository.ts` | 角色 CRUD + 软删除 + 查询 |
| `src/server/repositories/message.repository.ts` | 消息存取 + 历史查询（**C1 Bug：findHistory 缺 userId**） |
| `src/server/repositories/memory.repository.ts` | 记忆存取 + 容量管理 |
| `src/server/repositories/api-config.repository.ts` | API 配置存取 |
| `src/server/repositories/order.repository.ts` | 订单存取 + 审核流程 |
| `src/server/repositories/vip.repository.ts` | VIP 记录存取 |
| `src/server/repositories/star-diamond-transaction.repository.ts` | 星钻交易存取 |
| `src/server/repositories/admin-log.repository.ts` | 管理日志存取 |

#### 业务服务层 (`src/server/services/`) — 13 文件
| 文件 | 用途 |
|------|------|
| `src/server/services/auth.service.ts` | 登录/注册/刷新/登出（密码 bcrypt + captcha 自绘 SVG） |
| `src/server/services/character.service.ts` | 角色 CRUD + 配额检查 + 权限控制 + 导入/导出 |
| `src/server/services/chat.service.ts` | 聊天核心：消息发送、Prompt 组装、记忆注入、重新生成 |
| `src/server/services/memory.service.ts` | 记忆管理（**C3 Bug：Regex 提取**） |
| `src/server/services/memory-engine.ts` | 记忆引擎（Phase 9 新增） |
| `src/server/services/api-config.service.ts` | API 配置 CRUD + 测试连接 |
| `src/server/services/provider-gateway.ts` | AI Provider 统一网关：路由、解密、流式调用 |
| `src/server/services/payment.service.ts` | 支付业务逻辑 |
| `src/server/services/vip.service.ts` | VIP 会员管理 |
| `src/server/services/crypto.ts` | AES-256-CBC 加解密 |
| `src/server/services/database-health.ts` | 数据库健康检查 |
| `src/server/services/infra-health.ts` | 基础设施健康检查 |
| `src/server/redis/client.ts` | Redis 客户端连接管理 |

#### 运行时 (`src/server/runtime/`) — 1 文件
| 文件 | 用途 |
|------|------|
| `src/server/runtime/gate.ts` | 运行时门控（确保 DB/Redis 就绪后才接受请求） |

### 3.4 API 路由层 (`src/app/api/`) — 19 文件

| 路由文件 | 端点 | 用途 |
|----------|------|------|
| `src/app/api/auth/[...path]/route.ts` | `/api/auth/*` | 登录/注册/captcha/刷新/登出 |
| `src/app/api/characters/route.ts` | `GET/POST /api/characters` | 角色列表 + 创建 |
| `src/app/api/characters/validations.ts` | — | Zod 校验模式 |
| `src/app/api/characters/import/route.ts` | `POST /api/characters/import` | 导入角色卡 |
| `src/app/api/characters/[id]/route.ts` | `GET/PUT/DELETE /api/characters/:id` | 单个角色操作 |
| `src/app/api/characters/[id]/export/route.ts` | `GET /api/characters/:id/export` | 导出角色卡 |
| `src/app/api/chat/route.ts` | `POST /api/chat` | SSE 聊天（旧版通用端点） |
| `src/app/api/chat/[characterId]/route.ts` | `GET/POST /api/chat/:characterId` | 角色聊天 |
| `src/app/api/chat/[characterId]/continue/route.ts` | `POST /api/chat/:characterId/continue` | AI 续写 |
| `src/app/api/chat/[characterId]/regenerate/route.ts` | `POST /api/chat/:characterId/regenerate` | 重新生成 |
| `src/app/api/chat/[characterId]/suggest/route.ts` | `POST /api/chat/:characterId/suggest` | AI 建议回复 |
| `src/app/api/chat/[characterId]/sse-helpers.ts` | — | SSE 辅助函数 |
| `src/app/api/api-configs/route.ts` | `GET/POST /api/api-configs` | API 配置列表 + 创建 |
| `src/app/api/api-configs/validations.ts` | — | Zod 校验 |
| `src/app/api/api-configs/[id]/route.ts` | `GET/PUT/DELETE /api/api-configs/:id` | 单个配置操作 |
| `src/app/api/api-configs/[id]/default/route.ts` | `PUT /api/api-configs/:id/default` | 设为默认 |
| `src/app/api/api-configs/[id]/test/route.ts` | `POST /api/api-configs/:id/test` | 测试连接 |
| `src/app/api/health/route.ts` | `GET /api/health` | 健康检查（公开） |
| `src/app/api/payment/route.ts` | `POST /api/payment` | 创建充值订单 |

#### API 基础层 (`src/app/api/_base/`) — 5 文件
| 文件 | 用途 |
|------|------|
| `src/app/api/_base/auth.ts` | requireAuth helper |
| `src/app/api/_base/error.ts` | 错误响应 helper |
| `src/app/api/_base/rate-limit.ts` | 速率限制 |
| `src/app/api/_base/response.ts` | JSON 响应 helper |
| `src/app/api/_base/sse.ts` | SSE helper |

### 3.5 前端页面 (`src/app/`) — 18 文件

| 页面文件 | 路由 | 状态 | 说明 |
|----------|------|------|------|
| `src/app/layout.tsx` | `/` | ✅ | 根布局（html lang=zh-CN, 基础样式） |
| `src/app/page.tsx` | `/` | ✅ | 欢迎页（Logo + 标语 + 用户协议弹窗） |
| `src/app/login/page.tsx` | `/login` | ✅ | 密码登录页（邮箱+密码，密码可见切换） |
| `src/app/register/page.tsx` | `/register` | ✅ | 4 步注册（邮箱→图形验证码→邮箱验证码→密码+强度校验） |
| `src/app/characters/page.tsx` | `/characters` | ✅ | 角色列表（官方+用户，配额显示） |
| `src/app/characters/new/page.tsx` | `/characters/new` | ✅ | 创建角色（3 段折叠表单，12 字段校验） |
| `src/app/characters/[id]/page.tsx` | `/characters/[id]` | ✅ | 编辑/删除角色（导出、官方不可变） |
| `src/app/chat/[characterId]/page.tsx` | `/chat/[characterId]` | ✅ | **聊天页面（Phase 8 P0）** |
| `src/app/chat/[characterId]/CharacterHeader.tsx` | — | ✅ | 聊天页角色头部组件 |
| `src/app/chat/[characterId]/ChatClient.tsx` | — | ✅ | 聊天客户端主组件（SSE + 状态管理） |
| `src/app/chat/[characterId]/InputBar.tsx` | — | ✅ | 输入栏组件（发送、建议、重新生成） |
| `src/app/chat/[characterId]/MessageList.tsx` | — | ✅ | 消息列表组件（微信风格气泡） |
| `src/app/api-connections/page.tsx` | `/api-connections` | ✅ | API 连接列表 |
| `src/app/api-connections/new/page.tsx` | `/api-connections/new` | ✅ | 新建 API 配置 |
| `src/app/api-connections/[id]/page.tsx` | `/api-connections/[id]` | ✅ | 编辑/测试 API 配置 |
| `src/app/me/page.tsx` | `/me` | ✅ | 我的页面（头像、昵称、会员状态） |
| `src/app/settings/page.tsx` | `/settings` | ✅ | 设置页面（昵称修改、管理员入口） |

### 3.6 共享库 (`src/lib/`, `src/config/`, `src/types/`) — 8 文件

| 文件 | 用途 |
|------|------|
| `src/lib/auth.ts` | 客户端 Auth 类型和工具 |
| `src/lib/context.ts` | 上下文类型 |
| `src/lib/env.ts` | 环境变量获取 |
| `src/lib/sse.ts` | SSE 客户端解析 |
| `src/lib/use-auth.ts` | React Auth Hook（login/logout/user 状态管理，含 JSON 解析容错） |
| `src/config/constants.ts` | 全局常量（**DRIFT：FREE 角色数写为 2，实际应为 12**） |
| `src/types/api.ts` | API 响应类型 |
| `src/types/auth.ts` | Auth 类型 |

### 3.7 中间件 + 组件 + 脚本 — 4 文件

| 文件 | 用途 |
|------|------|
| `src/middleware.ts` | 全局中间件：JWT 验证、Rate Limit、Admin 检查、Auth Context 注入 |
| `src/components/TermsModal.tsx` | 用户协议弹窗（深色遮罩 + 可滚动文本 + 同意/拒绝） |
| `src/scripts/seed.ts` | 种子数据脚本（含 bcrypt 密码哈希） |
| `drizzle/0000_normal_blue_blade.sql` | 数据库迁移 SQL（含 passwordHash 字段） |

**总计：约 80 个源文件（含 53 个 .ts 后端 + 18 个 .tsx 前端 + 配置/迁移）**

---

## 第四部分：设计文档清单（共 31 份）

### 4.1 基础架构文档 (`docs/`) — 8 份
1. `docs/architecture-freeze-report.md` V1.1 — 架构冻结报告
2. `docs/database-design-constraints.md` V1.2 — 数据库设计约束
3. `docs/auth-architecture.md` — JWT 设计
4. `docs/security-threat-model.md` — SSRF/CSE/Replay Attack/Prompt Injection
5. `docs/middleware-security-design.md` — Middleware 层 Auth + Rate Limiting
6. `docs/redis-auth-design.md` — Redis 数据结构
7. `docs/system-integration-map.md` — 全线数据流
8. `docs/api-auth-layer-design.md` — API 认证层设计

### 4.2 Phase 6 — API Provider (`docs/phase6/`) — 6 份
### 4.3 Phase 7 — Character System (`docs/phase7/`) — 12 份（含 Phase 8/9 设计）
### 4.4 审计文档 (`docs/architecture/`) — 2 份
- `00-architecture-audit-report.md` — 综合审计报告（总分 62/100）
- `00-architecture-index.md` — 文档索引

---

## 第五部分：当前完成度分析

### 5.1 已完成（✅）

| 阶段 | 内容 | 验证状态 |
|------|------|---------|
| **Phase 0** | 架构设计 | 31 份设计文档全部就位 |
| **Phase 4** | Auth 系统（密码+验证码登录、captcha、注册、JWT、bcrypt） | ✅ 生产验证通过 |
| **Phase 6** | API Provider 连接系统 | 5 平台 + 3 自定义，AES-256 加密 |
| **Phase 7.1** | Character CRUD 系统 | 后端 CRUD + 配额 + 权限 + 导入导出 |
| **Phase 7.2** | Character → Chat 集成 | Prompt 组装、Greeting 注入 |
| **Phase 8 P0** | 聊天前端页面 + API | `/chat/[characterId]` + SSE |
| **Database** | 10 张表 | users, characters, messages, memories, conversations, api_configs, orders, vip_records, star_diamond_transactions, admin_logs |
| **CI/CD** | Vercel 自动部署 | `drizzle-kit migrate && next build`，每次 push 自动迁移 |
| **依赖升级** | drizzle-orm 0.45.2, drizzle-kit 0.31.10 | 修复 Neon 驱动底层 sql() 兼容性 |
| **安全加固** | bcrypt 密码哈希、自绘 SVG captcha、用户协议弹窗 | ✅ |

### 5.2 页面完成度
| 页面 | 状态 |
|------|------|
| `/` 欢迎页 + 用户协议 | ✅ |
| `/login` 密码登录 | ✅ |
| `/register` 4 步注册 | ✅ |
| `/characters` 角色列表 | ✅ |
| `/characters/new` 创建角色 | ✅ |
| `/characters/[id]` 编辑角色 | ✅ |
| `/chat/[characterId]` 聊天页面 | ✅ |
| `/api-connections` API 配置 | ✅ |
| `/me` 我的页面 | ✅ |
| `/settings` 设置 | ✅ |
| `/shop` 商店 | ❌ 未实现 |
| `/admin` 管理后台 | ❌ 未实现 |

### 5.3 API 端点完成度
| 端点 | 状态 |
|------|------|
| `POST /api/auth/*` 登录/注册/captcha | ✅ **生产验证通过** |
| `POST /api/chat/:id` SSE 聊天 | ✅ |
| `POST /api/chat/:id/regenerate` 重新生成 | ✅ |
| `POST /api/chat/:id/suggest` AI 建议 | ✅ |
| `POST /api/chat/:id/continue` AI 续写 | ✅ |
| `GET/POST /api/characters` | ✅ |
| `POST /api/characters/import` | ✅ |
| `GET /api/characters/:id/export` | ✅ |
| `GET/POST /api/api-configs` | ✅ |
| `POST /api/api-configs/:id/test` | ✅ |
| `GET /api/health` | ✅ |
| `POST /api/payment` | 🟡 骨架存在，未集成支付网关 |
| `GET /api/admin` | 🟡 骨架存在 |

---

## 第六部分：正式内测前待办清单

### 🔶 CRITICAL — 必须立即修复

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| C1 | `findHistory()` 缺少 userId 隔离 | `message.repository.ts` | 用户 A 可能看到用户 B 的消息 |
| C2 | `deleteLastAssistant()` 缺少 userId 隔离 | `message.repository.ts` | 用户 A 重新生成可能删用户 B 的回复 |
| C3 | Regex 记忆提取导致记忆污染 | `chat.service.ts` + `memory.service.ts` | AI 角色混淆虚构/真实信息 |
| C4 | `constants.ts` FREE 角色数为 2，与实际值 12 不一致 | `src/config/constants.ts` | 代码漂移 |

### 🟧 HIGH — 短期必须完成

| # | 内容 |
|---|------|
| H1 | **Phase 8 P1 — 重新生成 + 建议回复 UI 完善** |
| H2 | Greeting 持久化到 DB（W1.3） |
| H3 | 创建 `conversations` 表 migration（W2） |
| H4 | 实现 LLM-based MemoryExtractor 替换 Regex（W3.2） |
| H5 | 实现 MemoryRetriever（搜索式 Top K 检索，W3.3） |
| H6 | Token-Aware ContextBuilder 替换固定 30 条裁剪（W4） |
| H7 | 记忆表扩展（category + reference tracking）（W3.1） |
| H8 | 商店/充值页面 |
| H9 | 管理后台页面 |

### 🟨 MEDIUM — 内测前建议完成

| # | 内容 |
|---|------|
| M1 | 修改 `constants.ts` 中 FREE 角色配额为 12 |
| M2 | Redis 替换内存 Rate Limiter（TD-5） |
| M3 | 头像上传服务（代码中已有 TODO 标记） |
| M4 | MemoryConsolidator（记忆合并/清理/提升，W3.4） |
| M5 | C1+C2 权限修复 |

### 🔵 FUTURE — 内测后
| # | 内容 |
|---|------|
| F1 | 支付网关真实集成 |
| F2 | embedding + pgvector 记忆检索 |
| F3 | Story Engine 实施 |
| F4 | Multi-Character Group Chat 架构设计 |
| F5 | VIP 购买页面 |

---

## 第七部分：代码质量总览

### 7.1 已修复的重大问题

| 问题 | 日期 | 解决方案 |
|------|------|---------|
| Neon 驱动 `sql()` 500 错误 | 6/9 | drizzle-orm 0.39→0.45.2 + drizzle-kit 升级 |
| 全部 repository `db.query` 不兼容 | 6/9 | 28 处 `db.query`/`tx.query` → `db.select()` |
| `drizzle()` API 签名不兼容 | 6/9 | `drizzle(sql, {})` → `drizzle({ client: sql, schema })` |
| Vercel 缺 `password_hash` 字段 | 6/9 | `drizzle-kit migrate` 加入 build script |
| BOM 破坏 package.json | 6/8 | UTF-8 BOM 移除 |
| svg-captcha 依赖不稳定 | 6/8 | 替换为自绘 SVG（零依赖） |
| `use-auth.ts` JSON 解析崩溃 | 6/9 | content-type 检查 + try-catch |

### 7.2 已知代码异味

| # | 问题 | 位置 |
|---|------|------|
| TD-3 | `provider-gateway.ts` Fallback 分支静默降级未知平台 | `provider-gateway.ts` |
| TD-4 | `chat.service.ts` 中 `_buildSystemPrompt()` 字符串拼接 | `chat.service.ts` |
| TD-5 | 内存 Rate Limiter 不跨进程 | `rate-limit.ts` |
| TD-6 | `character.service.ts` 中 `userId` 显式可传，实际应从 Auth 获取 | `character.service.ts` |

---

## 第八部分：给审核 GPT 的提示词建议

> **将此段文字与本文档一起发给目标 GPT 进行审核：**

---

你是叙境 (Xujing) 项目的代码审核员。叙境是一个 AI 恋爱陪伴平台，目标用户是 18 岁以上的成年人。请根据本文档中的产品定义、架构设计和代码清单，完成以下审核任务：

1. **安全审计**：审查两个 CRITICAL Bug（`findHistory()` 和 `deleteLastAssistant()` 缺 userId），确认修复方案是否正确。

2. **记忆系统评估**：评估当前 Regex 提取方案（`_extractMemoriesAsync`）的实际风险，确认 Phase 9 的 MemoryExtractor + MemoryRetriever + MemoryConsolidator 三件套方案是否合理。

3. **架构完整性**：对照第五部分的完成度表格和第六部分的待办清单，确认是否遗漏关键项，给出内测就绪度评估（百分比）。

4. **代码质量**：抽样审查 `chat.service.ts`、`provider-gateway.ts`、`memory-engine.ts`，列出所有 bug、安全漏洞、性能问题和代码异味。

5. **依赖健康度**：确认 drizzle-orm 0.45.2 + drizzle-kit 0.31.10 + @neondatabase/serverless 1.1.0 的版本组合在生产环境是否稳定。

请用中文输出审核报告，按严重度排序（CRITICAL > HIGH > MEDIUM > LOW），每个问题必须附上文件名和行号参考。

---

**文档版本**: V2.0 | **最后更新**: 2026-06-09 | **下次审核建议**: 内测上线前