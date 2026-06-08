# Architecture Index — Single Source of Truth

> **更新时间**: 2026-06-08
> **维护规则**: 每次文档新增/修订后，必须同步更新本索引
> **状态分类**: ACTIVE (有效) / SUPERSEDED (已被替代) / DEPRECATED (已废弃)

---

## ACTIVE (当前有效架构文档)

以下文档定义了叙境的**唯一真相来源**。任何实施必须基于这些文档。

### 产品定义

| 文档 | 路径 | 覆盖范围 |
|------|------|---------|
| 产品定义 V1.0 | `PROJECT_RULES.md` | 完整产品定义、用户体系、星钻系统、MVP 边界、开发铁律 |
| 架构冻结报告 V1.1 | `docs/architecture-freeze-report.md` | 页面地图、模块拆解、技术选型、风险清单 |
| **注** | §1.1: FREE 角色配额应为 **12**（非 2），以 PROJECT_RULES.md 为准 | DRIFT 待修 |

### 数据库设计

| 文档 | 路径 | 覆盖范围 |
|------|------|---------|
| 数据库设计约束 V1.2 | `docs/database-design-constraints.md` | 实体清单(9)、关系(8组)、枚举(9)、索引策略、安全策略 |
| 数据库设计约束 V1.3 | *(待修订)* | 需澄清 Conversation 容器 ≠ Conversation Tree |

### Auth & Security

| 文档 | 路径 | 覆盖范围 |
|------|------|---------|
| Auth 架构 | `docs/auth-architecture.md` | JWT 设计、Refresh Token 旋转、JTI 黑名单 |
| 安全威胁模型 | `docs/security-threat-model.md` | SSRF 防护、SSE 滥用、Replay Attack、Prompt Injection |
| 中间件安全设计 | `docs/middleware-security-design.md` | Middleware 层 Auth + Rate Limiting |
| Redis Auth 设计 | `docs/redis-auth-design.md` | Redis 数据结构 (refresh/blocked/rate) |
| 系统集成地图 | `docs/system-integration-map.md` | 全线数据流 (注册→聊天)、模块依赖图 |

### Phase 6 — API Provider

| # | 文档 | 状态 |
|---|------|------|
| 01 | `docs/phase6/01-api-provider-architecture.md` | ACTIVE |
| 02 | `docs/phase6/02-api-provider-schema-review.md` | ACTIVE |
| 03 | `docs/phase6/03-api-provider-page-design.md` | ACTIVE |
| 04 | `docs/phase6/04-provider-routing-flow.md` | ACTIVE |
| 05 | `docs/phase6/05-provider-validation-rules.md` | ACTIVE |
| 06 | `docs/phase6/06-phase6-final-acceptance.md` | ACTIVE |

### Phase 7 — Character System

| # | 文档 | 状态 |
|---|------|------|
| 01 | `docs/phase7/01-character-architecture.md` | ACTIVE |
| 02 | `docs/phase7/02-character-schema-review.md` | ACTIVE |
| 03 | `docs/phase7/03-character-page-design.md` | ACTIVE |
| 04 | `docs/phase7/04-character-routing-flow.md` | ACTIVE |
| 05 | `docs/phase7/05-character-validation-rules.md` | ACTIVE |

### Phase 7.1 — Character Implementation

| # | 文档 | 状态 |
|---|------|------|
| 06 | `docs/phase7/06-phase7-final-acceptance.md` | ACTIVE |
| 07 | `docs/phase7/07-phase7-implementation-report.md` | ACTIVE |
| 08 | `docs/phase7/08-phase7-hardening-report.md` | ACTIVE |

### Phase 7.2 — Character ↔ Chat Integration

| # | 文档 | 状态 |
|---|------|------|
| 09 | `docs/phase7/09-character-chat-integration.md` | ACTIVE — Prompt 组装已实施 |
| 10 | `docs/phase7/10-character-technical-debt.md` | ACTIVE — TD-1/2 已修复，TD-3~6 待处理 |
| 11 | `docs/phase7/11-character-phase72-acceptance.md` | ACTIVE |
| 12 | `docs/phase7/12-phase72-final-acceptance.md` | ACTIVE |

### Phase 8 — Chat System (Design Freeze)

| # | 文档 | 状态 |
|---|------|------|
| 13 | `docs/phase7/13-chat-system-design.md` | ACTIVE |
| 14 | `docs/phase7/14-chat-ui-spec.md` | ACTIVE |
| 15 | `docs/phase7/15-chat-api-spec.md` | ACTIVE |
| 16 | `docs/phase7/16-phase8-roadmap.md` | ACTIVE |

### Phase 9 — Memory-First Architecture (Design Freeze)

| # | 文档 | 状态 |
|---|------|------|
| 17 | `docs/phase7/17-memory-first-architecture.md` | **ACTIVE — 唯一权威架构** |
| 18 | `docs/phase7/18-phase9-migration-plan.md` | ACTIVE |

### Architecture Audit

| # | 文档 | 状态 |
|---|------|------|
| 00 | `docs/architecture/00-architecture-audit-report.md` | ACTIVE — 本审计报告 |
| 01 | `docs/architecture/00-architecture-index.md` | ACTIVE — 本索引 |

---

## SUPERSEDED (已被后续文档替代)

以下文档已被更新的设计替代，不应再作为实施参考。

| 文档 | 被替代内容 | 替代文档 |
|------|-----------|---------|
| *(暂无 SUPERSEDED 文档)* | — | — |

> 架构冻结报告中的 "FREE 2角色" 是被替代的具体值，但文档整体仍保持 ACTIVE（待修订）。

---

## DEPRECATED (已废弃)

以下设计已在代码或文档中明确废弃，但文件仍存在。

### 代码层 (Code-Level)

| 组件 | 位置 | 废弃原因 | 替换方案 | 删除计划 |
|------|------|---------|---------|---------|
| `_extractMemoriesAsync()` | `chat.service.ts` | Regex 记忆提取 → 记忆污染 | LLM MemoryExtractor | W3.6 |
| `extractFacts()` | `memory.service.ts` | Regex 记忆提取 → 记忆污染 | LLM MemoryExtractor | W3.6 |
| `CONTEXT_MESSAGE_LIMIT = 30` | `chat.service.ts` | 固定条数裁剪 → 无 Token 感知 | ContextBuilder | W4.4 |
| `_buildSystemPrompt()` | `chat.service.ts` | 固定 8 段拼接 → 无优先级 | ContextBuilder | W4.4 |
| `findHistory(characterId)` | `message.repository.ts` | 无 userId 隔离 | `findHistory(characterId, userId)` | W1.1 |
| `deleteLastAssistant(characterId)` | `message.repository.ts` | 无 userId 隔离 | `deleteLastAssistant(characterId, userId)` | W1.2 |

### 文档层 (Doc-Level)

| 文档 | 废弃内容 | 状态 |
|------|---------|------|
| `architecture-freeze-report.md` §1.1 | "FREE 用户 2 个角色" | 实际为 12。文档待修订 |

---

## 文档编号体系

```
Phase 0  (基础架构): docs/architecture-freeze-report.md, system-integration-map, ...
Phase 6  (API Provider): docs/phase6/01-06
Phase 7  (Character):     docs/phase7/01-12
Phase 8  (Chat UI):       docs/phase7/13-16
Phase 9  (Memory-First):  docs/phase7/17-18
Phase 10+ (未来):         docs/phase7/19+ 或 docs/phase10+/
审计文档:                  docs/architecture/
```

### 命名约定

```
[编号]-[主题]-[类型].md

类型:
  architecture      — 架构设计
  schema-review     — Schema 审查
  page-design       — 页面设计
  routing-flow      — 路由流程
  validation-rules  — 校验规则
  acceptance        — 验收标准
  implementation    — 实施报告
  hardening         — 加固报告
  integration       — 集成设计
  technical-debt    — 技术债务
  system-design     — 系统设计
  ui-spec           — UI 规范
  api-spec          — API 规范
  roadmap           — 路线图
  migration-plan    — 迁移计划
```

---

## 跨文档矩阵

### Character 概念一致性

| 属性 | architecture-freeze | database-constraints | 01-character-arch | PROJECT_RULES | 源代码 |
|------|-------------------|---------------------|-------------------|---------------|--------|
| FREE 角色数 | 2 ❌ | — | 12 ✅ | 12 ✅ | 12 ✅ |
| VIP 角色数 | 无限 ✅ | — | 无限 ✅ | 无限 ✅ | 无限 ✅ |
| 软删除 | ✅ | ✅ | ✅ | — | ✅ |
| 官方角色标记 | is_official | is_official | isOfficial | — | isOfficial |
| 导出格式 | Xujing JSON | — | Xujing + Tavern | Xujing / Tavern / SillyTavern | 3 格式 ✅ |

### Memory 概念一致性

| 属性 | database-constraints | 17-memory-first | 18-migration | 源代码 |
|------|---------------------|----------------|-------------|--------|
| 提取方式 | 未指定 | LLM Extractor | W3 实施 | Regex ❌ |
| 分类 | 无 | 6 类 category | W3.1 新增列 | 无 ❌ |
| 检索 | 关键词+importance | MemoryRetriever | W3.3 | 全部注入 ❌ |
| 生命周期 | 物理删除 | Consolidator | W3.4 | 仅创建+删除 ❌ |
| FREE 容量 | 100/角色 | 100/角色 | 不变 | 100 ✅ |
| VIP 容量 | 10000/角色 | 10000/角色 | 不变 | 10000 ✅ |

### Message 概念一致性

| 属性 | database-constraints V1.2 | 17-memory-first | 源代码 |
|------|--------------------------|----------------|--------|
| 扁平线性 | ✅ 明确禁止 Tree | ✅ 维持扁平 | ✅ 扁平 |
| 多会话容器 | 措辞模糊 ("Conversation Tree") | ✅ conversations 表 | 无 ❌ |
| userId 过滤 | 索引有(user_id, character_id) | ✅ 强制 userId | ❌ findHistory 缺少 |
| 重生成 | DELETE + INSERT 覆盖 | 不变 | DELETE + INSERT ✅ |

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| V1.0 | 2026-06-08 | 初始索引。覆盖 Phase 0-9 全部 31 份文档 + 源代码审计 |
