# Architecture Audit Report

> **审计日期**: 2026-06-08
> **审计范围**: Phase 0 ~ Phase 9 全部设计文档 (31 份) + 全部源代码
> **审计角色**: Principal Architect / Staff Engineer
> **审计方法**: 逐文档交叉验证 + 源代码对照 + Schema 一致性检查

---

## Executive Summary

### 总体评分：62 / 100

| 维度 | 得分 | 说明 |
|------|------|------|
| 用户数据隔离 | 45/100 | 两个 CRITICAL Bug：findHistory 和 deleteLastAssistant 缺少 userId |
| 记忆系统 | 30/100 | Regex 提取方案不可接受；无分类/检索/生命周期 |
| Schema 一致性 | 55/100 | Database Constraints V1.2 与 Phase 9 存在直接冲突 |
| 文档一致性 | 50/100 | 多处文档漂移 (DRIFT)；部分早期文档已过期 |
| API 设计 | 75/100 | 端点设计合理，但缺少 conversation 层 |
| Auth 安全 | 85/100 | JWT + JTI + Refresh Rotation 设计完善；SSRF 防护到位 |
| 扩展性 | 60/100 | Phase 9 预留了 Story Engine，但与 Phase 0 MVP 禁令冲突 |
| 实施质量 | 80/100 | chat.service.ts 实现质量高；character.service.ts 有 TypeScript `as any` |

**结论**：叙境当前架构基础扎实（Auth、ProviderGateway、Character CRUD 均正确），但在 Memory First 核心卖点上存在严重缺口。两个跨用户数据泄露 Bug 必须立即修复。Regex 记忆提取方案必须废弃。Database Constraints V1.2 需要修订以支持 Conversation 系统。

---

## Critical Issues (必须立即处理)

### C1 — `findHistory()` 缺少 userId 隔离

| 属性 | 值 |
|------|-----|
| **严重度** | **CRITICAL** |
| **位置** | `src/server/repositories/message.repository.ts:15` |
| **问题** | `findHistory(characterId, limit)` 仅按 characterId 过滤，未过滤 userId |
| **影响** | 用户 A 调用 GET /api/chat/[characterId] 可能看到用户 B 的消息 |
| **发现** | 源代码审计 + Phase 9 17-memory-first-architecture.md §2.1 |
| **修复** | 增加 `userId` 参数，添加 `eq(messages.userId, userId)` 条件 |
| **修复文档** | 18-phase9-migration-plan.md W1.1 |

### C2 — `deleteLastAssistant()` 缺少 userId 隔离

| 属性 | 值 |
|------|-----|
| **严重度** | **CRITICAL** |
| **位置** | `src/server/repositories/message.repository.ts:36` |
| **问题** | `deleteLastAssistant(characterId)` 仅按 characterId + ASSISTANT 查找，无 userId |
| **影响** | 用户 A 点击"重新生成"可能删除用户 B 的回复 |
| **发现** | 源代码审计 + Phase 9 17-memory-first-architecture.md §2.1 |
| **修复** | 增加 `userId` 参数，添加 `eq(messages.userId, userId)` 条件 |
| **修复文档** | 18-phase9-migration-plan.md W1.2 |

### C3 — Regex 记忆提取导致记忆污染

| 属性 | 值 |
|------|-----|
| **严重度** | **CRITICAL** |
| **位置** | `src/server/services/chat.service.ts:260-310` (`_extractMemoriesAsync`) |
| **位置** | `src/server/services/memory.service.ts:15-40` (`extractFacts`) |
| **问题** | 使用 `/我是/` `/我喜欢/` `/我住在/` 等正则表达式提取记忆 |
| **影响** | 噪声远大于信号；RP 剧情虚构信息被当作事实；无法区分临时/长期信息 |
| **发现** | 源代码审计 + Phase 9 17-memory-first-architecture.md §5 |
| **修复** | 删除全部 Regex 提取逻辑，替换为 LLM-based MemoryExtractor |
| **修复文档** | 18-phase9-migration-plan.md W3.2 |

---

## High Risk Issues

### H1 — 固定条数上下文裁剪

| 属性 | 值 |
|------|-----|
| **严重度** | HIGH |
| **位置** | `src/server/services/chat.service.ts:24` |
| **问题** | `CONTEXT_MESSAGE_LIMIT = 30` 按消息条数裁剪上下文 |
| **影响** | 长消息被过度裁剪（浪费上下文窗口），短消息浪费空间 |
| **发现** | 源代码审计 + Phase 9 17-memory-first-architecture.md §4 |
| **修复** | 替换为 Token-Aware ContextBuilder |
| **修复文档** | 18-phase9-migration-plan.md W4.1-W4.4 |

### H2 — 全部记忆注入 Prompt

| 属性 | 值 |
|------|-----|
| **严重度** | HIGH |
| **位置** | `src/server/services/chat.service.ts:85-89` |
| **问题** | 所有记忆无差别拼接进 system prompt |
| **影响** | Token 浪费；无关记忆干扰 LLM 推理质量 |
| **发现** | 源代码审计 + Phase 9 17-memory-first-architecture.md §7 |
| **修复** | 替换为 MemoryRetriever（搜索式 Top K 检索） |
| **修复文档** | 18-phase9-migration-plan.md W3.3 |

### H3 — 记忆无分类/无生命周期

| 属性 | 值 |
|------|-----|
| **严重度** | HIGH |
| **位置** | `src/db/schema/memories.ts` |
| **问题** | memories 表仅有 `content` + `importance` + `embedding`(未使用)；无 category、无 reference tracking、无 stale detection |
| **影响** | 记忆无限膨胀；无法区分身份/偏好/关系/经历；无自动清理 |
| **发现** | Schema 审计 + Phase 9 17-memory-first-architecture.md §6, §8 |
| **修复** | 新增 category enum、lastReferencedAt、referenceCount 列 |
| **修复文档** | 18-phase9-migration-plan.md W3.1 |

### H4 — Greeting 不持久化

| 属性 | 值 |
|------|-----|
| **严重度** | HIGH |
| **位置** | `src/server/services/chat.service.ts:80-84` |
| **问题** | Greeting 仅注入 LLM context (`chatMessages.push({ role: "assistant", content: firstGreeting })`)，不写入 DB |
| **影响** | 刷新页面后 Greeting 消失，UI 与 Context 不一致 |
| **发现** | 源代码审计 + Phase 9 17-memory-first-architecture.md §2.2 |
| **修复** | 首次对话时写入 greeting 为 ASSISTANT 消息 |
| **修复文档** | 18-phase9-migration-plan.md W1.3 |

### H5 — 缺少 Story Engine / StoryState 扩展点

| 属性 | 值 |
|------|-----|
| **严重度** | HIGH |
| **位置** | `src/server/services/chat.service.ts` — `_buildSystemPrompt` |
| **问题** | Context 组装无 StoryState 注入点；未来 World System / Story Engine 需大量重构 Context Builder |
| **影响** | 扩展成本高；Context Builder 将成为瓶颈 |
| **发现** | 源代码审计 + Phase 9 17-memory-first-architecture.md §11 |
| **修复** | 在 ContextBuilder 中预留 StoryState 注入点（优先级 3） |
| **修复文档** | 18-phase9-migration-plan.md W4.5 |

---

## Architecture Conflicts

### CONFLICT 1：Conversation 系统 vs Database Constraints V1.2

| 属性 | 值 |
|------|-----|
| **冲突类型** | 直接设计冲突 |
| **文档 A** | `docs/database-design-constraints.md` V1.2 §7.3 |
| **文档 A 内容** | 明确禁止：**"Conversation Branch / Tree — Message 为扁平线性结构。不保留重生成历史、不支持版本切换、不支持会话分支。"** |
| **文档 B** | `docs/phase7/17-memory-first-architecture.md` §3 |
| **文档 B 内容** | 引入 `conversations` 表，`messages.conversationId` FK，支持"聊天1：日常互动 / 聊天2：恋爱剧情线 / 聊天3：平行宇宙" |
| **冲突分析** | Phase 1 冻结时禁止 Conversation Tree（即 parent/child 分支结构），Phase 9 引入的是 Conversation Container（多会话容器）。两者概念不同但文档措辞模糊。"Conversation Branch/Tree" ≠ "Conversation Container" |
| **裁决** | **保留 Phase 9**。Conversation 是多会话容器，不是 Tree/Branch。需将 V1.2 的禁止项措辞精化为"禁止多版本分支树（parent_message_id / generation_index），允许扁平多会话（conversationId）" |
| **行动** | 修订 `database-design-constraints.md` 为 V1.3，澄清 Conversation 容器与 Conversation Tree 的区别 |

### CONFLICT 2：Relationship 系统 vs MVP 禁令

| 属性 | 值 |
|------|-----|
| **冲突类型** | 演进冲突（MVP→后 MVP） |
| **文档 A** | `docs/architecture-freeze-report.md` §1.2 |
| **文档 A 内容** | MVP 明确不包含："数值系统：好感度、亲密度、爱情值、关系等级。+5好感/+10亲密度/Lv3关系" |
| **文档 B** | `docs/phase7/17-memory-first-architecture.md` §9 |
| **文档 B 内容** | 引入 Relationship State（STRANGER / FRIEND / LOVER / PARTNER / ...），通过 Memory 存储关系状态 |
| **冲突分析** | Phase 0 禁止的是"数值化关系系统"（+5 好感 / Lv3），Phase 9 引入的是"自然语言关系状态"（通过 Memory 分类记录）。本质不同。 |
| **裁决** | **保留 Phase 9**。自然语言关系状态 ≠ 数值化好感度系统。Phase 0 的禁令针对的是"数值游戏化"，Phase 9 的关系系统是"语义理解" |
| **行动** | 无需修订。在架构索引中注明此区别 |

### CONFLICT 3：Story Engine / World System vs MVP 禁令

| 属性 | 值 |
|------|-----|
| **冲突类型** | 演进冲突（预留接口 vs 实施） |
| **文档 A** | `docs/architecture-freeze-report.md` §1.2 |
| **文档 A 内容** | MVP 不包含："世界系统、剧情系统、任务系统、签到系统" |
| **文档 B** | `docs/phase7/17-memory-first-architecture.md` §11 |
| **文档 B 内容** | 定义 `StoryState` 接口、预留 ContextBuilder 注入点、"Phase 2 实施" |
| **冲突分析** | Phase 0 禁止 MVP 实施 World/Story 系统。Phase 9 仅为接口预留，不实施逻辑。两者不矛盾。 |
| **裁决** | **无冲突**。Phase 9 做的是架构预留（定义接口 + Context Builder 注入点），不是实施 World/Story 系统 |
| **行动** | 无需修订 |

---

## Document Drift (文档漂移)

### DRIFT 1 — FREE 用户角色配额

| 属性 | 值 |
|------|-----|
| **文档 A** | `docs/architecture-freeze-report.md` §1.1：FREE 用户 **2 个**角色 |
| **文档 B** | `PROJECT_RULES.md` 用户体系：FREE 用户最多 **12 个**角色 |
| **文档 C** | `docs/phase7/01-character-architecture.md` §2.1：FREE: max **12** characters |
| **源代码** | `character.service.ts` L8：`FREE_USER_CHARACTER_LIMIT = 12` |
| **裁决** | **12 为有效值**。architecture-freeze-report.md 已过期 |
| **行动** | 修订 architecture-freeze-report.md → V1.2，改为 12 |

### DRIFT 2 — 记忆容量描述不一致

| 属性 | 值 |
|------|-----|
| **文档 A** | `PROJECT_RULES.md`：FREE 100条/角色，VIP 10000条/角色 |
| **文档 B** | `docs/database-design-constraints.md` §2.4："上限后按重要性权重淘汰" |
| **文档 C** | `docs/phase7/17-memory-first-architecture.md` §6：新增 category + 分类 |
| **裁决** | **容量值一致**；但 Phase 9 增加了分类维度，旧文档需要更新 |
| **行动** | 17-memory-first-architecture 为最新权威来源 |

### DRIFT 3 — 验证码单日上限

| 属性 | 值 |
|------|-----|
| **文档 A** | `docs/architecture-freeze-report.md` §5.1："单日发送上限 10次/邮箱" |
| **文档 B** | `docs/security-threat-model.md` §3.2："每天 10 次" |
| **源代码** | 未在代码中找到此限制（可能未实施或在前端） |
| **裁决** | 一致。10次/邮箱/天 |
| **行动** | 低优先级 — 需要后端实施（当前可能仅前端限制） |

---

## Deprecated Designs (已废弃设计)

### DEP-1 — Regex Memory Extraction

| 属性 | 值 |
|------|-----|
| **状态** | **DEPRECATED — 等待删除** |
| **位置** | `chat.service.ts:_extractMemoriesAsync()` + `memory.service.ts:extractFacts()` |
| **替代方案** | LLM-based MemoryExtractor (17-memory-first-architecture.md §5) |
| **废弃原因** | 产生记忆污染；无法区分事实与虚构；无法分类 |
| **风险** | 删除前无后备方案。建议 W3 先实现 MemoryExtractor，再删除旧代码 |
| **删除计划** | Phase 9 W3.6 |

### DEP-2 — 固定条数上下文裁剪 (CONTEXT_MESSAGE_LIMIT = 30)

| 属性 | 值 |
|------|-----|
| **状态** | **DEPRECATED — 等待删除** |
| **位置** | `chat.service.ts` L24 |
| **替代方案** | Token-Aware ContextBuilder (17-memory-first-architecture.md §4) |
| **废弃原因** | 不感知消息长度差异；长消息被不合理裁剪 |
| **删除计划** | Phase 9 W4.4 |

### DEP-3 — 按 characterId 聚合消息 (无 userId)

| 属性 | 值 |
|------|-----|
| **状态** | **DEPRECATED — 等待替换** |
| **位置** | `message.repository.ts:findHistory()` + `deleteLastAssistant()` |
| **替代方案** | 增加 userId 参数的 `findHistory(characterId, userId)` |
| **废弃原因** | 跨用户数据泄露风险 |
| **删除计划** | Phase 9 W1.1-W1.2（不改签名，仅增加参数） |

### DEP-4 — architecture-freeze-report.md 中的 "2 个角色"

| 属性 | 值 |
|------|-----|
| **状态** | **DEPRECATED — 值已过期** |
| **位置** | `docs/architecture-freeze-report.md` §1.1 |
| **替代方案** | PROJECT_RULES.md 和代码中的 12 个 |
| **废弃原因** | 文档漂移；实际实施为 12 |
| **行动** | 修订 architecture-freeze-report.md |

---

## Data Isolation Audit (数据隔离审计)

### 逐 Repository 审计

| Repository | 方法 | 有 userId 过滤？ | 状态 |
|-----------|------|-----------------|------|
| `message.repository.ts` | `findHistory` | ❌ 无 | **CRITICAL** (C1) |
| `message.repository.ts` | `findById` | ❌ 无（单条查询，风险低） | OK |
| `message.repository.ts` | `deleteLastAssistant` | ❌ 无 | **CRITICAL** (C2) |
| `message.repository.ts` | `deleteMessage` | ❌ 无（按 id 删除，风险中） | WARNING |
| `memory.repository.ts` | `findByCharacter` | ✅ 有 `userId` | OK |
| `memory.repository.ts` | `countByCharacter` | ✅ 有 `userId` | OK |
| `memory.repository.ts` | `evictLowest` | ✅ 有 `userId` | OK |
| `memory.repository.ts` | `deleteByCharacter` | ✅ 只按 characterId（级联） | OK |
| `character.repository.ts` | `findUserCharacters` | ✅ 有 `userId` | OK |
| `character.repository.ts` | `findById` | ❌ 无（但 service 层校验 ownership） | OK |
| `character.repository.ts` | `countUserCharacters` | ✅ 有 `userId` | OK |

**结论**：MessageRepository 是两个 CRITICAL 问题的唯一来源。MemoryRepository 和 CharacterRepository 隔离正确。

---

## Memory First Audit (记忆系统深度审计)

### M1 — 用户隔离

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Memory 查询带 userId | ✅ OK | `findByCharacter(characterId, userId, limit)` |
| Memory 创建带 userId | ✅ OK | `create({ characterId, userId, content, ... })` |
| Message 查询带 userId | ❌ FAIL | `findHistory(characterId)` — C1 |
| Conversation 查询带 userId | N/A | 尚未实施 |

### M2 — 记忆提取

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 是否使用 Regex | ❌ FAIL | `_extractMemoriesAsync()` 使用 6 个正则 |
| 是否使用 LLM | ❌ FAIL | 无 LLM 提取 |
| 是否过滤临时信息 | ❌ FAIL | 无过滤机制 |
| 是否过滤 RP 虚构信息 | ❌ FAIL | 无过滤机制 |

**评分：0/4** — 记忆提取方案不可接受。必须替换为 LLM-based MemoryExtractor。

### M3 — 记忆分类

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 区分身份 (IDENTITY) | ❌ FAIL | 无分类 |
| 区分偏好 (PREFERENCE) | ❌ FAIL | 无分类 |
| 区分关系 (RELATIONSHIP) | ❌ FAIL | 无分类 |
| 区分目标 (GOAL) | ❌ FAIL | 无分类 |
| 区分经历 (EXPERIENCE) | ❌ FAIL | 无分类 |

**评分：0/5** — 无任何分类机制。Phase 9 设计的 `memory_category` enum 覆盖全部 6 类。

### M4 — 记忆检索

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 语义检索 | ❌ FAIL | 无向量检索 |
| 相关性排序 | ❌ FAIL | 仅按 importance 排序 |
| 时间衰减 | ❌ FAIL | 无时间因子 |
| 重要度加权 | 部分 | `importance` 字段存在但仅用于淘汰 |

**评分：1/4** — 仅 importance 排序。Phase 9 的 MemoryRetriever 提供全部 4 项。

### M5 — 记忆生命周期

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 记忆创建 | ✅ OK | `memoryRepository.create()` |
| 记忆更新 | ❌ FAIL | 无更新机制 |
| 记忆合并 (去重) | ❌ FAIL | 无合并机制 |
| 记忆强化 (提升权重) | ❌ FAIL | importance 写死为 0.50 |
| 记忆遗忘 (衰减) | ❌ FAIL | 无时间衰减 |
| 记忆归档 | ❌ FAIL | 无归档机制 |

**评分：1/6** — 仅创建 + 删除。Phase 9 MemoryConsolidator 覆盖全部 6 项。

### 记忆系统总分：2/17

---

## Context Builder Audit

| 检查项 | 现状 | 目标 |
|--------|------|------|
| 上下文组装 | `_buildSystemPrompt()` 8 段固定拼接 | ContextBuilder.build() 动态优先级组装 |
| Token 预算 | 无预算。固定 30 条消息 | maxTokens - reservedForReply |
| 优先级系统 | 无。所有 section 平级 | 6 级优先级（System Prompt > Character > Relationship > Memory/Story > Messages） |
| 记忆搜索注入 | 全部记忆注入 | Top K 搜索注入 + reference 追踪 |
| Story State 注入 | 无 | 优先级 3 注入点（预留） |
| Token 估算 | chars / 4（仅注释提及） | chars / 3.5 保守估算 |

---

## Story Engine Compatibility

| 未来系统 | 当前支持 | 需要的改动 | 影响 |
|---------|---------|-----------|------|
| World System (世界书) | ❌ 零支持 | storyState.worldState JSONB 注入 Context | 中等 — 需要世界书编辑器和注入逻辑 |
| Story Engine (剧情推进) | ❌ 零支持 | storyState.currentArc/goal/conflict 注入 | 中等 — 需要剧情状态机 |
| Multi-Character Group Chat | ❌ 零支持 | 多角色 context 组装 | 大 — 架构级变更 |
| Event System (事件驱动) | ❌ 零支持 | StoryEvent 流 + 触发机制 | 大 — 架构级变更 |

**结论**：Phase 9 的 StoryState 接口预留了正确的扩展点。Multi-Character Group Chat 和 Event System 需要后续独立架构设计。

---

## Recommended Architecture Baseline (推荐架构基线)

以下是从全部 31 份文档中提取的**当前唯一有效架构决策**。

### Character System

```
实体: Character (characters 表)
分类: Official (is_official=true, user_id=NULL) / User (is_official=false)  
配额: FREE ≤ 12, VIP 无限 (Source: PROJECT_RULES.md + character.service.ts)
生命周期: Create → Edit (version++) → Soft Delete → CASCADE 清理
权限: 官方角色不可编辑/删除；用户角色仅 owner 可操作
```

### Conversation System

```
实体: Conversation (conversations 表 — Phase 9 新增)
关系: User 1:N Conversation N:1 Character
        Conversation 1:N Message
创建策略: 首次聊天自动创建；24h 内复用；超时新建
API: GET /api/chat/[characterId]/conversations (列表)
     GET /api/chat/[characterId]/[conversationId] (历史)
     DELETE /api/chat/[characterId]/[conversationId] (删除)
```

### Memory System

```
实体: Memory (memories 表 — Phase 9 扩展)
分类: IDENTITY | RELATIONSHIP | PREFERENCE | GOAL | EXPERIENCE | PROFILE
容量: FREE 100/角色, VIP 10000/角色
提取: LLM-based MemoryExtractor (替换 Regex)
检索: MemoryRetriever (关键词 → Phase 2 embedding+pgvector)
生命周期: MemoryConsolidator (合并/清理/提升)
```

### Relationship System

```
方案: Memory 内 RELATIONSHIP category，importance=1.0 标记当前状态
状态枚举: STRANGER / ACQUAINTANCE / FRIEND / CLOSE_FRIEND / LOVER / PARTNER / FAMILY / RIVAL / MENTOR / STUDENT
禁止: 数值化 (+5好感 / Lv3关系)
```

### Context Builder

```
模块: ContextBuilder (Phase 9 W4 新建)
预算模型: maxTokens - reservedForReply (默认 8000 - 2000 = 6000)
优先级: 1. System Prompt / Character Data (不裁剪)
       2. Relationship State (可压缩)
       3. Memories / Story State (可减少 K 值)
       5. Recent Messages (从最早开始裁剪)
```

### Provider Gateway

```
支持平台: OPENAI / ANTHROPIC / GEMINI / DEEPSEEK / GROK + 3 自定义兼容
加密: AES-256-CBC, 密钥来源环境变量, 仅服务端解密
VIP 平台模型: DeepSeek V4 Flash, 前端统一显示"VIP专属模型"
默认配置: 每用户最多 1 个 is_default 配置 (部分唯一索引)
```

### Auth System

```
流程: Email 验证码 → JWT (15min access + 7天 refresh) → JTI blacklist
中间件: middleware.ts → JWT verify → Rate Limit → Context Injection
SSE 认证: 连接建立时 JWT 验证，有效期内不重复
安全: Refresh rotation (一次性使用) + Replay detection
```

### Story Engine (预留)

```
接口文件: src/server/services/story-engine.ts
数据结构: StoryState { currentArc, currentGoal, currentConflict, worldState }
存储: conversations.story_state (JSONB, nullable)
Context 注入: ContextBuilder 优先级 3
状态: Phase 9 仅定义接口，不实施逻辑
```

---

## Action Items

### 立即 (本周)

| # | 行动 | 严重度 |
|---|------|--------|
| 1 | 修复 `findHistory()` 增加 userId (W1.1) | CRITICAL |
| 2 | 修复 `deleteLastAssistant()` 增加 userId (W1.2) | CRITICAL |
| 3 | Greeting 持久化到 DB (W1.3) | HIGH |
| 4 | 修订 `architecture-freeze-report.md`：2→12 角色配额 | LOW |

### 短期 (2-3 周)

| # | 行动 | 严重度 |
|---|------|--------|
| 5 | 创建 `conversations` 表 + migration (W2) | HIGH |
| 6 | 修订 `database-design-constraints.md` V1.3：澄清 Conversation Container vs Tree | MEDIUM |
| 7 | 实现 MemoryExtractor (W3.2) | CRITICAL |
| 8 | 实现 MemoryRetriever (W3.3) | HIGH |

### 中期 (4-6 周)

| # | 行动 | 严重度 |
|---|------|--------|
| 9 | 实现 ContextBuilder (W4.1-W4.4) | HIGH |
| 10 | 删除 Regex 记忆提取 (W3.6) | CRITICAL |
| 11 | 实现 MemoryConsolidator (W3.4) | MEDIUM |
| 12 | 记忆表扩展 (category + reference tracking) (W3.1) | HIGH |

### 长期

| # | 行动 | 严重度 |
|---|------|--------|
| 13 | Redis 替换内存 Rate Limiter (TD-5) | LOW |
| 14 | embedding + pgvector 记忆检索 (Phase 2) | LOW |
| 15 | Story Engine 实施 | FUTURE |
| 16 | Multi-Character Group Chat 架构设计 | FUTURE |
