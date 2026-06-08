# 叙境 (Xujing) — 项目全貌文档：供 GPT 审核提示词与代码

> **生成日期**: 2026-06-08  
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
| **主站** | modelbridge.top（叙境为独立分站，要求：与主站业务隔离、数据库隔离、页面隔离） |
| **部署环境** | Docker + Cloudflare Tunnel + Linux 服务器 |

### 1.2 用户体系

| 维度 | FREE 用户 | VIP 用户 |
|------|----------|---------|
| **角色配额** | 12 个 | 无限 |
| **记忆容量** | 100 条/角色 | 10000 条/角色 |
| **API 连接** | 仅限自备 API Key | 可使用自备 API Key 或平台专属模型 |
| **星钻系统** | 送 100 星钻 | 月卡/季卡/年卡，首月优惠 990 星钻 |

### 1.3 MVP 包含（Must Have）

- 邮箱验证码注册/登录（Resend 发邮件）
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

### 1.5 开发铁律（绝对优先级）

1. **缺少配置必须询问**：Resend API Key、支付配置、管理员账号、官方角色文件等配置缺失时禁止使用占位符
2. **禁止超阶段开发**：只完成当前阶段目标
3. **发现需求冲突必须先报告**：列出冲突点 → 方案A/B → 等待选择
4. **禁止恢复旧叙境**：禁止从 Git 历史/旧目录/旧数据库恢复代码
5. **网络访问失败处理**：失败后用代理 127.0.0.1:7897 重试
6. **所有阶段必须有验收结果**：已完成/未完成/风险项/需项目负责人提供的信息

### 1.6 开发规则

| 规则 | 详情 |
|------|------|
| **每次任务必须先读** | `PROJECT_RULES.md` |
| **行为基线** | karpathy-guidelines（永远最先调用） |
| **写代码** | fullstack-guardian + javascript-pro |
| **涉及安全** | secure-code-guardian |
| **审查代码** | code-reviewer |
| **写测试** | test-master |
| **调 bug** | debugging-wizard |
| **E2E 测试** | playwright-expert |
| **SEO/性能** | seo-technical-expert |
| **数据库** | database-optimizer + sql-pro |

---

## 第二部分：技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | Next.js 15 + React 19（App Router） |
| **样式** | Tailwind CSS 4 |
| **语言** | TypeScript 5.7 |
| **数据库** | PostgreSQL 16 + Drizzle ORM |
| **缓存/Session** | Redis 7 (ioredis) |
| **Auth** | JWT（15min access + 7天 refresh）+ JTI 黑名单 + Refresh Rotation |
| **加密** | AES-256-CBC（API Key 加密存储） |
| **邮件** | Resend（验证码发送） |
| **AI Provider** | OpenAI / Anthropic / Gemini / DeepSeek / Grok + 3 自定义兼容协议 |
| **部署** | Docker Compose (postgres + redis + pgadmin) + Cloudflare Tunnel |
| **包管理** | npm + pnpm |

---

## 第三部分：完整源文件清单（共 45 个源文件）

### 3.1 根目录配置

| 文件 | 用途 |
|------|------|
| `D:\modelbridge\叙境app\PROJECT_RULES.md` | 项目宪法：产品定义、Skill 规则、开发铁律 |
| `D:\modelbridge\叙境app\package.json` | 依赖和脚本 |
| `D:\modelbridge\叙境app\pnpm-workspace.yaml` | pnpm 工作区配置 |
| `D:\modelbridge\叙境app\pnpm-lock.yaml` | pnpm 锁文件 |
| `D:\modelbridge\叙境app\package-lock.json` | npm 锁文件 |
| `D:\modelbridge\叙境app\tsconfig.json` | TypeScript 配置 |
| `D:\modelbridge\叙境app\next.config.ts` | Next.js 配置（webpack node: 前缀兼容） |
| `D:\modelbridge\叙境app\postcss.config.mjs` | PostCSS 配置 |
| `D:\modelbridge\叙境app\drizzle.config.json` | Drizzle Kit 配置 |
| `D:\modelbridge\叙境app\docker-compose.yml` | Docker 服务编排 |
| `D:\modelbridge\叙境app\.env` | 环境变量 |
| `D:\modelbridge\叙境app\init-db.sql` | 数据库初始化脚本 |

### 3.2 数据库层 (`src/db/`)

| 文件 | 用途 |
|------|------|
| `src\db\index.ts` | Drizzle 数据库客户端初始化 |
| `src\db\enums.ts` | 枚举定义（role, status, platform 等） |
| `src\db\helpers.ts` | 辅助函数（timestamps 等） |
| `src\db\indexes.ts` | 索引定义 |
| `src\db\relations.ts` | 表关系定义 |
| `src\db\schema\index.ts` | Schema 统一导出 |
| `src\db\schema\users.ts` | users 表（id, email, role, status, vipExpiresAt, personaSetting 等） |
| `src\db\schema\characters.ts` | characters 表（12 字段：name, setting, greeting, avatarUrl, personality, scenario, dialogueExamples, nickname, groupGreeting, mainPrompt, postHistoryInstructions, backgroundUrl + 软删除） |
| `src\db\schema\messages.ts` | messages 表（user_id, character_id, role, content） |
| `src\db\schema\memories.ts` | memories 表（user_id, character_id, content, keywords, importance） |
| `src\db\schema\api-configs.ts` | api_configs 表（加密 API Key） |
| `src\db\schema\orders.ts` | orders 表（充值订单 + 截图审核） |
| `src\db\schema\vip-records.ts` | vip_records 表（VIP 开通记录） |
| `src\db\schema\star-diamond-transactions.ts` | 星钻交易流水表 |
| `src\db\schema\admin-logs.ts` | 管理员操作日志表 |

### 3.3 服务端业务层 (`src/server/`)

#### Auth 模块 (`src/server/auth/`)
| 文件 | 用途 |
|------|------|
| `src\server\auth\jwt.ts` | JWT 签发和验证（access 15min + refresh 7天） |
| `src\server\auth\redis-session.ts` | Redis Session 管理（refresh token, JTI blacklist, 验证码, rate limit） |
| `src\server\auth\guard.ts` | Auth Guard（从 header 提取用户上下文） |
| `src\server\auth\context.ts` | Auth 上下文类型定义 |

#### 数据仓库层 (`src/server/repositories/`)
| 文件 | 用途 |
|------|------|
| `src\server\repositories\user.repository.ts` | 用户 CRUD + 查询 |
| `src\server\repositories\character.repository.ts` | 角色 CRUD + 软删除 + 查询 |
| `src\server\repositories\message.repository.ts` | 消息存取 + 历史查询（**C1 Bug：findHistory 缺 userId**） |
| `src\server\repositories\memory.repository.ts` | 记忆存取 + 容量管理 |
| `src\server\repositories\api-config.repository.ts` | API 配置存取 |
| `src\server\repositories\order.repository.ts` | 订单存取 |
| `src\server\repositories\vip.repository.ts` | VIP 记录存取 |
| `src\server\repositories\star-diamond-transaction.repository.ts` | 星钻交易存取 |
| `src\server\repositories\admin-log.repository.ts` | 管理日志存取 |

#### 业务服务层 (`src/server/services/`)
| 文件 | 用途 |
|------|------|
| `src\server\services\auth.service.ts` | 登录/注册/刷新/登出业务逻辑 |
| `src\server\services\character.service.ts` | 角色 CRUD + 配额检查 + 权限控制 + 导入/导出 |
| `src\server\services\chat.service.ts` | 聊天核心：消息发送、Prompt 组装、记忆注入、重新生成 |
| `src\server\services\memory.service.ts` | 记忆管理（**C3 Bug：Regex 提取**） |
| `src\server\services\api-config.service.ts` | API 配置 CRUD + 测试连接 |
| `src\server\services\provider-gateway.ts` | AI Provider 统一网关：路由、解密、流式调用 |
| `src\server\services\payment.service.ts` | 支付业务逻辑 |
| `src\server\services\vip.service.ts` | VIP 会员管理 |
| `src\server\services\crypto.ts` | AES-256-CBC 加解密 |
| `src\server\services\database-health.ts` | 数据库健康检查 |
| `src\server\services\infra-health.ts` | 基础设施健康检查 |

#### 运行时 (`src/server/runtime/`)
| 文件 | 用途 |
|------|------|
| `src\server\runtime\gate.ts` | 运行时门控（确保 DB/Redis 就绪后才接受请求） |

### 3.4 API 路由层 (`src/app/api/`)

| 路由文件 | 端点 | 用途 |
|----------|------|------|
| `src\app\api\auth\[...path]\route.ts` | `/api/auth/*` | 登录/注册/刷新/登出 |
| `src\app\api\characters\route.ts` | `GET/POST /api/characters` | 角色列表 + 创建 |
| `src\app\api\characters\validations.ts` | — | Zod 校验模式（Create/Update/Import/Export） |
| `src\app\api\characters\import\route.ts` | `POST /api/characters/import` | 导入角色卡 |
| `src\app\api\characters\[id]\route.ts` | `GET/PUT/DELETE /api/characters/:id` | 单个角色操作 |
| `src\app\api\characters\[id]\export\route.ts` | `GET /api/characters/:id/export` | 导出角色卡 |
| `src\app\api\chat\route.ts` | `POST /api/chat` | SSE 聊天（含 FREE 用户 API 检测） |
| `src\app\api\api-configs\route.ts` | `GET/POST /api/api-configs` | API 配置列表 + 创建 |
| `src\app\api\api-configs\validations.ts` | — | Zod 校验 |
| `src\app\api\api-configs\[id]\route.ts` | `GET/PUT/DELETE /api/api-configs/:id` | 单个配置操作 |
| `src\app\api\api-configs\[id]\default\route.ts` | `PUT /api/api-configs/:id/default` | 设为默认 |
| `src\app\api\api-configs\[id]\test\route.ts` | `POST /api/api-configs/:id/test` | 测试连接 |
| `src\app\api\health\route.ts` | `GET /api/health` | 健康检查（公开） |
| `src\app\api\payment\route.ts` | `POST /api/payment` | 创建充值订单 |
| `src\app\api\users\route.ts` | `GET /api/users` | 用户信息 |
| `src\app\api\admin\route.ts` | `GET /api/admin` | 管理后台（admin only） |
| `src\app\api\_base\auth.ts` | — | requireAuth helper |
| `src\app\api\_base\error.ts` | — | 错误响应 helper |
| `src\app\api\_base\rate-limit.ts` | — | 速率限制 |
| `src\app\api\_base\response.ts` | — | JSON 响应 helper |
| `src\app\api\_base\sse.ts` | — | SSE helper |

### 3.5 前端页面 (`src/app/`)

| 页面文件 | 路由 | 说明 |
|----------|------|------|
| `src\app\layout.tsx` | `/` | 根布局（html lang=zh-CN, 基础样式） |
| `src\app\page.tsx` | `/` | 占位页（显示"叙境 — Runtime Shell"） |
| `src\app\characters\page.tsx` | `/characters` | 角色列表（官方+用户，配额显示~112行） |
| `src\app\characters\new\page.tsx` | `/characters/new` | 创建角色（4 段折叠表单，12 字段限制~169行） |
| `src\app\characters\[id]\page.tsx` | `/characters/[id]` | 编辑/删除角色（导出、不可变官方角色~268行） |
| `src\app\api-connections\page.tsx` | `/api-connections` | API 连接列表 |
| `src\app\api-connections\new\page.tsx` | `/api-connections/new` | 新建 API 配置 |
| `src\app\api-connections\[id]\page.tsx` | `/api-connections/[id]` | 编辑/测试 API 配置 |
| `src\app\me\page.tsx` | `/me` | 我的页面（头像、昵称、会员状态） |
| `src\app\settings\page.tsx` | `/settings` | 设置页面（昵称修改、管理员入口） |

### 3.6 共享库 (`src/lib/`, `src/config/`, `src/types/`)

| 文件 | 用途 |
|------|------|
| `src\lib\auth.ts` | 客户端 Auth 类型和工具 |
| `src\lib\context.ts` | 上下文类型 |
| `src\lib\env.ts` | 环境变量获取 |
| `src\lib\sse.ts` | SSE 客户端解析 |
| `src\lib\use-auth.ts` | React Auth Hook（login/logout/user 状态管理） |
| `src\config\constants.ts` | 全局常量（**DRIFT：FREE 角色数为 2，实际应为 12**） |
| `src\types\api.ts` | API 响应类型 |
| `src\types\auth.ts` | Auth 类型 |
| `src\scripts\seed.ts` | 种子数据脚本 |

### 3.7 中间件

| 文件 | 用途 |
|------|------|
| `src\middleware.ts` | 全局中间件：JWT 验证、Rate Limit、Admin 检查、Auth Context 注入 |

### 3.8 测试文件

| 文件 | 用途 |
|------|------|
| `tests\phase6-api-connections.test.ts` | Phase 6 API 连接集成测试 |
| `tests\phase6-final-acceptance.test.ts` | Phase 6 最终验收测试 |
| `tests\_write_docs.js` | 文档生成工具 |

---

## 第四部分：完整设计文档清单（共 31 份）

### 4.1 基础架构文档 (`docs/`)

| # | 文档 | 内容 |
|---|------|------|
| 1 | `docs\architecture-freeze-report.md` V1.1 | 架构冻结报告：页面地图、模块拆解、技术选型、风险清单 |
| 2 | `docs\database-design-constraints.md` V1.2 | 数据库设计约束：9 实体、8 组关系、9 枚举、索引策略、安全策略 |
| 3 | `docs\auth-architecture.md` | JWT 设计、Refresh Token 旋转、JTI 黑名单 |
| 4 | `docs\security-threat-model.md` | SSRF 防护、SSE 滥用、Replay Attack、Prompt Injection |
| 5 | `docs\middleware-security-design.md` | Middleware 层 Auth + Rate Limiting |
| 6 | `docs\redis-auth-design.md` | Redis 数据结构（refresh/blocked/rate） |
| 7 | `docs\system-integration-map.md` | 全线数据流（注册→聊天）、模块依赖图 |
| 8 | `docs\api-auth-layer-design.md` | API 认证层设计 |

### 4.2 Phase 6 — API Provider 设计文档 (`docs/phase6/`)

| # | 文档 | 状态 |
|---|------|------|
| 1 | `01-api-provider-architecture.md` | ACTIVE |
| 2 | `02-api-provider-schema-review.md` | ACTIVE |
| 3 | `03-api-provider-page-design.md` | ACTIVE |
| 4 | `04-provider-routing-flow.md` | ACTIVE |
| 5 | `05-provider-validation-rules.md` | ACTIVE |
| 6 | `06-phase6-final-acceptance.md` | ACTIVE |

### 4.3 Phase 7 — Character System 设计与实施文档 (`docs/phase7/`)

| # | 文档 | 状态 |
|---|------|------|
| 1 | `01-character-architecture.md` | ACTIVE |
| 2 | `02-character-schema-review.md` | ACTIVE |
| 3 | `03-character-page-design.md` | ACTIVE |
| 4 | `04-character-routing-flow.md` | ACTIVE |
| 5 | `05-character-validation-rules.md` | ACTIVE |
| 6 | `06-phase7-final-acceptance.md` | ACTIVE |
| 7 | `07-phase7-implementation-report.md` | ACTIVE — Phase 7.1 实施完成 |
| 8 | `08-phase7-hardening-report.md` | ACTIVE — 加固完成 |
| 9 | `09-character-chat-integration.md` | ACTIVE — Prompt 组装已实施 |
| 10 | `10-character-technical-debt.md` | ACTIVE — TD-1/2 已修复，TD-3~6 待处理 |
| 11 | `11-character-phase72-acceptance.md` | ACTIVE |
| 12 | `12-phase72-final-acceptance.md` | ACTIVE — Phase 7.2 验收通过 |

### 4.4 Phase 8 — Chat System 设计文档 (`docs/phase7/`)

| # | 文档 | 状态 |
|---|------|------|
| 13 | `13-chat-system-design.md` | ACTIVE |
| 14 | `14-chat-ui-spec.md` | ACTIVE |
| 15 | `15-chat-api-spec.md` | ACTIVE |
| 16 | `16-phase8-roadmap.md` | ACTIVE — 设计仅冻结，未实施 |

### 4.5 Phase 9 — Memory-First 架构设计 (`docs/phase7/`)

| # | 文档 | 状态 |
|---|------|------|
| 17 | `17-memory-first-architecture.md` | ACTIVE — 唯一权威架构 |
| 18 | `18-phase9-migration-plan.md` | ACTIVE |

### 4.6 审计文档 (`docs/architecture/`)

| # | 文档 | 状态 |
|---|------|------|
| 19 | `00-architecture-audit-report.md` | ACTIVE — 综合审计报告（总体评分 62/100） |
| 20 | `00-architecture-index.md` | ACTIVE — 文档索引 |

---

## 第五部分：当前实现完成度分析

### 5.1 已完成（✅）

| 阶段 | 内容 | 验证状态 |
|------|------|---------|
| **Phase 0** | 架构设计 | 设计文档完整，31 份全部就位 |
| **Phase 4** | Auth 系统 | JWT + Redis Session + Middleware Auth + Runtime Gate |
| **Phase 6** | API Provider 连接系统 | 5 平台 + 3 自定义协议，AES-256 加密，测试连接，前端页面 |
| **Phase 7.1** | Character CRUD 系统 | 后端：CRUD + 配额 + 权限 + 导入导出；前端：列表/创建/编辑 3 页 |
| **Phase 7.2** | Character ↔ Chat 集成 | Prompt 组装（8 段注入），Greeting 注入，TypeScript `as any` 消除 |
| **Database** | 全 9 张表 | users, characters, messages, memories, api_configs, orders, vip_records, star_diamond_transactions, admin_logs |
| **基础设施** | Docker Compose, PostgreSQL 16, Redis 7 | 全部正常运行 |
| **构建** | `npx tsc --noEmit` | 新代码 0 errors |

### 5.2 页面完成度

| 页面 | 状态 | 说明 |
|------|------|------|
| `/characters` | ✅ | 角色列表（官方+用户，配额显示） |
| `/characters/new` | ✅ | 创建角色（4 段折叠，12 字段校验） |
| `/characters/[id]` | ✅ | 编辑角色（导出、删除、官方不可变） |
| `/api-connections` | ✅ | API 配置列表 |
| `/api-connections/new` | ✅ | 新建 API 配置（5 平台 + 3 自定义） |
| `/api-connections/[id]` | ✅ | 编辑/测试 API 配置 |
| `/me` | ✅ | 用户信息展示 + 登录 |
| `/settings` | ✅ | 设置页（昵称修改、管理员入口） |
| `/chat/[characterId]` | ❌ | **未实现** — Phase 8 核心页面 |
| `/shop` | ❌ | **未实现** — 商店页面 |
| `/admin` | ❌ | **未实现** — 管理后台页面 |

### 5.3 API 端点完成度

| 端点 | 状态 | 说明 |
|------|------|------|
| `POST /api/auth/*` | ✅ | 登录/注册/刷新/登出 |
| `GET /api/health` | ✅ | 健康检查 |
| `GET/POST /api/characters` | ✅ | 角色列表+创建 |
| `GET/PUT/DELETE /api/characters/:id` | ✅ | 单个角色操作 |
| `POST /api/characters/import` | ✅ | 导入角色卡 |
| `GET /api/characters/:id/export` | ✅ | 导出角色卡 |
| `GET/POST /api/api-configs` | ✅ | API 配置管理 |
| `GET/PUT/DELETE /api/api-configs/:id` | ✅ | 单个配置 |
| `PUT /api/api-configs/:id/default` | ✅ | 设为默认 |
| `POST /api/api-configs/:id/test` | ✅ | 测试连接 |
| `POST /api/chat` | ✅ | SSE 聊天（基础版） |
| `GET /api/chat/[characterId]` | ❌ | **未实现** — P0 聊天历史 |
| `POST /api/payment` | 🟡 | 骨架存在，未与支付网关集成 |
| `GET /api/users` | 🟡 | 基础实现 |
| `GET /api/admin` | 🟡 | 骨架存在 |
| **Conversation APIs** | ❌ | **未实现** — 整个 conversation 层 |

---

## 第六部分：正式内测前的待办清单

### 🔴 CRITICAL — 必须立即修复

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| C1 | `findHistory()` 缺少 userId 隔离 | `src/server/repositories/message.repository.ts:15` | 用户 A 可能看到用户 B 的消息 |
| C2 | `deleteLastAssistant()` 缺少 userId 隔离 | `src/server/repositories/message.repository.ts:36` | 用户 A 重生成可能删用户 B 的回复 |
| C3 | Regex 记忆提取导致记忆污染 | `chat.service.ts:260-310` + `memory.service.ts:15-40` | AI 角色混淆虚构/真实信息 |
| C4 | `constants.ts` FREE 角色数为 2，与实际值 12 不一致 | `src/config/constants.ts:20` | 代码漂移 |

### 🟡 HIGH — 短期必须完成

| # | 内容 | 关联文档 |
|---|------|---------|
| H1 | **Phase 8 P0 — 聊天历史 API** `GET /api/chat/[characterId]` | `16-phase8-roadmap.md` |
| H2 | **Phase 8 P0 — 聊天页面** `/chat/[characterId]`（含 CharacterHeader, MessageList, InputBar） | `14-chat-ui-spec.md` |
| H3 | **Phase 8 P1 — 重新生成 + 建议回复**（regenerate/suggest 端点 + UI） | `16-phase8-roadmap.md` |
| H4 | Greeting 持久化到 DB（W1.3） | `00-architecture-audit-report.md` |
| H5 | 创建 `conversations` 表 + migration（W2） | `18-phase9-migration-plan.md` |
| H6 | 实现 LLM-based MemoryExtractor 替换 Regex（W3.2） | `17-memory-first-architecture.md` |
| H7 | 实现 MemoryRetriever（搜索式 Top K 检索，W3.3） | `17-memory-first-architecture.md` |
| H8 | Token-Aware ContextBuilder 替换固定 30 条裁剪（W4） | `17-memory-first-architecture.md` |
| H9 | 记忆表扩展（category + reference tracking）（W3.1） | `18-phase9-migration-plan.md` |

### 🟢 MEDIUM — 内测前建议完成

| # | 内容 |
|---|------|
| M1 | 修改 `constants.ts` 中 FREE 角色配额为 12 |
| M2 | Resend 邮件服务真实接入（当前为 console.log 骨架） |
| M3 | Redis 替换内存 Rate Limiter（TD-5） |
| M4 | 修订 `database-design-constraints.md` V1.3：澄清 Conversation 概念 |
| M5 | 修改 `architecture-freeze-report.md`：2→12 角色配额 |
| M6 | 头像上传服务（代码中已有 TODO 标记） |
| M7 | MemoryConsolidator（记忆合并/清理/提升，W3.4） |
| M8 | 管理后台页面（/admin） |

### ⬜ FUTURE — 内测后

| # | 内容 |
|---|------|
| F1 | 商店/充值/支付页面 |
| F2 | VIP 购买页面 |
| F3 | embedding + pgvector 记忆检索 |
| F4 | Story Engine 实施 |
| F5 | Multi-Character Group Chat 架构设计 |

---

## 第七部分：代码质量总览

### 7.1 架构审计评分（综合 62/100）

| 维度 | 得分 | 说明 |
|------|------|------|
| 用户数据隔离 | 45/100 | C1+C2 两个跨用户数据泄露 Bug |
| 记忆系统 | 30/100 | Regex 提取，无分类/检索/生命周期 |
| Schema 一致性 | 55/100 | Database Constraints V1.2 与 Phase 9 冲突 |
| 文档一致性 | 50/100 | 多处文档漂移（DRIFT） |
| API 设计 | 75/100 | 端点设计合理，但缺 conversation 层 |
| Auth 安全 | 85/100 | JWT + JTI + Refresh Rotation + SSRF 防护完善 |
| 实施质量 | 80/100 | chat.service.ts 实现质量高；character.service.ts 有少量 `as any`（已修复） |

### 7.2 已知代码异味

| # | 问题 | 位置 |
|---|------|------|
| TD-3 | `provider-gateway.ts` Fallback 分支静默降级未知平台 | `provider-gateway.ts:48` |
| TD-4 | `chat.service.ts` 中 `_buildSystemPrompt()` 字符串拼接 | `chat.service.ts:85-130` |
| TD-5 | 内存 Rate Limiter 不跨进程 | `rate-limit.ts` |
| TD-6 | `character.service.ts` 中 `userId` 显式可传，实际应从 Auth 获取 | `character.service.ts` |

---

## 第八部分：给审核 GPT 的提示词建议

> **将此段文字与本文档一起发给目标 GPT 进行审核：**

---

你是叙境 (Xujing) 项目的代码审核员。叙境是一个 AI 恋爱陪伴平台，目标用户是 18 岁以上的成年人。请根据本文档中的产品定义、架构设计和代码清单，完成以下审核任务：

1. **提示词审核**：审查 `src/server/services/chat.service.ts` 中的 `_buildSystemPrompt()` 函数（约 45 行），检查 Prompt 注入风险、角色一致性保持、中日文混合场景处理。参照 `docs/phase7/09-character-chat-integration.md`。

2. **数据安全审计**：审查两个 CRITICAL Bug（`findHistory()` 和 `deleteLastAssistant()` 缺 userId），确认修复方案是否正确。

3. **记忆系统评估**：评估当前 Regex 提取方案 (`_extractMemoriesAsync`) 的实际风险，确认 Phase 9 的 MemoryExtractor + MemoryRetriever + MemoryConsolidator 三件套方案是否合理。

4. **架构完整性**：对照第五部分的完成度表格和第六部分的待办清单，确认是否遗漏关键项，给出内测就绪度评估（百分比）。

5. **代码质量**：抽样审查 `character.service.ts`（240 行）、`chat.service.ts`（320 行）、`provider-gateway.ts`（250 行），列出所有 bug、安全漏洞、性能问题和代码异味。

请用中文输出审核报告，按严重度排序（CRITICAL > HIGH > MEDIUM > LOW），每个问题必须附上文件名和行号参考。
