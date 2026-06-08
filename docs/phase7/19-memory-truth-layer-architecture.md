# 19 — Memory Truth Layer Architecture

> **Phase 9.5 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation
> **Builds on**: 17-memory-first-architecture.md, 18-phase9-migration-plan.md, 00-architecture-audit-report.md

---

## 0. 架构目标

### 0.1 问题陈述

Phase 9 的 Memory-First Architecture 解决了"如何提取和检索记忆"，但未解决以下深层问题：

| 问题 | Phase 9 状态 | 本设计目标 |
|------|-------------|-----------|
| 用户搬家了，旧地址记忆还在 | 仅靠 importance 降权，无结构化替换 | **Fact Versioning** — 旧事实标记为 superseded |
| 用户先说我爱猫，后来说我讨厌猫 | 两条独立记忆并存，无矛盾检测 | **Contradiction Detection + Resolution** |
| AI 从 RP 剧情中提取了虚构信息 | 仅 prompt 提示区分，无来源标记 | **Source Tracking** — RP 来源降低 confidence |
| 记忆提取 LLM 输出质量不稳定 | 仅 try/catch + Zod 校验 | **Confidence Scoring** — 自动评估提取可靠性 |
| 连续使用 1 年后记忆无限膨胀 | Consolidator 仅合并相似 + 删除低 importance | **Forgetting Curve** — 自然衰减 + 归档 |
| 用户与角色从陌生人变成恋人 | 旧关系状态手动降 importance | **Relationship Evolution** — 关系变化历史完整保留 |

### 0.2 核心设计原则

```
Truth over Quantity  — 宁可少记，不可错记
Evolution over Static — 记忆随时间演进，不是一次写入永久不变
Confidence over Certainty — 每条记忆都有置信度，系统不假设任何记忆 100% 可靠
Source Transparency   — 记忆来源决定其可信度与生命周期
Companion Longevity   — 所有设计以 3 年连续使用为基准线
```

### 0.3 与 Phase 9 的关系

Phase 9 = Memory System 基础框架（提取/检索/合并）
Phase 9.5 = Memory Truth Layer（真值管理/冲突解决/长期演进）

Phase 9.5 是 Phase 9 的**垂直深化**，不是替代。Phase 9 的 MemoryExtractor / MemoryRetriever / MemoryConsolidator 全部保留，在此基础上增加 Truth Layer。

---

## 第一部分：Memory Truth Layer 审计

### 1.1 Memory Evolution — 事实变更问题

**场景**

```
2026-03：用户说"我住在上海"
  → MemoryExtractor 提取 → { fact: "用户住在上海", category: PROFILE, importance: 0.8 }

2026-06：用户说"我刚搬到东京了"
  → MemoryExtractor 提取 → { fact: "用户搬到东京", category: EXPERIENCE, importance: 0.6 }

2027-01：用户说"东京的生活还不错"
  → 系统仍保留"用户住在上海"这条记忆
```

**Phase 9 的缺陷**

- MemoryExtractor 无"事实更新"概念。每次提取都是新记录。
- MemoryConsolidator 按文本相似度合并（"用户住在上海" vs "用户搬到东京" — 编辑距离大，不会合并）。
- 检索时两条都返回，LLM 看到矛盾信息。

**设计目标**

引入 **Fact Evolution** 机制：当系统检测到一条新事实与旧事实冲突时，不是简单共存，而是：

1. **识别冲突**：新事实在同一个 fact_key 域中与旧事实矛盾
2. **标记替换**：旧事实标记 `superseded_by = new_fact_id`，旧事实 confidence 降低
3. **保留历史**：旧事实不移除，但检索时 priority 降低
4. **版本链**：通过 `superseded_by` 形成版本链，可追溯事实变更历史

### 1.2 Memory Contradiction — 矛盾检测与解决

**场景 A：真实的偏好变化**

```
2026-03："我喜欢猫" → category: PREFERENCE
2026-06："我讨厌猫" → category: PREFERENCE
```

这两条在同一个 fact_key 域中矛盾。系统需要判断：这是偏好变化（永久）还是临时情绪表达。

**场景 B：上下文依赖**

```
与角色A聊天："我喜欢安静的环境"
与角色B聊天："我喜欢热闹的聚会"
```

这不是矛盾，两条记忆属于不同角色，不应合并到同一个 Memory 域。

**场景 C：角色扮演中的虚构**

```
RP 剧情中："我是名侦探，住在贝克街221B"
现实："我是一名程序员，住在北京"
```

RP 中的信息与用户真实信息矛盾，但 RP 信息不应该替换真实信息。

**矛盾解决框架**

```
矛盾检测流程：

1. 新记忆到达 → MemoryValidator.validate(newFact)
2. 查找同一 fact_key 域的已有记忆（same characterId, same userId, same category）
3. 语义矛盾检测（LLM 判断：是否真正矛盾？）
   - "我喜欢猫" vs "我讨厌猫" → 矛盾
   - "我喜欢猫" vs "我最喜欢猫" → 不矛盾（强化）
   - "我喜欢猫" vs "我更喜欢狗了" → 部分矛盾
4. 如果是矛盾 → 进入 Contradiction Resolution

Contradiction Resolution 决策树：

├─ 新事实 source = USER_EXPLICIT, 旧事实 source = ROLEPLAY
│  → 新事实替换旧事实（旧事实标记 superseded，confidence 降至 0.2）
│
├─ 新事实 source = ROLEPLAY, 旧事实 source = USER_EXPLICIT
│  → 新事实不与旧事实冲突（不同域），创建但不替换
│
├─ 两条都是 USER_EXPLICIT / USER_IMPLICIT
│  ├─ 旧事实 confirmed 次数 ≥ 3 → 提示用户确认（"你的偏好好像变了？"）
│  └─ 旧事实 confirmed 次数 < 3 → 新事实替换旧事实（用户可能一开始没说清楚）
│
├─ 两条都是 INFERENCE
│  → 降低两条的 confidence，等待更多证据
│
└─ 新旧事实时间间隔 < 1 小时
   → 视为上下文变化，两条共存，不替换
```

### 1.3 Memory Confidence — 置信度字段体系

**Phase 9 现有**：`importance`（0.0 ~ 1.0）

**Phase 9 的问题**

`importance` 是一个**主观权重**，用于回答"这条记忆有多重要"。但它不回答：

- 这条记忆有多可靠？（LLM 可能提取错误）
- 这条记忆被确认过几次？
- 这条记忆的时效性如何？
- 这条记忆是否可能已被新事实替代？

**引入 Confidence 体系**

| 字段 | 类型 | 范围 | 用途 |
|------|------|------|------|
| `confidence` | NUMERIC(3,2) | 0.00 ~ 1.00 | 记忆的**可靠程度**（客观测量） |
| `importance` | NUMERIC(3,2) | 0.00 ~ 1.00 | 记忆的**重要程度**（主观判断，保留） |
| `last_confirmed_at` | TIMESTAMPTZ | nullable | 最后一次被确认的时间 |
| `confirmation_count` | INTEGER | 0+ | 被确认的次数 |
| `contradiction_count` | INTEGER | 0+ | 被挑战的次数 |

**Confidence 自动计算规则**

```
初始 confidence（基于 source）：

USER_EXPLICIT   → confidence = 0.90  （用户明确说"我是医生"）
USER_IMPLICIT   → confidence = 0.70  （用户说"今天在医院值班"，推断为医生）
INFERENCE       → confidence = 0.50  （AI 从多轮对话推断）
ROLEPLAY        → confidence = 0.30  （RP 中提取，大概率虚构）
SYSTEM_GENERATED → confidence = 0.80 （系统从 profile 生成）

Confidence 调整规则：

确认（同一事实再次出现）  → confidence += 0.05 × (1 - current_confidence)
                            confirmation_count++
矛盾（出现冲突事实）      → confidence -= 0.15 × current_confidence
                            contradiction_count++
时间衰减（未被提及）      → confidence -= 0.01 × days_since_last_confirmed / 30
                            （每月降 1%，最低降至 0.10）
被 supersedeed            → confidence = 0.05
```

**Confidence vs Importance 区别**

| 维度 | confidence | importance |
|------|-----------|------------|
| 含义 | 这条记忆**是真的吗** | 这条记忆**重要吗** |
| 举例 | "用户是医生" — confidence 0.95（被确认 3 次） | "用户的名字叫小王" — importance 1.0 |
| 举例 | "用户喜欢蓝色" — confidence 0.30（RP 中提取） | "用户昨天吃了什么" — importance 0.1 |
| 影响 | 检索时的可信度权重 | 裁剪时的保留优先级 |
| 调控方式 | 自动计算（source + confirmation + time） | LLM 评估 + Consolidator 调整 |

### 1.4 Memory Source Tracking — 来源追踪

**枚举定义**

```
USER_EXPLICIT
  来源：用户直接陈述事实
  示例："我叫张三"、"我今年28岁"、"我是软件工程师"
  confidence 初始值：0.90
  允许进入核心记忆：是
  允许替换已有事实：是（confidence ≥ 旧事实时）
  生命周期：长期保留，直至被新事实替换或用户主动删除

USER_IMPLICIT
  来源：系统从对话中推断（非用户直接陈述）
  示例：用户说"今天去公司加班"→ 推断为上班族
  confidence 初始值：0.70
  允许进入核心记忆：是（但 confidence 较低）
  允许替换已有事实：仅当旧事实 confidence < 0.70
  生命周期：需多次确认后提升 confidence

ROLEPLAY
  来源：角色扮演/剧情对话中的信息
  示例：RP 中用户说"我是魔法师"
  confidence 初始值：0.30
  允许进入核心记忆：否
  允许替换已有事实：否
  生命周期：存储在 RP 专属记忆域，不污染核心记忆
  特殊处理：如果同一事实在非 RP 场景也被确认，升级为 USER_IMPLICIT

INFERENCE
  来源：AI 从多轮对话中综合推断
  示例：用户多次提到编程 → AI 推断"用户可能是程序员"
  confidence 初始值：0.50
  允许进入核心记忆：是（低 confidence，需要验证）
  允许替换已有事实：否（推断不能替换用户明确陈述）
  生命周期：如果被 USER_EXPLICIT 确认 → confidence 提升至 0.85

SYSTEM_GENERATED
  来源：系统自动生成，非用户对话
  示例：从角色 profile 初始化、系统自动推断的偏好
  confidence 初始值：0.80（系统生成通常有依据）
  允许进入核心记忆：是
  允许替换已有事实：否（系统生成不覆盖用户数据）
```

**Source 对检索的影响**

```
检索加权公式：

retrieval_score = text_similarity × importance × confidence × source_weight

source_weight：
  USER_EXPLICIT   → 1.0
  USER_IMPLICIT   → 0.85
  INFERENCE       → 0.65
  SYSTEM_GENERATED → 0.8
  ROLEPLAY        → 0.3（仅在 RP 上下文检索时使用）
```

---

## 第二部分：Memory Schema V2

### 2.1 完整 Schema 设计

```sql
-- ==================================================================
-- memories 表 V3 — Memory Truth Layer
-- ==================================================================

-- 新增枚举
CREATE TYPE memory_source AS ENUM (
  'USER_EXPLICIT',
  'USER_IMPLICIT',
  'ROLEPLAY',
  'INFERENCE',
  'SYSTEM_GENERATED'
);

CREATE TYPE memory_category AS ENUM (
  'IDENTITY',       -- 身份：姓名、年龄、职业、性别
  'RELATIONSHIP',   -- 关系：与角色的关系状态、关系里程碑
  'PREFERENCE',     -- 偏好：喜好、习惯、厌恶
  'GOAL',           -- 目标：长期目标、计划、梦想
  'EXPERIENCE',     -- 经历：重要事件、搬家、换工作
  'PROFILE',        -- 档案：居住地、家庭成员、教育背景
  'KNOWLEDGE'       -- 知识：用户教给角色的信息、共享知识
);

-- 新增枚举
CREATE TYPE memory_fact_type AS ENUM (
  'FACT',           -- 可验证的事实（"我住在北京"）
  'PREFERENCE',     -- 主观偏好（"我喜欢摇滚乐"）
  'RELATIONSHIP',   -- 关系状态（"我们现在是朋友"）
  'EVENT',          -- 一次性事件（"我上个月去了日本"）
  'OPINION',        -- 观点（"我觉得AI很有用"）
  'GOAL'            -- 目标（"我想明年买房"）
);

-- ==================================================================
-- memories 表 — V3 完整列定义
-- ==================================================================

ALTER TABLE memories ADD COLUMN IF NOT EXISTS
  -- 核心标识
  fact_key         VARCHAR(200),           -- 事实键。同域内唯一标识一条事实。
                                           -- 格式: "{category}:{normalized_key}"
                                           -- 例: "PROFILE:residence_city"
                                           -- 例: "PREFERENCE:music_genre"
                                           -- 例: "IDENTITY:occupation"

  fact_type        memory_fact_type NOT NULL DEFAULT 'FACT',
                                           -- 事实类型。影响生命周期和冲突处理策略

  -- 置信度体系
  confidence       NUMERIC(3,2) NOT NULL DEFAULT 0.50,
                                           -- 可靠程度 (0.00-1.00)。自动计算，非人工设定

  confirmation_count INTEGER NOT NULL DEFAULT 0,
                                           -- 被确认次数。每次同一事实再现 +1

  contradiction_count INTEGER NOT NULL DEFAULT 0,
                                           -- 被挑战次数。每次矛盾事实出现 +1

  last_confirmed_at TIMESTAMPTZ,
                                           -- 最后一次被确认的时间

  -- 来源追踪
  source           memory_source NOT NULL DEFAULT 'INFERENCE',
                                           -- 信息来源。决定 confidence 初始值和替换策略

  -- 版本管理
  superseded_by    UUID REFERENCES memories(id),
                                           -- 被哪条新记忆替代。NULL = 当前有效
                                           -- 形成版本链: v1 → v2 → v3 → NULL(current)

  version          INTEGER NOT NULL DEFAULT 1,
                                           -- 事实版本号。每次被新事实替换时递增

  -- 使用追踪（Phase 9 已有，保留）
  last_referenced_at TIMESTAMPTZ,
  reference_count  INTEGER NOT NULL DEFAULT 0,

  -- 分类与权重（Phase 9 已有，保留）
  category         memory_category NOT NULL DEFAULT 'PROFILE',
  importance       NUMERIC(3,2) NOT NULL DEFAULT 0.50,

  -- 时间戳
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
;

-- ==================================================================
-- 新增索引
-- ==================================================================

-- fact_key 索引：同域内唯一 active 事实
CREATE UNIQUE INDEX idx_memories_fact_key_active
  ON memories (character_id, user_id, fact_key)
  WHERE superseded_by IS NULL AND confidence > 0.30;

-- Source 索引：按来源过滤
CREATE INDEX idx_memories_source ON memories (source);

-- Confidence 复合索引：检索时按 confidence 排序
CREATE INDEX idx_memories_confidence ON memories (character_id, user_id, confidence DESC);

-- Fact Type 索引
CREATE INDEX idx_memories_fact_type ON memories (fact_type);

-- 版本链索引：追溯事实变更历史
CREATE INDEX idx_memories_superseded ON memories (superseded_by);

-- 确认时间索引：用于时间衰减计算
CREATE INDEX idx_memories_last_confirmed ON memories (last_confirmed_at);
```

### 2.2 字段用途说明

| 字段 | 用途 | 谁写入 | 谁读取 |
|------|------|--------|--------|
| `fact_key` | 同域事实唯一标识。MemoryValidator 用它检测新旧事实是否属于同一域 | MemoryValidator | MemoryValidator, MemoryRetriever |
| `fact_type` | 决定冲突处理策略。FACT 可替换，OPINION 不可替换，EVENT 不参与冲突检测 | MemoryExtractor | MemoryValidator |
| `confidence` | 检索时的可信度权重。低 confidence 记忆可能被过滤 | MemoryValidator(自动计算) | MemoryRetriever, ContextBuilder |
| `confirmation_count` | confidence 提升的依据。高确认次数 → 高置信 | MemoryValidator | MemoryConsolidator |
| `contradiction_count` | 标记争议性。高矛盾次数 → 可能触发用户确认 | MemoryValidator | ContextBuilder(提示用户) |
| `last_confirmed_at` | 时间衰减的基准。越久未确认 → confidence 越低 | MemoryValidator | MemoryConsolidator(forgetting) |
| `source` | 决定初始 confidence 和可否替换用户事实 | MemoryExtractor | MemoryValidator, MemoryRetriever |
| `superseded_by` | 版本链。追溯"我为什么不再认为用户住在上海" | MemoryValidator | ContextBuilder(展示历史) |
| `version` | 事实变更次数。高频变更 → 降低新版本的 confidence | MemoryValidator | MemoryValidator |

### 2.3 fact_key 命名规范

```
格式: {category}:{normalized_key}

IDENTITY:occupation         → "用户是医生"
IDENTITY:age               → "用户今年28岁"
IDENTITY:name              → "用户叫张三"

PROFILE:residence_city     → "用户住在北京"
PROFILE:education          → "用户本科毕业"
PROFILE:family_members     → "用户有一个妹妹"

PREFERENCE:music_genre     → "用户喜欢摇滚乐"
PREFERENCE:food_cuisine    → "用户喜欢日料"
PREFERENCE:activity        → "用户喜欢跑步"

RELATIONSHIP:state         → "用户与角色是恋人关系"
RELATIONSHIP:milestone     → "用户与角色第一次约会"

GOAL:career                → "用户想成为架构师"
GOAL:travel                → "用户想去冰岛"

EXPERIENCE:move            → "用户去年搬到了北京"
EXPERIENCE:job_change      → "用户3月换了工作"

KNOWLEDGE:shared_topic     → "用户教角色关于摄影的知识"

normalized_key 规则：
- 全部小写
- 使用下划线分隔
- 抽象化具体值（residence_city，不是 beijing）
- 同 category 内唯一
```

---

## 第三部分：Memory Lifecycle V2

### 3.1 完整生命周期状态机

```
                    ┌──────────────────────────────────────┐
                    │            Memory Lifecycle           │
                    └──────────────────────────────────────┘

  [对话完成]
       │
       ▼
  ┌─────────┐    失败/空    ┌──────────┐
  │ EXTRACT │──────────────▶│ DISCARDED │ (解析失败、不符合保留标准)
  └────┬────┘               └──────────┘
       │ 成功
       ▼
  ┌─────────┐    重复/低置信  ┌──────────┐
  │VALIDATE │────────────────▶│DISCARDED  │
  └────┬────┘                 └──────────┘
       │ 通过
       ▼
  ┌─────────┐
  │  STORE  │ ← confidence 初始值基于 source 自动计算
  └────┬────┘
       │
       ├─────────────────────────────────────────────┐
       ▼                                             ▼
  ┌──────────┐                                ┌──────────┐
  │  ACTIVE  │◀──── 确认 ────┐                │ SUPERSEDED│
  │(confidence│              │                │(被新事实  │
  │ ≥ 0.30)  │              │                │ 替换)     │
  └────┬─────┘              │                └─────┬─────┘
       │                     │                      │
       │ 随时间衰减           │                      │ 30天后
       │ confidence 下降      │                      ▼
       ▼                     │                ┌──────────┐
  ┌──────────┐               │                │ ARCHIVED │
  │ UNCERTAIN│── 被重新确认 ──┘                │(仅保留   │
  │(confidence│                                 │ 版本链)  │
  │ 0.10-0.30│                                 └──────────┘
  └────┬─────┘
       │ 持续衰减
       │ confidence < 0.10
       ▼
  ┌──────────┐
  │ FORGOTTEN│ ← 物理删除（或归档）
  └──────────┘
```

### 3.2 各阶段详细说明

**阶段 1：EXTRACT（提取）**

```
触发：每轮对话完成后异步执行
执行者：MemoryExtractor
输入：最近 10 条消息（user + assistant）
输出：ExtractedMemory[] — { fact, category, fact_type, importance, source }

新增职责（Phase 9.5）：
  - 输出中增加 fact_type 和 source 字段
  - 对每条提取的记忆，LLM 同时输出 source 判断依据
  - 同一轮提取中如果出现多条同一 fact_key 的记忆 → 合并为最新
```

**阶段 2：VALIDATE（校验）**

```
触发：MemoryExtractor 输出后
执行者：MemoryValidator（新组件）
输入：ExtractedMemory[] + 已有 Memory[]
输出：ValidatedMemory[] — 过滤 + 冲突解决后的记忆

校验步骤：

Step 1: 基本校验
  - Zod schema 验证（字段类型、枚举值、范围）
  - confidence < 0.10 → 直接 DISCARDED
  - content 长度 < 3 → 直接 DISCARDED
  - content 含敏感词 → 标记需人工审核（或此次版本直接丢弃）

Step 2: 重复检测
  - 查找同一 (characterId, userId, fact_key) 的已有 ACTIVE 记忆
  - 如果存在且语义相似度 > 0.85 → 视为"确认"
    → 更新已有记忆的 confidence、confirmation_count、last_confirmed_at
    → 新记忆 DISCARDED（确认已有记忆，不创建新记录）

Step 3: 矛盾检测（最关键的新步骤）
  - 查找同一 fact_key 的已有 ACTIVE 记忆
  - 如果语义相似度 < 0.3（明显不同）→ 可能矛盾
  - LLM 判断：是否真正矛盾？
    → 矛盾 → 进入 Contradiction Resolution（见 §1.2）
    → 不矛盾（语义不同的不同事实）→ 两者共存

Step 4: 来源评级
  - source = ROLEPLAY 且 confidence < 0.30 → 仅存储为 RP_CONTEXT，不进入核心记忆检索
  - source = INFERENCE 且已有 USER_EXPLICIT 同 fact_key → 不替换
```

**阶段 3：STORE（存储）**

```
触发：VALIDATE 通过后
执行者：MemoryRepository.create() 或 MemoryRepository.update()
操作：
  - 全新记忆 → INSERT（confidence 按 source 规则自动初始化）
  - 确认已有记忆 → UPDATE（confidence += delta, confirmation_count++）
  - 替换已有记忆 → UPDATE 旧记忆（superseded_by = new_id, confidence = 0.05）
                 + INSERT 新记忆（version = old.version + 1）
  - RP 记忆 → INSERT（但 category 标记或单独表/字段标记为 RP）
```

**阶段 4：RETRIEVE（检索）**

```
触发：用户发消息 → ContextBuilder.build()
执行者：MemoryRetriever
输入：当前消息 query + characterId + userId
输出：Top K 相关记忆（默认 10 条）

Phase 9.5 增强：

1. 过滤：
   - 排除 superseded_by IS NOT NULL 的记忆
   - 排除 confidence < 0.30 的记忆（UNCERTAIN 不进入上下文）
   - 排除 source = ROLEPLAY 的记忆（除非当前对话明确是 RP 模式）

2. 排序：
   retrieval_score = text_similarity × importance × confidence × source_weight × recency_factor

   recency_factor = 1.0 / (1 + days_since_last_referenced / 14)
   （两周不引用 → 权重减半）

3. 去重：
   - 同一 fact_key 多条记忆 → 只保留 confidence 最高的一条

4. 注入：
   - 排序后取 Top K
   - 每条记忆注入格式：
     【记忆 · confidence 0.92】用户住在北京（上次确认：3天前）
```

**阶段 5：UPDATE（更新）**

```
触发：
  - 用户主动编辑记忆（未来功能）
  - MemoryValidator 检测到确认/矛盾
  - MemoryConsolidator 周期性维护

更新操作类型：

1. 确认更新：
   confidence += 0.05 * (1 - confidence)
   confirmation_count += 1
   last_confirmed_at = now()

2. 矛盾降级：
   confidence -= 0.15 * confidence
   contradiction_count += 1

3. 替换版本：
   旧记忆：superseded_by = new_id, confidence = 0.05
   新记忆：version = old.version + 1, superseded_by = NULL

4. 时间衰减：
   days_since = (now() - last_confirmed_at) / 86400
   confidence -= 0.01 * days_since / 30
   （30天降1%，但最低降至 0.10）

5. 重要性调整：
   由 MemoryConsolidator 根据 reference_count 提升 importance
```

**阶段 6：CONSOLIDATE（合并）**

```
触发：定时任务（每 6 小时或每 50 条新消息）
执行者：MemoryConsolidator（Phase 9 已有，Phase 9.5 增强）

Phase 9.5 新增操作：

1. 版本链压缩：
   - 对同一 fact_key 的版本链（v1 → v2 → v3）
   - 保留 v1（历史）、v3（当前）
   - v2 如果 confidence < 0.10 → ARCHIVED
   - 版本链超过 5 条时，压缩中间版本

2. 矛盾记忆清理：
   - 同一 fact_key 下有两条以上 ACTIVE 记忆
   - 两条都 confidence < 0.40 → 标记需用户确认
   - 一条 confidence > 0.80 一条 < 0.30 → 低 confidence 标记为 SUPERSEDED

3. 低价值记忆降级：
   - confidence < 0.10 超过 14 天 → FORGOTTEN
   - last_referenced_at 超过 180 天 → importance -= 0.1
   - reference_count = 0 超过 90 天 → importance *= 0.5

4. RP 记忆清理：
   - source = ROLEPLAY 的记忆超过 30 天未引用 → FORGOTTEN
   - RP 记忆不进入 Consolidator 的合并逻辑（独立管理）
```

**阶段 7：ARCHIVE（归档）**

```
触发条件：
  - superseded 超过 30 天
  - confidence < 0.10 且 last_referenced_at 超过 90 天
  - 版本链中间版本

归档操作：
  ─ 不物理删除
  ─ 从主要检索索引中移除
  ─ 存储在独立归档表或标记 archived = TRUE
  ─ 仅版本追溯/用户主动查看历史时访问

归档不可逆（除非用户手动恢复）
```

**阶段 8：FORGET（遗忘）**

```
触发条件：
  - ARCHIVED 超过 180 天
  - 用户明确要求删除
  - 角色被删除（CASCADE）

遗忘操作：
  - 物理删除记忆记录
  - 不可恢复
  - 记录遗忘日志（可选，用于系统改进）
```

---

## 第四部分：Long-Term Companion Simulation

### 4.1 模拟参数

```
假设：
  - VIP 用户，每日活跃
  - 每天进行 20 轮对话
  - 每轮对话提取 5 条记忆（平均）
  - 记忆提取准确率 85%（LLM 提取）
  - 文本匹配检索
```

### 4.2 3 个月模拟

```
数据规模：
  - 总消息数：20 × 90 = 1,800 条
  - 提取记忆：5 × 90 = 450 条（去重后约 300 条）
  - 其中核心记忆（confidence ≥ 0.50）：约 200 条
  - 其中关系变化：约 5-10 条

Phase 9 风险分析：

  ┌─────────────────────────────────────────────────────┐
  │ 记忆膨胀：✅ 低风险                                   │
  │   300 条记忆在 VIP 10000 容量内微不足道              │
  │                                                     │
  │ 记忆冲突：⚠️ 中风险                                   │
  │   首次出现偏好变化（如搬家、换工作）                  │
  │   旧记忆与新记忆并存，LLM 可能引用旧信息              │
  │                                                     │
  │ Token 爆炸：✅ 低风险                                 │
  │   Top 10 记忆 × 50 chars ≈ 500 chars ≈ 125 tokens   │
  │                                                     │
  │ 检索失效：⚠️ 中风险                                   │
  │   关键词匹配精度低，相关记忆可能排不进来               │
  │                                                     │
  │ 人设漂移：✅ 低风险                                   │
  │   3 个月内人与角色的关系仍在建立中                    │
  └─────────────────────────────────────────────────────┘

Phase 9.5 改进效果：
  → 冲突自动检测 + superseded 标记 → 旧地址不会与新地址共存
  → confidence 排序过滤 → 低 confidence 记忆不进入上下文
```

### 4.3 6 个月模拟

```
数据规模：
  - 总消息数：20 × 180 = 3,600 条
  - 提取记忆：5 × 180 = 900 条（去重后约 600 条）
  - 其中核心记忆：约 350 条
  - 其中版本链（同一 fact_key 的变更历史）：约 20-30 条
  - 其中关系里程碑：约 15-20 条

Phase 9 风险分析：

  ┌─────────────────────────────────────────────────────┐
  │ 记忆膨胀：⚠️ 中风险                                   │
  │   600 条在容量内，但 Consolidator 如果效果不佳会积累  │
  │                                                     │
  │ 记忆冲突：🔴 高风险                                   │
  │   用户可能经历了 2-3 次生活变化                       │
  │   搬家、换工作、关系变化                              │
  │   旧记忆与新模式冲突严重                              │
  │                                                     │
  │ Token 爆炸：✅ 低风险                                 │
  │   Top 10 × 仍可控                                    │
  │                                                     │
  │ 检索失效：⚠️ 中风险                                   │
  │   600 条中做 Top 10，关键词匹配越来越不准              │
  │                                                     │
  │ 人设漂移：⚠️ 中风险                                   │
  │   角色可能开始"记住"了一些 RP 信息                    │
  └─────────────────────────────────────────────────────┘

Phase 9.5 改进效果：
  → 版本链管理 → 同一 fact_key 最多保留 3 个版本
  → source 过滤 → RP 记忆不进入核心检索
  → 每季度 Consolidator 运行 → 清理低价值记忆
```

### 4.4 1 年模拟

```
数据规模：
  - 总消息数：20 × 365 = 7,300 条
  - 提取记忆：5 × 365 = 1,825 条（去重后约 1,000 条）
  - 其中核心记忆：约 500 条
  - 其中版本链历史：约 50-80 条
  - 其中关系里程碑：约 30-50 条

Phase 9 风险分析：

  ┌─────────────────────────────────────────────────────┐
  │ 记忆膨胀：🔴 高风险                                   │
  │   1,000 条记忆，其中至少 30% 是过时的                  │
  │   Phase 9 Consolidator 的文本相似度合并在大数据集下    │
  │   可能失效（不同表述的同一事实不会合并）               │
  │                                                     │
  │ 记忆冲突：🔴 高风险                                   │
  │   一年内至少发生 5-10 次重大生活变化                   │
  │   每次变化产生 2-5 条冲突记忆                         │
  │   累积冲突 50+ 条                                     │
  │                                                     │
  │ Token 爆炸：⚠️ 中风险                                 │
  │   Top 10 记忆如果每条 100+ chars → 250+ tokens       │
  │   加上 system prompt + history → 逼近预算             │
  │                                                     │
  │ 检索失效：🔴 高风险                                   │
  │   1,000 条记忆中做文本匹配                            │
  │   关键词"北京"可能匹配到 20 条记忆                    │
  │   时间衰减缺失 → 旧新记忆权重相同                     │
  │                                                     │
  │ 人设漂移：⚠️ 中风险                                   │
  │   角色积累了 1 年的对话记录                           │
  │   系统 prompt 可能被大量低质记忆稀释                   │
  └─────────────────────────────────────────────────────┘

Phase 9.5 改进效果：
  → fact_key 唯一索引 → 每个事实域最多 1 条 active 记忆
  → 版本链归档 → 历史版本不影响检索
  → 时间衰减 → 一年未确认的记忆 confidence 降至 0.10
  → 低 confidence 过滤 → 检索结果中自动排除不可靠记忆
  → source = ROLEPLAY 完全隔离 → 核心记忆库保持干净
```

### 4.5 3 年模拟

```
数据规模：
  - 总消息数：20 × 365 × 3 = 21,900 条
  - 提取记忆：5 × 1095 = 5,475 条（去重后约 2,500 条 core + 1,500 条 archived）
  - 其中 active 核心记忆：约 500-800 条（大量已被替换、衰减、归档）
  - 其中版本链总长：约 200 条
  - 其中关系里程碑：约 80-120 条

Phase 9 风险分析：

  ┌─────────────────────────────────────────────────────┐
  │ 记忆膨胀：🔴🔴 极高风险                                │
  │   2,500 条 active 记忆在 VIP 10000 容量内              │
  │   但检索性能崩溃（全量文本匹配 O(n)）                  │
  │   Phase 2 的 pgvector 成为强制依赖                    │
  │                                                     │
  │ 记忆冲突：🔴🔴 极高风险                                │
  │   用户 3 年内的生活轨迹变化巨大                        │
  │   可能有 10+ 次搬家/换工作/关系变化                    │
  │   如果没有结构化 fact_key 管理，冲突数量爆炸           │
  │                                                     │
  │ Token 爆炸：🔴 高风险                                  │
  │   Top 10 从 2,500 条中检索                            │
  │   文本匹配噪声极大 → 可能返回不相关内容                │
  │   不相关内容浪费 Token 且误导 LLM                     │
  │                                                     │
  │ 检索失效：🔴🔴 极高风险                                │
  │   O(n) 文本匹配在 n=2500 时不可接受                   │
  │   每次检索遍历全部记忆                                │
  │   耗时 > 100ms                                       │
  │                                                     │
  │ 人设漂移：🔴 高风险                                    │
  │   角色积累了 3 年历史                                 │
  │   如果没有 confidence 过滤                            │
  │   低质量记忆和高质量记忆权重相同                       │
  │   角色可能引用 3 年前的过时信息                        │
  └─────────────────────────────────────────────────────┘

Phase 9.5 改进效果：
  → fact_key 唯一索引 + active 过滤 → 实际检索集约 500-800 条
  → 低 confidence 记忆被排除
  → 需要 pgvector + embedding（Phase 2）
  → Confidence × recency 双重加权 → 最新最可靠的记忆排最前
  → 版本链归档 → 历史可追溯但不参与检索
```

---

## 第五部分：Relationship Memory Architecture

### 5.1 Phase 9 方案的充分性评估

Phase 9 方案：RELATIONSHIP category + importance=1.0 标记当前状态。

**评估：基础可用，但不充分。**

| 场景 | Phase 9 能力 | 缺口 |
|------|------------|------|
| 从陌生人变成朋友 | ✅ 可记录新状态 | ❌ 无法追溯变化过程 |
| 关系中的关键事件 | ❌ 无专门 EVENT 类型 | 第一次约会、第一次表白等无法结构化存储 |
| 关系倒退（恋人→朋友） | ⚠️ 旧状态降 importance | ❌ 无法分析为什么关系倒退 |
| 用户与多个角色都有关系 | ⚠️ 各自独立记忆 | ❌ 无法进行跨角色关系分析 |
| 关系里程碑庆祝 | ❌ 完全无支持 | 如"认识一周年" |

### 5.2 Relationship Memory 增强方案

**方案：RELATIONSHIP category 内部结构化 + 关系时间线**

```
RELATIONSHIP 记忆的三种子类型（通过 fact_type 区分）：

1. RELATIONSHIP 类型（fact_type = 'RELATIONSHIP'）
   当前关系状态
   示例: "关系状态: LOVER"
   规则: 同一 characterId + userId 下，同一 fact_key 只能有一条 ACTIVE
         fact_key = "RELATIONSHIP:state"
         状态变化时 → 旧状态标记 superseded，新状态写入

2. EVENT 类型（fact_type = 'EVENT'）
   关系里程碑事件
   示例: "第一次约会"、"第一次表白"、"认识一周年"
   规则: 不可被替换（事件是历史，不会"过时"）
         fact_key = "RELATIONSHIP:milestone_{timestamp}"
         长期保留，importance 由时间决定（周年 > 日常）

3. EXPERIENCE 类型（fact_type = 'EXPERIENCE'）
   共享经历
   示例: "一起去了迪士尼"、"一起看了电影《XXX》"
   规则: 同 EVENT，不可替换
         fact_key = "RELATIONSHIP:shared_{timestamp}"
         与普通 EXPERIENCE 的区别：tagged 为 shared
```

**关系时间线**

```
ContextBuilder 注入时：
  1. 提取最新 RELATIONSHIP state 记忆
  2. 提取最近 3 条 RELATIONSHIP EVENT 记忆
  3. 提取最近 5 条 shared EXPERIENCE 记忆
  4. 组装为：
     【你们的关系】你们现在是恋人关系（自2026-06-01起）
     【关系里程碑】2026-06-01: 第一次表白
                   2026-07-15: 第一次约会
     【共享经历】2026-08-20: 一起去了迪士尼
                 2026-09-01: 一起看了电影
```

**关系状态枚举（扩展）**

```
STRANGER       → 陌生人（初始状态，通常不存储）
ACQUAINTANCE   → 认识的人
FRIEND         → 朋友
CLOSE_FRIEND   → 密友
CRUSH          → 暗恋/暧昧
LOVER          → 恋人
PARTNER        → 伴侣/长期伴侣
FAMILY_LIKE    → 像家人一样
EX_PARTNER     → 前任（关系倒退但不删除历史）
RIVAL          → 对手/敌人
MENTOR         → 导师
STUDENT        → 学生
CUSTOM         → 自定义（允许用户通过自然语言定义）
```

### 5.3 禁止项（重申）

```
绝对禁止：
  ❌ 好感度数值（+5好感）
  ❌ 亲密度数值
  ❌ 爱情值数值
  ❌ 关系等级（Lv1/Lv2/Lv3）
  ❌ 关系进度条
  ❌ 任何数值化的关系度量

允许：
  ✅ 自然语言关系状态
  ✅ 关系变化历史（时间线）
  ✅ 共享经历记录
  ✅ 关系里程碑（自然语言描述）
  ✅ 通过对话自然演进（LLM 判断关系变化，而非公式计算）
```

---

## 第六部分：Story Engine Compatibility Review

### 6.1 Story Engine 定义（未来）

```
World System：
  - 世界书（World Book）：角色所在世界的设定、地点、规则
  - 世界状态（World State）：随时间变化的世界事件

Story Engine：
  - 剧情弧（Story Arc）：长期剧情线
  - 剧情节点（Story Beat）：触发特定剧情的关键事件
  - 剧情状态（Story State）：当前剧情进度

Multi-Character：
  - 多个角色同时参与对话
  - 角色之间的记忆共享/隔离
  - 群聊中的关系动态
```

### 6.2 Memory Truth Layer 对 Story Engine 的兼容性

| Story Engine 需求 | Memory Truth Layer 兼容性 | 说明 |
|------------------|--------------------------|------|
| World State 记忆 | ✅ 兼容 | 可通过 category=KNOWLEDGE 存储世界状态；fact_key 隔离世界事实 |
| Story Arc 推进 | ✅ 兼容 | 通过 EXPERIENCE + EVENT 类型记录剧情节点 |
| Story State 注入 | ✅ 兼容 | ContextBuilder 预留了 StoryState 注入点（优先级 3） |
| 角色间记忆隔离 | ✅ 兼容 | 每条记忆已有 characterId + userId 双键 |
| 角色间记忆共享 | ⚠️ 需要设计 | 需要引入"共享记忆"概念（多个 characterId 可见同一记忆） |
| 多角色群聊 | ⚠️ 需要设计 | 群聊中"谁说了什么"需要归属于 conversation + character |
| 剧情中的 RP 记忆 | ✅ 兼容 | source=ROLEPLAY 不会污染核心记忆库 |
| World 事实 vs User 事实 | ✅ 兼容 | fact_key 的 category 区分了世界事实(KNOWLEDGE)和用户事实 |

### 6.3 潜在冲突与解决方案

**冲突 1：Story State 与 Memory 的边界模糊**

```
问题：剧情中"角色受伤了"是 Memory 还是 Story State？

解决：
  - 属于角色状态变化 → Memory（category=KNOWLEDGE, fact_key="CHARACTER_STATE:health"）
  - 属于剧情进度 → Story State（StoryEngine 管理，不在 Memory 中）
  - 判断标准：是否影响未来对话？→ 如果是，两者都存
```

**冲突 2：Multi-Character 中的共享记忆**

```
问题：用户和角色A、角色B一起的经历 → 存在谁的 Memory 中？

解决：
  - 新增 concept of "SharedMemory"
  - shared_memory 表：(id, experience_id, character_ids[], content, ...)
  - 检索时：如果用户在和角色A聊天，检索角色A的 Memory + 包含角色A的 SharedMemory
  - 不在 Phase 9.5 范围内，预留设计即可
```

**冲突 3：World 事实与用户事实的置信度不同**

```
问题：World 事实"这个世界有魔法"和用户事实"我是程序员"的 confidence 处理方式不同

解决：
  - World 事实的 confidence 永远为 1.0（世界观设定，不会被用户推翻）
  - 通过 source=SYSTEM_GENERATED + category=KNOWLEDGE 标记
  - MemoryValidator 的冲突检测跳过 source=SYSTEM_GENERATED 的记忆
```

---

## 第七部分：Migration Plan

### 7.1 迁移路径

Phase 9.5 是对 Phase 9 Wave 3 (Memory Engine) 的深化，不影响 Wave 1-2。

```
Phase 9 Wave 1 (安全隔离) → 不涉及，正常执行
Phase 9 Wave 2 (Conversation) → 不涉及，正常执行
Phase 9 Wave 3 (Memory Engine) → 在 Phase 9.5 设计基础上实施

Phase 9.5 迁移分两个子阶段：

Phase 9.5a（Schema + Validator）
  - 新增 memories 表列：fact_key, fact_type, confidence, source, superseded_by, version
  - 新增 confirmation_count, contradiction_count, last_confirmed_at
  - 新增枚举：memory_source, memory_fact_type
  - 新增索引：6 个
  - 新建 MemoryValidator
  - 已有数据迁移：fact_key 从 content 自动生成（LLM 批量处理）
                   source 全部标记为 INFERENCE（历史数据不可追溯）
                   confidence 全部初始化为 0.50
  - 时间：1 周

Phase 9.5b（Lifecycle + Consolidator V2）
  - MemoryExtractor 增加 fact_type 和 source 输出
  - MemoryValidator 实现完整校验流程（重复检测、矛盾检测、来源评级）
  - MemoryConsolidator 增加版本链压缩、RP 清理、时间衰减
  - MemoryRetriever 增加 confidence 过滤、source 过滤、recency 加权
  - 时间：2 周
```

### 7.2 Schema Migration SQL 摘要

```sql
-- 新增枚举
CREATE TYPE memory_source AS ENUM (...);
CREATE TYPE memory_fact_type AS ENUM (...);

-- 新增列（全部 nullable 或带 default）
ALTER TABLE memories ADD COLUMN fact_key VARCHAR(200);
ALTER TABLE memories ADD COLUMN fact_type memory_fact_type NOT NULL DEFAULT 'FACT';
ALTER TABLE memories ADD COLUMN confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50;
ALTER TABLE memories ADD COLUMN source memory_source NOT NULL DEFAULT 'INFERENCE';
ALTER TABLE memories ADD COLUMN superseded_by UUID REFERENCES memories(id);
ALTER TABLE memories ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE memories ADD COLUMN confirmation_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN contradiction_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN last_confirmed_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 新增索引（6 个，参见 §2.1）

-- 数据迁移
UPDATE memories SET
  source = 'INFERENCE',
  confidence = 0.50,
  fact_key = generate_fact_key(content, category)  -- 需要自定义函数或应用层处理
WHERE fact_key IS NULL;
```

### 7.3 向后兼容声明

```
Phase 9.5 新增字段全部带 DEFAULT：
  - fact_key: NULL（允许为空，旧记忆暂时不分配 fact_key）
  - confidence: 0.50（与旧 importance 行为兼容）
  - source: 'INFERENCE'（历史数据保守标记）
  - superseded_by: NULL（默认未被替换）

MemoryRetriever 在检索时：
  - 如果 fact_key 为 NULL → 跳过 fact_key 相关的去重/过滤逻辑
  - 旧记忆全部参与检索（使用默认 confidence 0.50）

新记忆：
  - fact_key 必填（MemoryValidator 拒绝无 fact_key 的新记忆）
  - source 必填（MemoryExtractor 输出中必须包含）
  - confidence 自动计算

渐进式迁移：旧记忆在 Consolidator 下次运行时逐步分配 fact_key
```

---

## 附录 A：新增组件总览

| 组件 | 状态 | 职责 |
|------|------|------|
| MemoryExtractor | 修改（新增输出字段） | 提取时输出 fact_type + source |
| MemoryValidator | **新增** | 校验 + 重复检测 + 矛盾检测 + 冲突解决 |
| MemoryRetriever | 修改（增强排序） | confidence 过滤 + source 过滤 + recency 加权 |
| MemoryConsolidator | 修改（增强操作） | 版本链压缩 + RP 清理 + 时间衰减 |
| MemoryRepository | 修改（新增方法） | 按 fact_key 查询、版本链查询、source 过滤查询 |

---

## 附录 B：与传统 Memory 方案的对比

| 特性 | 传统方案（Replika/Kindroid） | Phase 9 | Phase 9.5 |
|------|---------------------------|---------|-----------|
| 记忆提取 | 规则/关键词 | LLM Extractor | LLM Extractor + source 标记 |
| 记忆存储 | 纯文本列表 | content + importance + category | + fact_key + confidence + version chain |
| 事实变更 | 堆积（旧事实不在新事实被忽略） | 仅 importance 降权 | 结构化 superseded + 版本链 |
| 矛盾检测 | 无 | 无 | LLM 判断 + 自动解决/提示用户 |
| 置信度 | 无 | 无 | confidence 自动计算（source + 确认次数 + 时间衰减） |
| 来源追踪 | 无 | 无 | 5 种 source（USER_EXPLICIT → ROLEPLAY） |
| 检索 | 全量注入 | Top K 文本匹配 | Top K × confidence × recency × source |
| RP 隔离 | 无（记忆污染） | Prompt 提示区分 | source=ROLEPLAY 完全隔离 |
| 1 年记忆质量 | 严重退化 | 中度退化 | 低退化（active 记忆 500-800 条，经版本管理 + 衰减） |
| 3 年记忆质量 | 不可用 | 不可用 | 可用（需 pgvector Phase 2 支持） |

---

## 附录 C：Fact Evolution 详细场景分析

### C.1 场景：用户搬家

时间线：
  2026-01-15: 用户说"我住在上海浦东"
    → MemoryExtractor 提取：
      fact: "用户住在上海浦东"
      fact_key: "PROFILE:residence_city"
      fact_type: "FACT"
      source: "USER_EXPLICIT"
      importance: 0.75
      confidence: 0.90 (USER_EXPLICIT 初始值)

  2026-03-20: 用户说"浦东这边最近修路好烦"
    → MemoryExtractor 提取：包含"住在浦东"的隐含信息
    → MemoryValidator 检测：
      fact_key "PROFILE:residence_city" 已存在
      语义相似度 > 0.85 → 视为确认
    → 更新已有记忆：
      confidence: 0.90 → 0.945 (确认提升)
      confirmation_count: 1 → 2
      last_confirmed_at: 2026-03-20

  2026-07-01: 用户说"我搬家了，现在在东京"
    → MemoryExtractor 提取：
      fact: "用户搬到了东京"
      fact_key: "PROFILE:residence_city"
      fact_type: "FACT"
      source: "USER_EXPLICIT"
    → MemoryValidator 矛盾检测：
      同一 fact_key，语义相似度 < 0.3（上海 ≠ 东京）
      → 判定为矛盾
    → Contradiction Resolution：
      旧事实确认次数 = 2，有一定可信度
      但新事实 source = USER_EXPLICIT（明确声明）
      → 替换：旧事实 superseded_by = 新记忆ID, confidence = 0.05
      → 新记忆 version = 2, confidence = 0.85（版本变化略降）
    → 结果：
      检索时只返回"用户住在东京"（version 2, ACTIVE）
      版本链可追溯：v1 "上海浦东" → v2 "东京"

  2026-07-15: 用户说"东京的物价真贵"
    → 隐含确认当前居住地
    → confidence 提升至 0.89
    → confirmation_count++

### C.2 场景：偏好真正的变化 vs 临时情绪

场景 A — 真实偏好变化：

  2026-01: "我喜欢摇滚乐" → PREFERENCE:music_genre, confidence 0.90
  2026-02: "最近在听很多摇滚" → 确认，confidence 提升
  2026-03: "摇滚听腻了，最近迷上爵士" → 偏好变化
    → fact_key 相同(PREFERENCE:music_genre)
    → 语义矛盾检测：喜欢摇滚 vs 迷上爵士 → 矛盾
    → Resolution：两次确认 vs 一次新声明
    → 旧事实 superseded, 新事实 ACTIVE，旧事实 archived

场景 B — 临时情绪，非偏好变化：

  2026-01: "我喜欢摇滚乐" → PREFERENCE:music_genre, confidence 0.90
  2026-01: "今天这歌太难听了，我讨厌摇滚" → 同一天内的反转
    → 时间间隔 < 1 小时
    → Contradiction Resolution 规则：时间间隔极短 → 共存，不替换
    → 新记忆 confidence = 0.50 (临时情绪 vs 偏好)
    → 旧记忆保持不变
    → 如果后续再次出现摇滚 → 确认旧偏好，临时情绪记忆被忽略

场景 C — RP 偏好：

  2026-01: "我喜欢安静" → PREFERENCE:environment, source USER_IMPLICIT, confidence 0.70
  2026-03: RP剧情中"我其实喜欢热闹的酒吧" → source ROLEPLAY, confidence 0.30
    → source ROLEPLAY vs USER_IMPLICIT
    → Contradiction Resolution：ROLEPLAY 不替换 USER
    → 两者共存但不同检索域
    → 核心检索返回"喜欢安静"；RP 模式检索返回"喜欢热闹"

---

## 附录 D：关系状态机详细设计

### D.1 关系状态转换规则

关系状态转换图（非数值化，由 LLM 从对话中判断）：

  STRANGER → ACQUAINTANCE：
    - 用户与角色已完成≥10轮对话
    - 用户分享了个人信息
    - LLM检测到对话语气从不熟悉变为自然

  ACQUAINTANCE → FRIEND：
    - 用户与角色互动≥50轮
    - 出现非任务导向的闲聊
    - 用户表达了情感或观点

  FRIEND → CLOSE_FRIEND：
    - 用户分享了深层情感、秘密或困难
    - 角色提供了情感支持
    - 对话频率显著提升

  FRIEND/CLOSE_FRIEND → CRUSH：
    - 对话中出现暧昧/浪漫语气
    - LLM检测到情感暗示
    - 此转换需要高confidence（≥3次确认）因为错误判断代价大

  CRUSH → LOVER：
    - 明确的关系确认（如"我们在一起吧"）
    - 此转换只能由 USER_EXPLICIT 触发，不能由 INFERENCE 触发

  LOVER → PARTNER：
    - 长期稳定关系（≥6个月 LOVER 状态）
    - 出现共同生活/未来规划的讨论

  LOVER/PARTNER → EX_PARTNER：
    - 用户明确表示分手
    - 关系状态变化，但不删除历史

### D.2 关系检测的 MemoryExtractor 扩展

MemoryExtractor 的关系专用 prompt 片段：

【关系检测】
分析对话，判断用户与角色的关系状态。注意：
- 数值化好感度在叙境平台被严格禁止
- 请使用自然语言描述关系状态
- 如果不确定，confidence 设为 0.40
- 只有明确的、多次确认的关系变化才设置高 confidence (>0.80)

当检测到关系状态时：
{
  "fact": "关系状态: LOVER",
  "category": "RELATIONSHIP",
  "fact_type": "RELATIONSHIP",
  "fact_key": "RELATIONSHIP:state",
  "importance": 1.0,
  "source": "INFERENCE",
  "confidence_override": 0.65
}

当检测到关系里程碑时：
{
  "fact": "用户与角色第一次约会，去了电影院",
  "category": "RELATIONSHIP",
  "fact_type": "EVENT",
  "fact_key": "RELATIONSHIP:milestone_first_date",
  "importance": 0.9,
  "source": "USER_IMPLICIT",
  "confidence_override": 0.80
}

source 判断规则：
- 用户明确说"我们在一起吧" → USER_EXPLICIT
- 用户说"今天约会很开心" → USER_IMPLICIT
- AI推断"用户似乎对角色有好感" → INFERENCE
- RP剧情中确认关系 → ROLEPLAY（不进核心记忆）

---

## 附录 E：检索算法完整设计

### E.1 检索管道 (Retrieval Pipeline)

Step 1: Query Generation
  从用户消息提取搜索 query
  → "北京 咖啡馆 工作 舒服"

Step 2: Candidate Retrieval
  从 memories 表查询：
  WHERE character_id = ? AND user_id = ?
    AND superseded_by IS NULL     ← 排除被替换的
    AND confidence >= 0.30        ← 排除 UNCERTAIN
    AND source != 'ROLEPLAY'      ← 排除 RP 记忆（非 RP 模式时）
  结果集：估算 300 条（6 个月用户）

Step 3: Keyword Scoring
  文本相似度计算（Jaccard / TF-IDF 简化版）
  score_text = |keywords ∩ memory_content_words| / |keywords|

Step 4: Multi-Factor Ranking
  final_score = score_text × w1
              + importance × w2
              + confidence × w3
              + recency_factor × w4
              + source_weight × w5

  默认权重：w1=0.35, w2=0.20, w3=0.25, w4=0.10, w5=0.10

Step 5: Deduplication
  同一 fact_key → 只保留 final_score 最高的一条

Step 6: Re-ranking（使用轻量 LLM）
  对 Top 20 候选记忆进行 LLM 精排
  Prompt: "以下哪些记忆与用户当前消息最相关？"

Step 7: Top K Selection
  取 Top 10，注入 ContextBuilder

### E.2 Recency Factor 精确公式

recency_factor = e^(-λ × days_since_last_referenced)

其中 λ（衰减率）按事实类型调整：

FACT        → λ = 0.01   (14天后约0.87, 30天后约0.74, 90天后约0.41)
PREFERENCE  → λ = 0.015  (偏好变化更快)
RELATIONSHIP → λ = 0.005 (关系变化慢，高稳定性)
EVENT       → λ = 0.02   (事件快速失去相关性)
OPINION     → λ = 0.025  (观点变化最快)
GOAL        → λ = 0.008  (目标持续时间长)

---

## 附录 F：与行业产品的对比矩阵

| 维度 | Character AI | Nomi AI | Kindroid | Replika | 叙境 Phase 9 | 叙境 Phase 9.5 |
|------|-------------|---------|----------|---------|-------------|---------------|
| 记忆提取方式 | 隐式 | 隐式 | LLM 提取 | 关键词 | LLM Extractor | LLM Extractor + source |
| 记忆结构化 | 未知 | 未知 | 有限分类 | 无 | 6种 category | 6种 category + fact_type + fact_key |
| 事实版本管理 | 无 | 无 | 无 | 无 | 无 | superseded_by 版本链 |
| 置信度评分 | 无 | 无 | 无 | 无 | importance | confidence + importance 双维度 |
| 矛盾处理 | 无 | 无 | 隐式 | 无 | 无 | LLM 检测 + 自动解决/提示 |
| 来源追踪 | 无 | 无 | 无 | 无 | 无 | 5种 source |
| RP 记忆隔离 | 无（污染） | 无（污染） | 无（污染） | 无 | 无 | source=ROLEPLAY 完全隔离 |
| 检索方式 | 全量注入 | 隐式 | 关键词 | 全量 | Top K 文本 | Top K × 多因素排序 |
| 记忆容量（免费）| ~100? | 未知 | 有限 | ~50 | 100/角色 | 100/角色 |
| 记忆容量（付费）| 未知 | 未知 | 更大 | ~200 | 10000/角色 | 10000/角色 |
| 关系系统 | 隐式 | 隐式 | 自然语言 | 数值化 | RELATIONSHIP category | 关系状态机 + 时间线 + 里程碑 |
| 3个月可用性 | ✅ | ✅ | ✅ | ⚠️ | ⚠️ 有冲突风险 | ✅ |
| 6个月可用性 | ⚠️ | ✅ | ✅ | ❌ | ⚠️ 冲突增多 | ✅ |
| 1年可用性 | ❌ | ⚠️ | ⚠️ | ❌ | ❌ 膨胀+冲突 | ⚠️ 需 pgvector |
| 3年可用性 | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ 需 pgvector Phase 2 |

---

## 附录 G：设计决策记录

### D001：importance 保留为独立字段

决策：保留 importance 作为与 confidence 独立的字段
理由：
  - importance = 主观重要性（由 LLM 评估，人工可调整）
  - confidence = 客观可靠性（由系统自动计算）
  - 两者用途不同：importance 影响"何时被裁剪"，confidence 影响"是否可信"
  - 合并为一个字段会丢失信息

替代方案（已拒绝）：
  - 合并为单一 score = importance × confidence
    拒绝原因：丢失了可解释性

### D002：fact_key 格式标准化

决策：使用 "{category}:{normalized_key}" 格式
理由：
  - category 前缀防止不同域的同名 key 冲突
  - normalized_key 抽象化（residence_city 而非 beijing）支持跨用户分析
  - 便于程序化生成和查询

风险：
  - normalized_key 的命名空间需要维护
  - 解决方案：维护 key 字典表，MemoryValidator 对 key 做 normalization

### D003：废弃前必须满足多个条件

决策：memory 仅在同时满足以下条件时进入 FORGOTTEN：
  - confidence < 0.10
  - 处于 ARCHIVED 状态 ≥ 180 天
  - reference_count < 3（历史上很少被引用）
  - 非 RELATIONSHIP 类型（关系记忆更保守）

理由：
  - 防止过早遗忘重要但很少被引用的信息
  - 关系记忆具有长期价值

### D004：RP 记忆隔离在应用层而非数据库层

决策：RP 记忆和核心记忆存在同一 memories 表，通过 source 字段区分
理由：
  - 同一表便于跨 source 查询（如用户将 RP 中提到的真实事实升级）
  - 简化 schema，避免维护两张几乎相同的表
  - 通过检索时的 source 过滤实现隔离

---

## 附录 H：风险登记表 (Phase 9.5 特有)

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|------|------|------|---------|
| R1 | MemoryValidator 的 LLM 矛盾检测不稳定 | 中 | 高 | 多轮确认机制 + 矛盾标记等待用户确认 |
| R2 | confidence 自动计算规则在边缘情况下不准确 | 中 | 中 | 保留人工校准接口 + 定期审计 |
| R3 | fact_key 命名空间膨胀 | 中 | 中 | 维护 key 字典 + normalization 函数 |
| R4 | 旧数据 migration 时 fact_key 生成质量差 | 高 | 中 | 测试后分批处理 + 保守默认值 |
| R5 | RP 隔离不彻底导致核心记忆污染 | 低 | 高 | source 字段检查 + 检索过滤 + 定期审计 |
| R6 | 版本链过长导致查询性能下降 | 低 | 中 | 最多保留 5 个版本；中间版本定期归档 |
| R7 | 3 年数据量下文本匹配检索性能不可接受 | 高 | 高 | Phase 2 必须迁移到 pgvector + embedding |


---

## 附录 I：实施优先级矩阵

### I.1 不可妥协项（P0 — 不实施则长期不可用）

| 项目 | 理由 |
|------|------|
| fact_key + 唯一索引 | 无此 → 同一事实无限堆积 → 6个月后检索失效 |
| source 字段 + source_weight 过滤 | 无此 → RP 记忆持续污染核心记忆库 |
| confidence 自动计算 | 无此 → 低质量记忆与高质量记忆权重相同 |
| superseded_by 版本链 | 无此 → 矛盾事实并存 → LLM 引用过时信息 |

### I.2 强烈推荐项（P1 — 显著提升长期质量）

| 项目 | 理由 |
|------|------|
| MemoryValidator 矛盾检测 | 自动解决大部分冲突，减少用户介入 |
| Recency Factor（时间衰减） | 旧信息自然降权，无需手动清理 |
| RP 检索隔离 | 保证核心对话不被 RP 剧情信息干扰 |
| 关系时间线 | 长期陪伴产品的核心情感价值 |

### I.3 可延后项（P2 — 锦上添花）

| 项目 | 理由 |
|------|------|
| LLM 精排（Re-ranking） | 文本匹配 Phase 1 可用，精排是优化 |
| MemoryConsolidator 版本链压缩 | 1 年内数据量小，手动归档可接受 |
| 共享记忆（Multi-Character） | 需要 Multi-Character 功能先就位 |
| key 字典表 | 规范化可延后，先靠 LLM 约束 |

---

## 附录 J：Phase 9.5 对后续 Phase 的影响

### J.1 对 Phase 8 (Chat UI) 的影响

Phase 9.5 不影响 Phase 8 的 Chat UI 设计。Chat UI 只看到 messages，不直接操作 memories。

但是新增以下前端展示点（可选，后续实施）：
- 记忆面板：展示当前 active 记忆（按 category 分组，显示 confidence）
- 关系时间线：展示关系变化历史
- 矛盾提示：当 LLM 无法自动解决矛盾时，提示用户

### J.2 对 Phase 9 Schema Migration 的影响

Phase 9 Wave 3 的 schema 变更需要更新为 Phase 9.5 的 V3 版本：
- 原计划新增 4 列 + 1 enum → 调整为新增 9 列 + 2 enum + 6 索引
- 新增 MemoryValidator 组件

### J.3 对 Phase 2 (pgvector) 的依赖

Phase 9.5 的检索设计在 6 个月内使用文本匹配可接受。
超出 6 个月（尤其是 1 年+）必须迁移到 pgvector + embedding。
Phase 2 的优先级从"可选"升级为"1 年内必须"。

---

## 附录 K：文档完整结构

本文档包含以下内容：

| 部分 | 标题 | 行范围 |
|------|------|--------|
| 0 | 架构目标 | §0 |
| 1 | Memory Truth Layer 审计（事实变更、矛盾检测、置信度、来源追踪） | §1 |
| 2 | Memory Schema V2（完整 DDL + 字段说明） | §2 |
| 3 | Memory Lifecycle V2（8 阶段状态机） | §3 |
| 4 | Long-Term Companion Simulation（3月/6月/1年/3年风险分析） | §4 |
| 5 | Relationship Memory Architecture（关系状态机 + 时间线 + 里程碑） | §5 |
| 6 | Story Engine Compatibility Review（World/Story/Multi-Character 兼容性） | §6 |
| 7 | Migration Plan（9.5a Schema + 9.5b Lifecycle） | §7 |
| A | 新增组件总览 | §A |
| B | 与传统方案对比 | §B |
| C | Fact Evolution 详细场景（搬家、偏好变化、RP 偏好） | §C |
| D | 关系状态机详细设计（转换规则 + Extractor 扩展） | §D |
| E | 检索算法完整设计（7 步管道 + Recency Factor 公式） | §E |
| F | 与行业产品对比矩阵（Character AI / Nomi / Kindroid / Replika） | §F |
| G | 设计决策记录（4 项关键决策及替代方案） | §G |
| H | 风险登记表（7 项 Phase 9.5 特有风险） | §H |
| I | 实施优先级矩阵（P0/P1/P2） | §I |
| J | 对后续 Phase 的影响（Phase 8 / Phase 9 / Phase 2） | §J |
| K | 文档结构索引（本附录） | §K |

---

## 结束声明

Phase 9.5 Memory Truth Layer Architecture 设计完成。

本设计是对 Phase 9 Memory-First Architecture 的垂直深化，专注于解决长期 AI 陪伴产品的三个核心挑战：

1. **Truth Management** — 事实会变化，系统必须感知和管理变化
2. **Confidence & Source** — 不是所有记忆都同样可靠，系统必须区分
3. **Long-Term Viability** — 3年不是 3个月的线性外推，需要不同的架构策略

Phase 9 提供了"如何记住"，Phase 9.5 提供了"如何正确地记住，如何知道什么该忘记"。

本设计零代码产出。所有决策均为架构层面，留待实施阶段转化为具体技术方案。
