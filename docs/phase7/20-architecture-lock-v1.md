# 20 — Architecture Lock V1: Implementation Readiness Review

> **Phase 9.6 — Final Architecture Freeze** | **Date**: 2026-06-08
> **Status**: Architecture Lock
> **Scope**: Phase 0 → Phase 9.5 全量审查 + 冻结裁决

---

## Executive Verdict

### 判定：READY FOR IMPLEMENTATION（有条件）

| 维度 | 状态 | 说明 |
|------|------|------|
| 架构完整性 | ✅ PASS | 6 大子系统设计完整，覆盖 MVP 全部边界 |
| 设计一致性 | ✅ PASS | 跨文档冲突已裁决，唯一真相来源已建立 |
| Schema 就绪度 | ✅ PASS | 全部表定义完成，migration 路径明确 |
| 安全设计 | ✅ PASS | Auth + Rate Limit + 数据隔离设计完整 |
| Memory 架构 | ✅ PASS | Phase 9 + 9.5 提供完整记忆管理方案 |
| 代码就绪度 | ⚠️ CONDITIONAL | 存在 2 个 CRITICAL Bug 需要 Wave 1 修复 |
| 生产就绪度 | ⚠️ CONDITIONAL | Rate Limiter 为内存实现；pgvector 未部署 |

**结论**：架构设计层已达到冻结标准。实施前必须完成 Wave 1（安全隔离修复）。所有后续实施必须基于本文档定义的最终架构基线，禁止偏离。

---

## A. 最终架构基线（Frozen Baseline）

### A.1 Character System

```
实体：characters 表（V1.2，19 列）
分类：Official（is_official=true, user_id=NULL）/ User（is_official=false）
配额：FREE ≤ 12, VIP 无限  (Source: PROJECT_RULES.md + character.service.ts L8)
生命周期：Create（version=1）→ Edit（version++）→ Soft Delete（deleted_at）→ CASCADE 清理
不可变：官方角色不可编辑/删除
权限：getCharacter() 实现 "官方=任何人可读, 用户角色=仅owner"
```

**冻结字段**（禁止新增/删除/修改类型）：

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID v7 PK | — |
| user_id | UUID FK → users, nullable | NULL=官方 |
| name | varchar(100) | — |
| setting | text | — |
| greeting | text | — |
| personality | text, nullable | — |
| scenario | text, nullable | — |
| dialogue_examples | jsonb, nullable | — |
| nickname | varchar(100), nullable | — |
| group_greeting | text, nullable | — |
| main_prompt | text, nullable | — |
| post_history_instructions | text, nullable | — |
| extra_fields | jsonb, nullable | — |
| is_official | boolean, default false | — |
| version | integer, default 1 | — |
| deleted_at | timestamptz, nullable | 软删除 |
| created_at | timestamptz | — |
| updated_at | timestamptz | — |

### A.2 Conversation System

```
实体：conversations 表（Phase 9 新建）
字段：id, userId, characterId, title, summary, storyState(jsonb), createdAt, updatedAt
索引：idx_conversations_user_char(user_id, character_id)
      idx_conversations_updated_at(updated_at DESC)
关系：User 1:N Conversation N:1 Character
      Conversation 1:N Message
创建策略：首次聊天自动创建；24h 内复用最近 Conversation；超时新建
```

**messages 表新增列**：

| 列名 | 类型 | 说明 |
|------|------|------|
| conversation_id | UUID FK → conversations, NOT NULL | Phase 9 Wave 2 |

### A.3 Memory Truth Layer

```
实体：memories 表（V3 — Phase 9 + 9.5）
```

**冻结字段**：

| 列名 | 类型 | 默认值 | 用途 |
|------|------|--------|------|
| id | UUID v7 PK | auto | — |
| character_id | UUID FK → characters | — | 隔离键 |
| user_id | UUID FK → users | — | 隔离键 |
| content | text | — | 记忆文本 |
| category | memory_category enum | 'PROFILE' | IDENTITY/RELATIONSHIP/PREFERENCE/GOAL/EXPERIENCE/PROFILE/KNOWLEDGE |
| fact_type | memory_fact_type enum | 'FACT' | FACT/PREFERENCE/RELATIONSHIP/EVENT/OPINION/GOAL |
| fact_key | varchar(200) | NULL | 同域唯一标识。格式："{category}:{normalized_key}" |
| importance | NUMERIC(3,2) | 0.50 | 主观重要性（LLM 评估） |
| confidence | NUMERIC(3,2) | 0.50 | 客观可靠性（系统自动计算） |
| source | memory_source enum | 'INFERENCE' | USER_EXPLICIT/USER_IMPLICIT/ROLEPLAY/INFERENCE/SYSTEM_GENERATED |
| superseded_by | UUID → memories(id) | NULL | 版本链。NULL=当前有效 |
| version | INTEGER | 1 | 事实版本号 |
| confirmation_count | INTEGER | 0 | 被确认次数 |
| contradiction_count | INTEGER | 0 | 被挑战次数 |
| last_referenced_at | TIMESTAMPTZ | NULL | 最后检索时间 |
| reference_count | INTEGER | 0 | 检索次数 |
| last_confirmed_at | TIMESTAMPTZ | NULL | 最后确认时间 |
| extracted_from_message_id | UUID | NULL | 来源消息 |
| embedding | JSONB | NULL | 向量嵌入预留（Phase 2） |
| created_at | TIMESTAMPTZ | NOW() | — |
| updated_at | TIMESTAMPTZ | NOW() | — |

**冻结枚举**：

```
memory_category（7 值，禁止增减）：
  IDENTITY, RELATIONSHIP, PREFERENCE, GOAL, EXPERIENCE, PROFILE, KNOWLEDGE

memory_fact_type（6 值，禁止增减）：
  FACT, PREFERENCE, RELATIONSHIP, EVENT, OPINION, GOAL

memory_source（5 值，禁止增减）：
  USER_EXPLICIT, USER_IMPLICIT, ROLEPLAY, INFERENCE, SYSTEM_GENERATED
```

**关键索引**：

```
idx_memories_fact_key_active:
  UNIQUE (character_id, user_id, fact_key) WHERE superseded_by IS NULL AND confidence > 0.30

idx_memories_confidence:
  (character_id, user_id, confidence DESC)

idx_memories_superseded:
  (superseded_by)

idx_memories_last_confirmed:
  (last_confirmed_at)
```

### A.4 Provider Gateway

```
支持平台（8 种，禁止增减）：
  OPENAI, ANTHROPIC, GEMINI, DEEPSEEK, GROK,
  CUSTOM_OPENAI, CUSTOM_ANTHROPIC, CUSTOM_GEMINI

加密：AES-256-CBC, 密钥来源环境变量 API_KEY_ENCRYPTION_KEY
VIP 模型：DeepSeek V4 Flash，平台级配置，不在 api_configs 表中
默认配置：每用户最多 1 个 is_default（UNIQUE(user_id) WHERE is_default=TRUE）
流式响应：SSE 通过 ReadableStream + ChatEvent { type: "delta"|"done"|"error" }

api_configs 表字段（8 列，禁止修改类型）：
  id, user_id, name, platform, api_url, api_key_encrypted, model_id,
  is_active, is_default, created_at
```

### A.5 Auth System

```
注册：Email 验证码 → Resend 发送 → Redis 缓存（5min TTL）
登录：验证码校验 → 签发 JWT (15min access + 7天 refresh)
中间件：middleware.ts → JWT verify → Rate Limit → Context Injection
安全：
  - JTI Blacklist（logout 后 token 失效）
  - Refresh Rotation（一次性使用）
  - Replay Detection（旧 refresh 二次使用 → 全 session 注销）
  - SSRF 防护（URL 解析 + IP blocklist）
  - SSE 连接限制（每用户 3 并发，5min 超时）

users 表关键字段（禁止修改类型）：
  id, email (UNIQUE LOWER), nickname, avatar_url, role (USER/ADMIN),
  status (ACTIVE/BANNED), vip_expires_at, star_diamonds (BIGINT),
  persona_setting, has_purchased_vip
```

### A.6 Context Builder

```
组件：ContextBuilder（Phase 9 Wave 4 新建）
预算模型：maxTokens(8000) - reservedForReply(2000) = 6000 tokens available

优先级（锁定，禁止调整顺序）：

  优先级 1（永不裁剪）：
    System Prompt        ~400 tokens
    Character Data       ~2000 tokens

  优先级 2（可压缩）：
    Relationship State   ~200 tokens

  优先级 3（可减少 K 值）：
    Memory (Top K)       ~1000 tokens
    Story State          ~500 tokens

  优先级 5（从最早开始裁剪）：
    Recent Messages      剩余预算
```

**ContextBuilder 输入接口（冻结）**：

```
character: { mainPrompt, setting, personality, scenario, dialogueExamples, nickname, postHistoryInstructions }
personaSetting: string | undefined
relationshipState: string | null       ← 从 Memory 检索
storyState: StoryState | null         ← 从 Conversation 读取
memories: Memory[]                    ← 从 MemoryRetriever 检索
messages: Message[]                   ← 从 MessageRepository 加载
budget: { maxTokens, reservedForReply }
```

---

## B. 冻结清单（Frozen — 禁止变更）

### B.1 Schema 层面

| 冻结项 | 范围 | 说明 |
|--------|------|------|
| characters 表 | 全部 18 列 + 3 索引 | 禁止新增列、修改类型、删除列 |
| messages 表 | 新增 conversation_id 后锁定 | Wave 2 完成后锁定 |
| memories 表 | 全部 18 列 + 6 索引 | V3 锁定，禁止增减列 |
| conversations 表 | 全部 8 列 + 2 索引 | Wave 2 创建后锁定 |
| api_configs 表 | 全部 10 列 | 已锁定 |
| users 表 | 全部 10+ 列 | 禁止修改类型 |
| 所有 enum | 共 11 个枚举 | 禁止增减枚举值 |

### B.2 架构策略层面

| 冻结项 | 决策 | 理由 |
|--------|------|------|
| Memory 分类方案 | 7 种 category + 6 种 fact_type | 覆盖长期陪伴全部场景 |
| Memory 提取方式 | LLM MemoryExtractor（非 Regex） | 审计报告 C3 — 记忆污染不可接受 |
| Memory 检索方式 | Top K 文本匹配 → Phase 2 pgvector | 6 个月内文本匹配可用 |
| Context 优先级 | 5 级优先级（永不裁剪 → 可压缩 → 可截断） | 保护 System Prompt + Character Data |
| Relationship 方案 | 自然语言状态 + 时间线（非数值化） | 产品定义严禁数值化好感度 |
| RP 记忆隔离 | source=ROLEPLAY + 检索过滤 | 保护核心记忆库不受污染 |
| Conversation 方案 | 扁平多会话容器（非 Tree/Branch） | Database Constraints V1.2 澄清 |
| Auth 方案 | JWT + Refresh Rotation + JTI | 安全审计通过 |
| Provider 方案 | 5 内置 + 3 自定义 + VIP 平台模型 | 覆盖全部主流 AI API |

### B.3 禁止项（重申）

```
Schema 禁止：
  ❌ 好感度表、关系等级表
  ❌ 角色广场/角色发布表
  ❌ Conversation Tree（parent_message_id / generation_index）
  ❌ 多态关联（owner_type + owner_id）
  ❌ pgvector 强制依赖（MVP 阶段）

Feature 禁止（Phase 0 定义，Phase 9.6 重申）：
  ❌ 数值化好感度/亲密度/爱情值
  ❌ 角色广场/角色发布
  ❌ World System 实施（仅允许 StoryState 接口预留）
  ❌ Story Engine 实施（仅允许 StoryState 接口预留）
  ❌ Multi-Character Group Chat
  ❌ Agent 系统
  ❌ 排行榜/签到/邀请码
```

---

## C. 实施优先级（Final Implementation Order）

### 总览

```
Phase 8（Chat UI）         ← 已设计冻结，可立即实施
Phase 9.1（安全隔离）      ← CRITICAL，必须最先实施
Phase 9.2（Conversation）  ← 依赖 Phase 9.1
Phase 9.3（Memory Engine） ← 依赖 Phase 9.2
Phase 9.4（Context Builder）← 依赖 Phase 9.3
Phase 9.5a（Truth Schema） ← 依赖 Phase 9.3
Phase 9.5b（Truth Lifecycle）← 依赖 Phase 9.5a
```

### C.1 第一优先级 — W1（立即，本周）

**目标**：修复所有 CRITICAL Bug，无 Schema 变更，可在生产环境热修复。

| Step | 内容 | 来源 |
|------|------|------|
| W1.1 | `findHistory(characterId, userId)` — 增加 userId 过滤 | 审计 C1 |
| W1.2 | `deleteLastAssistant(characterId, userId)` — 增加 userId 过滤 | 审计 C2 |
| W1.3 | Greeting 持久化 — 写入 DB 为 ASSISTANT 消息 | 审计 H4 |
| W1.4 | `POST /api/chat` route 增加 content ≤ 2000 校验 | Phase 8 P2.4 |

**验收**：用户 A 无法读取用户 B 的任何消息。刷新后 Greeting 不消失。

### C.2 第二优先级 — W2（第 1–2 周）

**目标**：引入 Conversation System + Chat UI 上线。

| Step | 内容 | 依赖 |
|------|------|------|
| W2.1 | `conversations` 表创建 + migration（含已有数据迁移） | W1 完成 |
| W2.2 | `messages` 表增加 `conversation_id` | W2.1 |
| W2.3 | ConversationRepository 新建 | W2.2 |
| W2.4 | ChatService 重构为 conversation-aware | W2.3 |
| W2.5 | `GET /api/chat/[characterId]` 历史端点 + conversation 列表 | W2.4 |
| W2.6 | Chat UI 页面（Phase 8 P0.1–P0.5） | 可与 W2.1–W2.5 并行 |
| W2.7 | Regenerate + Suggest 端点 + UI（Phase 8 P1.1–P1.4） | W2.6 |

**验收**：用户可与角色聊天，历史持久化，支持多 Conversation 切换。

### C.3 第三优先级 — W3（第 3–4 周）

**目标**：Memory Engine 上线（提取 + 检索 + 分类）。

| Step | 内容 | 依赖 |
|------|------|------|
| W3.1 | memories 表增加 category + lastReferencedAt + referenceCount | W2 完成 |
| W3.2 | MemoryExtractor 实现（LLM 提取，含 category + fact_type 输出） | W3.1 |
| W3.3 | MemoryRetriever 实现（Top K 文本匹配 + confidence 排序） | W3.1 |
| W3.4 | 删除旧 Regex 提取代码（_extractMemoriesAsync, extractFacts） | W3.2 |
| W3.5 | ChatService 集成 MemoryExtractor + MemoryRetriever | W3.2–W3.4 |

**验收**：对话后自动提取记忆；有分类；检索返回相关记忆；无 Regex 残留。

### C.4 第四优先级 — W4（第 5–6 周）

**目标**：Context Builder + Memory Truth Layer。

| Step | 内容 | 依赖 |
|------|------|------|
| W4.1 | ContextBuilder 实现（5 级优先级 + Token 预算） | W3 完成 |
| W4.2 | memories 表增加 fact_key + source + superseded_by + confidence 体系 | W3 完成 |
| W4.3 | MemoryValidator 实现（重复检测 + 矛盾检测 + 来源评级） | W4.2 |
| W4.4 | MemoryConsolidator 实现（去重 + 衰减 + 版本链压缩） | W4.2 |
| W4.5 | Story Engine 接口文件（StoryState 类型定义） | 独立，无依赖 |
| W4.6 | 删除 _buildSystemPrompt，统一使用 ContextBuilder | W4.1 |
| W4.7 | 删除 CONTEXT_MESSAGE_LIMIT 常量 | W4.6 |

**验收**：Context 组装基于 Token 预算；记忆有 source/confidence 标记；事实变化时旧事实标记 superseded。

### C.5 未来优先级（MVP 后）

| Step | 内容 | 前提 |
|------|------|------|
| F1 | pgvector + embedding 记忆检索 | 用户量 + 记忆量达到阈值 |
| F2 | MemoryConsolidator 定时任务 | W4.4 完成 |
| F3 | Redis Rate Limiter | 多实例部署 |
| F4 | Memory UI 面板（前端展示记忆） | Chat UI 稳定 |
| F5 | Story Engine 实施 | 产品决策 |
| F6 | World System 实施 | 产品决策 |

---

## D. 风险评估

### D.1 过度设计风险

| 风险 | 评估 |
|------|------|
| Memory Truth Layer（Phase 9.5）在 MVP 阶段是否过度设计 | **低风险**。fact_key + superseded_by 是长期陪伴的硬需求。不实施版本管理，6 个月后记忆冲突不可收拾。Source tracking 是 RP 隔离的前提条件。 |
| 7 种 memory_category 是否过多 | **中风险**。KNOWLEDGE 和 PROFILE 边界模糊。建议初版合并为 6 种，KNOWLEDGE 延后至 World System 上线。 |
| Recency Factor λ 参数是否需要精确校正 | **低风险**。公式提供方向性排序，实际效果由 LLM 精排（Re-ranking）兜底。 |

### D.2 长记忆性能风险

| 时间点 | 记忆量（估算） | 检索方式 | 性能 | 风险 |
|--------|-------------|---------|------|------|
| 3 个月 | 200 条 | 文本匹配 O(n) | < 10ms | ✅ 低 |
| 6 个月 | 350 条 | 文本匹配 O(n) | < 20ms | ✅ 低 |
| 1 年 | 500 条 | 文本匹配 O(n) | < 50ms | ⚠️ 中 |
| 3 年 | 800 条 (active) | 文本匹配 O(n) | > 100ms | 🔴 高 — 需要 pgvector |

**缓解**：Phase 2 的 pgvector 实施必须在用户量/记忆量达到阈值前完成。建议监控指标：单次检索耗时 > 50ms → 触发 pgvector 迁移。

### D.3 PostgreSQL 扩展风险

| 扩展 | 当前状态 | Phase 2 需求 | 风险 |
|------|---------|------------|------|
| pgvector | MVP 不强制安装 | 1 年内必须 | 低 — Docker 环境一键安装 |
| pg_trgm | 当前未使用 | 可选（文本模糊匹配优化） | 低 |
| uuid-ossp | 未使用（自实现 uuidv7） | 不需要 | — |

### D.4 pgvector 依赖风险

```
当前设计：embedding 列存储为 JSONB NULL（Database Constraints V1.2 设计）
Phase 2 迁移步骤：
  1. 安装 pgvector 扩展（CREATE EXTENSION vector）
  2. 新增 embedding_vector 列（vector(1536) 或 vector(768)）
  3. 批量调用 Embedding API 填充 embedding_vector
  4. 创建 IVFFlat 索引
  5. MemoryRetriever 切换为向量检索

风险：
  - Embedding API 成本（OpenAI text-embedding-3-small: $0.02/1M tokens）
  - 已有记忆批量 embedding 的时间和成本
  - 检索方式切换时的行为变化

缓解：
  - MVP 阶段不触发此风险
  - 预留 JSONB embedding 列作为过渡方案
```

### D.5 Context 膨胀风险

```
当前设计：ContextBuilder 使用 Token 估算（chars / 3.5）
风险：
  - 估算偏差大（中文 1 char ≈ 0.5–1 token，英文 1 char ≈ 0.25 token）
  - 混合中英文内容时估算不准
  - 如果估算偏保守 → 浪费可用上下文
  - 如果估算偏激进 → 超出模型上下文窗口 → API 报错

缓解：
  - chars / 3.5 偏保守（对中文友好）
  - 如果 API 因超出 context 报错 → 自动重试，减少 10% 预算
  - Phase 2 可迁移到 tiktoken 精确计数
```

### D.6 综合风险矩阵

| # | 风险 | 概率 | 影响 | 优先级 | 缓解 |
|---|------|------|------|--------|------|
| R1 | 1 年后文本匹配检索性能不可接受 | 高 | 高 | P0 | pgvector Phase 2 |
| R2 | MemoryExtractor LLM 输出不稳定 | 中 | 中 | P1 | try/catch + Zod + 空返回不阻塞 |
| R3 | fact_key 命名冲突 | 中 | 中 | P1 | key 字典表 |
| R4 | 混合语言 Token 估算偏差 | 中 | 低 | P2 | 自动重试 + 动态调整 |
| R5 | pgvector 迁移成本 | 低 | 中 | P2 | 预留 JSONB 列 + 渐进迁移 |
| R6 | Context Builder 过于激进裁剪重要信息 | 低 | 高 | P1 | 优先级 1 永不裁剪 |
| R7 | 多实例部署时内存 Rate Limiter 不共享 | 低 | 中 | P2 | 单实例可接受；未来迁移 Redis |

---

## E. Architecture Lock Verdict

### 最终判定：READY FOR IMPLEMENTATION

**条件**：

1. **立即条件**（实施前必须满足）：
   - Wave 1（W1.1–W1.4）作为任何新功能开发的前置条件
   - 修复 `findHistory` 和 `deleteLastAssistant` 的 userId 隔离

2. **短期条件**（Wave 2 完成前）：
   - Database Constraints V1.2 修订为 V1.3（澄清 Conversation 容器）
   - Architecture Freeze Report 修订 FREE 角色数 2→12

3. **中期条件**（Wave 4 完成后）：
   - 监控检索性能指标
   - 当 p95 检索时间 > 50ms 时启动 pgvector 迁移

### 锁定声明

```
叙境（Xujing）Phase 0 → Phase 9.5 架构设计阶段正式结束。

以下为最终架构基线（Frozen Baseline）：
  - 本文档 §A（6 个子系统完整定义）
  - 本文档 §B（冻结清单 — 禁止变更项）
  - 本文档 §C（实施优先级）

以下文档构成唯一真相来源（Single Source of Truth）：
  - PROJECT_RULES.md（产品定义）
  - 00-architecture-index.md（文档索引）
  - 00-architecture-audit-report.md（审计报告）
  - 17-memory-first-architecture.md（Memory 架构）
  - 19-memory-truth-layer-architecture.md（Memory Truth Layer）
  - 本文档 20-architecture-lock-v1.md（架构锁定裁决）

所有后续开发必须基于上述文档。禁止引用未被 ACTIVE 标记的文档。
禁止以"旧文档是这么说的"为由偏离本基线。
```

---

## 附录：文档生命周期（最终状态）

| 文档 | 最终状态 | 说明 |
|------|---------|------|
| `PROJECT_RULES.md` | ACTIVE — 产品定义权威 | FREE 12 角色（待修订 architecture-freeze-report 中 2→12） |
| `architecture-freeze-report.md` | ACTIVE — 需小幅修订 | §1.1 FREE 配额改为 12；§9.2 Q1 记忆方案更新 |
| `database-design-constraints.md` | ACTIVE — 需小幅修订 | V1.3 澄清 Conversation 容器 ≠ Tree |
| `system-integration-map.md` | ACTIVE | — |
| `security-threat-model.md` | ACTIVE | — |
| `auth-architecture.md` | ACTIVE | — |
| `middleware-security-design.md` | ACTIVE | — |
| `redis-auth-design.md` | ACTIVE | — |
| `api-auth-layer-design.md` | ACTIVE | — |
| `phase6/01–06` | ACTIVE | API Provider 设计 |
| `phase7/01–12` | ACTIVE | Character System 设计 + 实施 |
| `phase7/13–16` | ACTIVE | Chat System 设计（Phase 8） |
| `phase7/17` | ACTIVE — Memory 架构权威 | Phase 9 核心设计 |
| `phase7/18` | ACTIVE | Phase 9 迁移计划 |
| `phase7/19` | ACTIVE — Truth Layer 权威 | Phase 9.5 深度设计 |
| `phase7/20` | ACTIVE — 最终裁决 | 本文档 |
| `architecture/00-architecture-audit-report.md` | ACTIVE | 审计报告 |
| `architecture/00-architecture-index.md` | ACTIVE | 文档索引 |
| `PHASE6_IMPLEMENTATION_REPORT.md` | ACTIVE | 实施报告（历史记录） |

**无 SUPERSEDED 或 DEPRECATED 状态文档需要归档**。所有 ACTIVE 文档均保持有效，部分需要小幅修订（标注在备注中）。

---

## 结束声明

Architecture Lock V1 生效。

叙境项目从架构设计阶段正式转入实施阶段。

实施顺序：W1（安全）→ W2（Chat UI + Conversation）→ W3（Memory Engine）→ W4（Context Builder + Truth Layer）。

任何架构偏离必须通过正式的 Architecture Change Request 流程，更新本文档并重新冻结。
