# 17 — Memory-First Chat Architecture Refactoring

> **Phase 9 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation
> **Scope**: 从 MVP 聊天系统升级为可支撑长期陪伴型 AI 产品的生产级架构

---

## 0. 现状诊断

### 0.1 当前数据流

```
POST /api/chat  →  ChatService.sendMessage()
                      │
                      ├─ characterRepository.findById(characterId)    ← 无 userId 过滤
                      ├─ messageRepository.findHistory(characterId)   ← 无 userId 隔离！
                      ├─ memoryRepository.findByCharacter(characterId, userId)  ← 有 userId ✅
                      ├─ _extractMemoriesAsync()  →  Regex 提取       ← 记忆污染
                      ├─ _buildSystemPrompt()      →  固定 30 条消息  ← 无 Token 感知
                      └─ providerGateway.chat()
```

### 0.2 已识别的架构缺陷

| # | 缺陷 | 严重度 | 影响 |
|---|------|--------|------|
| 1 | `findHistory(characterId)` 无 userId 隔离 | **严重** | 用户 A 可读取用户 B 的消息 |
| 2 | `deleteLastAssistant(characterId)` 无 userId | **严重** | 可能删除其他用户的回复 |
| 3 | Greeting 仅注入 Prompt，不持久化 | 高 | 刷新后 Greeting 消失 |
| 4 | 无 Conversation 概念 | 高 | 同一角色无法多线聊天 |
| 5 | `CONTEXT_MESSAGE_LIMIT = 30` 按条数裁剪 | 高 | 长消息被过度裁剪，短消息浪费空间 |
| 6 | Regex 记忆提取（`/我是/` `/我喜欢/`） | **严重** | 记忆污染，噪声远大于信号 |
| 7 | 全部记忆塞进 Prompt | 中 | Token 浪费，无关记忆干扰 LLM |
| 8 | 记忆无分类、无生命周期 | 中 | 无限膨胀，无优先级 |
| 9 | Suggested Reply 单独调用模型 | 低 | 不必要的 Token 消耗 |
| 10 | 无 Story Engine 扩展点 | 低 | 未来改造成本高 |

---

## 1. 目标架构 — Memory-First

### 1.1 核心原则

```
Memory First      →  记忆是核心资产，不是附属功能
Conversation First →  对话是可管理的一等公民
Token Aware       →  上下文窗口动态管理，不按条数裁剪
Isolation First   →  用户数据绝不串线
Extension Ready   →  World System / Story Engine 预留扩展点
```

### 1.2 目标数据模型

```
User ──┬── Conversation[] ──── Message[] ──── (chat history)
       │       │
       │       └── summary, title, createdAt
       │
       ├── Memory[] ──── (长期记忆)
       │     ├── category (IDENTITY / RELATIONSHIP / PREFERENCE / GOAL / EXPERIENCE / PROFILE)
       │     ├── importance (0.0 ~ 1.0)
       │     ├── lastReferencedAt
       │     └── referenceCount
       │
       ├── RelationshipState ──── (角色与用户关系)
       │     ├── state (STRANGER / FRIEND / LOVER / ...)
       │     └── history[]
       │
       └── StoryState (nullable) ──── (故事引擎扩展)
             ├── currentArc
             ├── currentGoal
             └── worldState (JSONB)
```

### 1.3 目标数据流

```
POST /api/chat
  │
  ├─ 1. Auth + Rate Limit
  ├─ 2. Resolve Conversation (create if first message)
  ├─ 3. ContextBuilder.buildContext()
  │      ├─ System Prompt          (~500 tokens)
  │      ├─ Character Data         (~2000 tokens)
  │      ├─ Relationship State     (~200 tokens)
  │      ├─ Memory Search (Top K)  (~1000 tokens)
  │      ├─ Story State (if any)   (~500 tokens)
  │      └─ Recent Messages        (fill remaining budget)
  │      Total: ~6000 tokens (model-dependent)
  │
  ├─ 4. providerGateway.chat()  →  SSE Stream
  │
  ├─ 5. On "done":
  │      ├─ Save ASSISTANT message
  │      └─ MemoryExtractor.extract()  →  LLM 提取 → 写入 Memory
  │
  └─ 6. Periodically: MemoryConsolidator.consolidate()
```

---

## 2. 第一部分：修复严重架构问题

### 2.1 Task 1+2：历史消息隔离 + 重生成逻辑隔离

**影响文件**：`message.repository.ts`、`chat.service.ts`

#### MessageRepository 变更

```typescript
// ===== 当前（有 Bug）=====
async findHistory(characterId: string, limit = 50) {
  return db.query.messages.findMany({
    where: eq(messages.characterId, characterId),     // ← 缺少 userId！
    orderBy: desc(messages.createdAt),
    limit,
  });
}

async deleteLastAssistant(characterId: string) {
  const last = await db.query.messages.findFirst({
    where: and(
      eq(messages.characterId, characterId),           // ← 缺少 userId！
      eq(messages.role, "ASSISTANT")
    ),
    orderBy: desc(messages.createdAt),
  });
  if (last) await db.delete(messages).where(eq(messages.id, last.id));
}

// ===== 目标（修复后）=====
async findHistory(
  characterId: string,
  userId: string,              // ← 新增
  limit = 50,
  before?: string,             // ← 新增游标
) {
  const conditions = [
    eq(messages.characterId, characterId),
    eq(messages.userId, userId),
  ];
  if (before) {
    conditions.push(lt(messages.id, before));
  }
  return db.query.messages.findMany({
    where: and(...conditions),
    orderBy: desc(messages.createdAt),
    limit,
  });
}

async deleteLastAssistant(
  characterId: string,
  userId: string,              // ← 新增
) {
  const last = await db.query.messages.findFirst({
    where: and(
      eq(messages.characterId, characterId),
      eq(messages.userId, userId),                    // ← 新增
      eq(messages.role, "ASSISTANT")
    ),
    orderBy: desc(messages.createdAt),
  });
  if (last) await db.delete(messages).where(eq(messages.id, last.id));
  return last;  // ← 返回被删除的消息，供调用方判断是否成功
}
```

#### ChatService 中所有调用点变更

| 方法 | 当前调用 | 修复后 |
|------|---------|--------|
| `sendMessage()` | `findHistory(characterId, 30)` | `findHistory(characterId, userId, 30)` |
| `regenerateLastAssistantMessage()` | `findHistory(characterId, 30)` | `findHistory(characterId, userId, 30)` |
| `continueAssistantMessage()` | 委托给 `sendMessage()` | 继承修复 ✅ |
| `getSuggestedReply()` | `findHistory(characterId, 10)` | `findHistory(characterId, userId, 10)` |
| `regenerateLastAssistantMessage()` 内部 | `deleteLastAssistant(characterId)` | `deleteLastAssistant(characterId, userId)` |

#### 索引验证

当前 `messages` 表已有索引 `idx_messages_user_char`(`user_id`, `character_id`) 和 `idx_messages_user_char_created`(`user_id`, `character_id`, `created_at` DESC)，无需新增索引。

---

### 2.2 Task 3：Greeting 持久化

**当前行为**：Greeting 仅注入 LLM context（`sendMessage` 中的 `chatMessages.push({ role: "assistant", content: firstGreeting })`），不写入 DB。

**问题**：刷新页面后 Greeting 消失，UI 不一致。

**目标**：首次创建 Conversation 时，将 Greeting 作为 ASSISTANT 消息写入 DB。

```
sendMessage() 流程变更：

  if (conversation.messages.length === 0 && character.greeting) {
    // 1. 解析 Greeting（取 <START> 第一段）
    const greetingParts = character.greeting.split("<START>");
    const greetingText = greetingParts[0]?.trim();
    
    if (greetingText) {
      // 2. 写入 DB（持久化）
      await messageRepository.create({
        characterId,
        userId,
        conversationId,    // ← 归属到 Conversation
        role: "ASSISTANT",
        content: greetingText,
      });
    }
  }
  // 后续正常发送用户消息...

```

**效果**：
- 刷新后 Greeting 仍然可见（从 DB 加载）
- Context 与 UI 一致
- Regenerate 不受影响（Greeting 消息保留，只删除后续 ASSISTANT）
- Memory 不受影响（Greeting 是角色开场白，不属于用户记忆）

---

## 3. 第二部分：Conversation System

### 3.1 新增 Schema：`conversations`

```typescript
// src/db/schema/conversations.ts
import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { characters } from "./characters";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid("user_id").notNull().references(() => users.id),
    characterId: uuid("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull().default("新的对话"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCharIdx: index("idx_conversations_user_char").on(table.userId, table.characterId),
    updatedAtIdx: index("idx_conversations_updated_at").on(table.updatedAt.desc()),
  })
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
```

### 3.2 `messages` 表新增字段

```typescript
// 在 messages schema 中新增：
conversationId: uuid("conversation_id")
  .notNull()
  .references(() => conversations.id, { onDelete: "cascade" }),

// 新增索引：
convCreatedIdx: index("idx_messages_conv_created").on(table.conversationId, desc(table.createdAt)),
```

**Migration 策略**：对于已有消息，创建默认 Conversation 并关联。

### 3.3 新增 Enum：`message_role` 扩展

无需修改 — 当前 `USER` | `ASSISTANT` 足够。Greeting 持久化后角色仍是 `ASSISTANT`。

### 3.4 新增 Repository：`conversation.repository.ts`

```typescript
export class ConversationRepository {
  async findById(id: string) { /* ... */ }
  
  async findByUserAndCharacter(userId: string, characterId: string) {
    return db.query.conversations.findMany({
      where: and(
        eq(conversations.userId, userId),
        eq(conversations.characterId, characterId),
      ),
      orderBy: desc(conversations.updatedAt),
    });
  }
  
  async create(data: NewConversation) { /* ... */ }
  async update(id: string, data: Partial<NewConversation>) { /* ... */ }
  async delete(id: string) { /* ... */ }
  
  /** 获取 Conversation 的消息数 */
  async messageCount(id: string) { /* SELECT count(*) */ }
}
```

### 3.5 ChatService 中的 Conversation 生命周期

```
sendMessage(userId, characterId, content, conversationId?):
  
  1. 如果没有 conversationId：
     a. 查找该用户+角色的最近活跃 Conversation
     b. 如果不存在，创建新 Conversation
     c. 如果是新建且 character.greeting 非空，持久化 Greeting
  
  2. 后续流程使用 resolvedConversationId
```

**多会话支持**：前端 `/chat/[characterId]` 页面可以展示该角色下的 Conversation 列表，用户可切换。

---

## 4. 第三部分：Token-Aware Context Builder

### 4.1 新增：`ContextBuilder` 类

```
src/server/services/context-builder.ts
```

**核心概念**：不按消息条数裁剪，按 Token 预算动态分配。

```typescript
interface ContextBudget {
  maxTokens: number;        // 模型上下文窗口上限（如 8000）
  reservedForReply: number; // 预留给回复的空间（如 2000）
  // 实际可用于 prompt 的：maxTokens - reservedForReply
}

interface ContextSection {
  name: string;
  priority: number;         // 1 = 必须保留，5 = 最先裁剪
  content: string;
  estimatedTokens: number;  // 粗略估算：chars / 4
}

class ContextBuilder {
  build(context: {
    systemPrompt: string;
    characterPrompt: string;
    relationshipState: string | null;
    storyState: string | null;
    memories: Memory[];
    messages: Message[];
  }, budget: ContextBudget): { systemPrompt: string; messages: ChatMessage[] }
}
```

### 4.2 组装逻辑

```
buildContext() 流程：

  1. System Prompt           →  优先级 1（必须保留）  ~400 tokens
  2. Character Data          →  优先级 1（必须保留）  ~2000 tokens
  3. Relationship State      →  优先级 2              ~200 tokens
  4. Story State             →  优先级 3              ~500 tokens
  5. Memory (Top K)          →  优先级 3              ~1000 tokens
  6. Recent Messages         →  优先级 5（最先裁剪）
  
  总预算：6000 tokens
  
  while totalTokens > budget:
    从优先级最低的 section 开始裁剪
    - Messages: 从最早的消息开始移除
    - Memories: 减少 K 值
    - Story State: 压缩摘要
```

### 4.3 Token 估算函数

```typescript
/** 粗略 Token 估算（chars / 4 对中文偏保守，chars / 3 对小模型） */
function estimateTokens(text: string): number {
  // 中文约 1 char = 0.5~1 token，英文约 1 char = 0.25 token
  // 保守估算：chars / 3.5
  return Math.ceil(text.length / 3.5);
}
```

> 后续可替换为 `tiktoken` 精确计数。MVP 阶段用字符估算足够。

### 4.4 现有代码的变更

删除 `chat.service.ts` 中的：

```typescript
// ❌ 删除
const CONTEXT_MESSAGE_LIMIT = 30;
const messages = historyMessages.slice(0, 30);
```

替换为：

```typescript
// ✅ 新增
import { contextBuilder } from "./context-builder";

const ctx = contextBuilder.build({
  systemPrompt: fullSystemPrompt,
  characterPrompt: "",  // 已包含在 systemPrompt 中
  relationshipState: await relationshipService.getState(userId, characterId),
  storyState: null,     // 未来扩展
  memories,
  messages: historyMessages,
}, { maxTokens: 8000, reservedForReply: 2000 });
```

---

## 5. 第四部分：Memory Extraction Agent

### 5.1 删除旧代码

**文件**：`src/server/services/chat.service.ts`

删除 `_extractMemoriesAsync()` 方法中的全部 Regex 提取逻辑。

**文件**：`src/server/services/memory.service.ts`

删除 `extractFacts()` 方法（Regex 方案）。

### 5.2 新增：`MemoryExtractor`

```
src/server/services/memory-extractor.ts
```

```typescript
const MEMORY_EXTRACTOR_PROMPT = `你是长期记忆提取器。
从以下对话中提取未来仍然有价值的信息。

保留：
- 姓名、年龄、职业、城市
- 兴趣爱好、技能特长
- 人际关系（如"我有个妹妹叫..."）
- 长期目标、计划
- 重要人生经历（如"我去年搬到了上海"）
- 与角色关系变化
- 偏好的交流风格

忽略：
- 临时情绪（"我今天心情不好"）
- 一次性事件（"我昨天吃了火锅"）
- 玩笑、假设、角色扮演中的虚构信息
- 对当前消息的直接回复

输出严格 JSON 数组（不要任何其他文本）：

[
  {
    "fact": "用户住在北京",
    "category": "PROFILE",
    "importance": 0.8
  }
]

category 必须是以下之一：IDENTITY, RELATIONSHIP, PREFERENCE, GOAL, EXPERIENCE, PROFILE
importance 范围 0.0 ~ 1.0（0.0=可丢弃，1.0=核心记忆）`;

interface ExtractedMemory {
  fact: string;
  category: MemoryCategory;
  importance: number;
}

type MemoryCategory = "IDENTITY" | "RELATIONSHIP" | "PREFERENCE" | "GOAL" | "EXPERIENCE" | "PROFILE";
```

### 5.3 调用流程

```typescript
class MemoryExtractor {
  async extract(
    userId: string,
    characterId: string,
    recentMessages: { role: string; content: string }[]
  ): Promise<ExtractedMemory[]> {
    // 1. 构建提取 prompt
    const conversationText = recentMessages
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");
    
    // 2. 调用轻量模型（如 deepseek-chat 或 gpt-3.5-turbo）
    const config = await this.resolveExtractionConfig(userId);
    const response = await this.callLLM(config, MEMORY_EXTRACTOR_PROMPT, conversationText);
    
    // 3. 解析 JSON
    try {
      const parsed = JSON.parse(response);
      return this.validateMemories(parsed);
    } catch {
      return [];  // 解析失败不阻塞主流程
    }
  }
  
  private validateMemories(raw: unknown): ExtractedMemory[] {
    // Zod 校验 + category 枚举检查 + importance 范围检查
  }
}
```

### 5.4 触发时机

```
sendMessage() → Stream "done" →
  └─ 异步调用 memoryExtractor.extract()
     └─ 写入 memoryRepository.create()
        └─ 去重检查（基于 content 相似度）
```

> 提取调用不阻塞用户下一轮交互。用 `setImmediate` 或 `queueMicrotask` 异步执行。

---

## 6. 第五部分：Memory 分类与扩展字段

### 6.1 Schema 变更：`memories` 表

```typescript
// 新增 enum
export const memoryCategoryEnum = pgEnum("memory_category", [
  "IDENTITY",      // 身份：姓名、年龄、职业
  "RELATIONSHIP",  // 关系：与角色的关系变化
  "PREFERENCE",    // 偏好：喜好、习惯
  "GOAL",          // 目标：长期目标、计划
  "EXPERIENCE",    // 经历：重要事件
  "PROFILE",       // 档案：居住地、家庭成员
]);

// 新增字段
category: memoryCategoryEnum("category").notNull().default("PROFILE"),
importance: numeric("importance", { precision: 3, scale: 2 }).notNull().default("0.50"),
lastReferencedAt: timestamp("last_referenced_at", { withTimezone: true }),
referenceCount: integer("reference_count").notNull().default(0),

// 新增索引
categoryIdx: index("idx_memories_category").on(table.category),
lastRefIdx: index("idx_memories_last_ref").on(table.lastReferencedAt),
catImportanceIdx: index("idx_memories_cat_importance").on(table.category, desc(table.importance)),
```

### 6.2 新增字段在 Memory Repository 中的应用

```typescript
// markReferenced — 每次记忆被注入 Context 后调用
async markReferenced(id: string) {
  await db.update(memories)
    .set({
      lastReferencedAt: new Date(),
      referenceCount: sql`${memories.referenceCount} + 1`,
    })
    .where(eq(memories.id, id));
}

// incrementImportance — 提升重要记忆
async incrementImportance(id: string, delta: number) {
  await db.update(memories)
    .set({
      importance: sql`LEAST(1.0, ${memories.importance} + ${delta})`,
    })
    .where(eq(memories.id, id));
}
```

---

## 7. 第六部分：Memory Retrieval System

### 7.1 核心概念

**当前**：`findByCharacter(characterId, userId, MEMORY_LIMIT)` → 全部记忆塞进 Prompt。

**目标**：Memory Search — 根据当前对话内容，检索最相关的 Top K 记忆。

### 7.2 检索流程

```
用户发消息 "我今天去了北京新开的咖啡馆"
  │
  ├─ 1. 生成 Memory Query
  │     LLM: "用户在北京的活动、咖啡偏好"
  │
  ├─ 2. 文本检索（Phase 1: 关键词匹配）
  │     或向量检索（Phase 2: embedding + pgvector）
  │
  └─ 3. 返回 Top 10 相关记忆
        "用户住在北京"      (RELATIONSHIP)
        "用户喜欢喝咖啡"    (PREFERENCE)
        "用户经常去朝阳区"  (EXPERIENCE)
```

### 7.3 实现方案（Phase 1：文本匹配）

```typescript
class MemoryRetriever {
  async search(
    userId: string,
    characterId: string,
    query: string,         // 当前用户消息
    topK: number = 10,
  ): Promise<Memory[]> {
    // 1. 关键词提取（从 query 中提取）
    const keywords = this.extractKeywords(query);
    
    // 2. 从 DB 获取用户全部记忆（Free ≤ 100, VIP ≤ 10000）
    const allMemories = await memoryRepository.findByCharacter(characterId, userId, 500);
    
    // 3. 文本相似度排序（Jaccard / TF-IDF 简化版）
    const scored = allMemories.map(m => ({
      memory: m,
      score: this.textSimilarity(keywords, m.content) * Number(m.importance),
    }));
    
    // 4. 返回 Top K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.memory);
  }
  
  private textSimilarity(keywords: string[], text: string): number {
    const textLower = text.toLowerCase();
    const matches = keywords.filter(k => textLower.includes(k.toLowerCase()));
    return matches.length / keywords.length;
  }
  
  private extractKeywords(text: string): string[] {
    // 简单分词 + 去停用词
    // 后续可替换为 jieba 分词或 LLM 提取
    return text.split(/[，。！？\s,.\!?]+/).filter(w => w.length > 1);
  }
}
```

### 7.4 检索触发点

在 `ContextBuilder.buildContext()` 中调用：

```typescript
const relevantMemories = await memoryRetriever.search(
  userId,
  characterId,
  latestUserMessage,  // 用于生成搜索 query
  10                  // Top K
);

// 注入后标记引用
for (const mem of relevantMemories) {
  await memoryRepository.markReferenced(mem.id);
}
```

---

## 8. 第七部分：Memory 生命周期

### 8.1 评分机制

每条记忆的"有效权重"：

```
weight = importance × recency_factor × reference_factor

recency_factor  = 1.0 / (1 + daysSinceLastReference / 30)
reference_factor = 1.0 + log(1 + referenceCount)
```

### 8.2 MemoryConsolidator

```typescript
class MemoryConsolidator {
  /** 定时任务：每天 / 每周执行 */
  async consolidate(userId: string, characterId: string): Promise<void> {
    // 1. 合并重复记忆
    await this.deduplicate(userId, characterId);
    
    // 2. 删除低价值记忆
    await this.pruneLowValue(userId, characterId);
    
    // 3. 提升高频记忆 importance
    await this.boostFrequent(userId, characterId);
  }
  
  private async deduplicate(userId: string, characterId: string) {
    const all = await memoryRepository.findByCharacter(characterId, userId, 500);
    const groups = this.groupSimilar(all);
    for (const group of groups) {
      if (group.length > 1) {
        // 保留 importance 最高的，合并其余的 referenceCount
        group.sort((a, b) => Number(b.importance) - Number(a.importance));
        const keep = group[0];
        for (let i = 1; i < group.length; i++) {
          await memoryRepository.incrementImportance(keep.id, 0.05);
          await memoryRepository.delete(group[i].id);
        }
      }
    }
  }
  
  private async pruneLowValue(userId: string, characterId: string) {
    const threshold = 0.15;
    const stale = await memoryRepository.findLowValue(characterId, userId, threshold, 30);
    for (const mem of stale) {
      await memoryRepository.delete(mem.id);
    }
  }
  
  private groupSimilar(memories: Memory[]): Memory[][] {
    // 基于编辑距离 / Jaccard 的简单分组
    // Phase 2 可用 embedding 余弦相似度
  }
}
```

### 8.3 新增 Repository 方法

```typescript
// memory.repository.ts 新增方法

async findLowValue(characterId: string, userId: string, maxImportance: number, staleDays: number) {
  const cutoff = new Date(Date.now() - staleDays * 86400_000);
  return db.query.memories.findMany({
    where: and(
      eq(memories.characterId, characterId),
      eq(memories.userId, userId),
      lt(memories.importance, String(maxImportance)),
      or(
        lt(memories.lastReferencedAt, cutoff),
        isNull(memories.lastReferencedAt),
      ),
    ),
  });
}

async delete(id: string) { /* ... */ }

async incrementImportance(id: string, delta: number) { /* ... */ }
```

---

## 9. 第八部分：Relationship State System

### 9.1 关系状态模型

不允许新增独立表。关系状态存储在 `memories` 表中，使用特殊 `category = "RELATIONSHIP"` 和高 `importance`。

```
Relationship State 存储方案：

1. 当前关系状态 → Memory
   category: "RELATIONSHIP"
   content:  "关系状态: 恋人"
   importance: 1.0
   lastReferencedAt: ...

2. 关系变化历史 → Memory 链
   每次变化时，旧状态降低 importance (0.3)，新状态设为 1.0
```

### 9.2 关系状态枚举

```typescript
const RELATIONSHIP_STATES = [
  "STRANGER",    // 陌生人
  "ACQUAINTANCE",// 认识
  "FRIEND",      // 朋友
  "CLOSE_FRIEND",// 密友
  "LOVER",       // 恋人
  "PARTNER",     // 伴侣
  "FAMILY",      // 家人
  "RIVAL",       // 敌对
  "MENTOR",      // 导师
  "STUDENT",     // 学生
] as const;
```

### 9.3 关系检测 Prompt（MemoryExtractor 扩展）

```
在 MemoryExtractor prompt 中增加：

如果对话中体现出用户与角色的关系，请提取：
{
  "fact": "关系状态: LOVER",
  "category": "RELATIONSHIP",
  "importance": 1.0
}
```

### 9.4 Context Builder 中的关系注入

```typescript
// context-builder.ts

// 1. 从 Memory 中提取最新关系状态
const relationshipMemories = memories.filter(m => m.category === "RELATIONSHIP");
const currentRelationship = relationshipMemories
  .sort((a, b) => Number(b.importance) - Number(a.importance))[0];

// 2. 注入 Context
if (currentRelationship) {
  parts.push("\n【当前关系】\n" + currentRelationship.content);
}

// 3. 关系优先级高于普通记忆
//    relationshipMemories 始终在 memory search 结果中排最前
```

---

## 10. 第九部分：Suggested Reply 优化

### 10.1 当前问题

`getSuggestedReply()` 单独调用一次 LLM，额外消耗 Token。

### 10.2 优化方案：合并在主回复中

将主回复 prompt 修改为同时输出建议：

```
System Prompt 末尾追加：

【回复格式】
请以以下 JSON 格式回复（不要包含其他内容）：
{
  "reply": "你的回复内容...",
  "suggestions": ["建议1", "建议2", "建议3"]
}
```

**但这会改变现有的 SSE 流式输出**。更务实的方案：

### 10.3 务实方案（Phase 1）

保持现有 SSE 流式不变，但在主回复完成后异步调用 Suggest：

```typescript
// sendMessage() → done 事件后
// 同时触发 Memory Extraction 和 Suggest
Promise.allSettled([
  memoryExtractor.extract(userId, characterId, recentMessages),
  chatService.getSuggestedReply(userId, characterId),  // 依然单独调用，但是异步
]);
```

> 前端在 `/api/chat/[characterId]/suggest` 返回后更新 chips，避免额外等待。

### 10.4 Phase 2 优化（未来）

在主回复 prompt 中增加结构化输出指令，一次调用同时返回 `reply` + `suggestions`。需要修改 `ProviderGateway` 支持非流式 JSON 模式调用。

---

## 11. 第十部分：Story Engine 预留

### 11.1 StoryState 接口

```typescript
// src/server/services/story-engine.ts (预留文件)

interface StoryState {
  currentArc: string | null;       // 当前剧情线
  currentGoal: string | null;      // 当前目标
  currentConflict: string | null;  // 当前冲突
  worldState: Record<string, unknown> | null;  // 世界状态（JSONB）
}

interface StoryEvent {
  type: "ARC_START" | "ARC_END" | "GOAL_ACHIEVED" | "RELATIONSHIP_MILESTONE";
  timestamp: Date;
  description: string;
  metadata?: Record<string, unknown>;
}
```

### 11.2 存储方案

初期不建独立表。`StoryState` 存储在 `conversations` 表的 `summary` 字段（JSONB 格式扩展）或新建 `story_state` JSONB 字段。

```typescript
// conversations 表新增字段：
storyState: jsonb("story_state"),  // nullable，初期为空
```

### 11.3 Context Builder 注入点

```typescript
// context-builder.ts 中预留位置：

// 优先级 3 — Story State
if (context.storyState) {
  sections.push({
    name: "StoryState",
    priority: 3,
    content: this.formatStoryState(context.storyState),
    estimatedTokens: estimateTokens(JSON.stringify(context.storyState)),
  });
}
```

### 11.4 未来完整架构

```
Character System  ──┐
Memory System     ──┼── ContextBuilder ──→ LLM
World System      ──┤
Story Engine      ──┘
```

所有子系统通过统一的 `ContextBuilder.build()` 组装 Prompt，每个子系统只需提供自己的 section。

---

## 12. 完整文件变更清单

### Schema 变更

| 文件 | 变更 |
|------|------|
| `src/db/schema/conversations.ts` | **新建** — conversations 表 |
| `src/db/schema/messages.ts` | 新增 `conversationId` + 索引 |
| `src/db/schema/memories.ts` | 新增 `category`, `importance`, `lastReferencedAt`, `referenceCount` + 3 个索引 |
| `src/db/enums.ts` | 新增 `memory_category` enum |
| `src/db/relations.ts` | 新增 conversations 关系 |
| `src/db/schema/index.ts` | 新增 conversations export |

### Repository 变更

| 文件 | 变更 |
|------|------|
| `src/server/repositories/message.repository.ts` | `findHistory` 加 `userId` + `before`；`deleteLastAssistant` 加 `userId` + 返回值 |
| `src/server/repositories/memory.repository.ts` | 新增 `findLowValue`, `markReferenced`, `incrementImportance`, `delete` |
| `src/server/repositories/conversation.repository.ts` | **新建** |

### Service 变更

| 文件 | 变更 |
|------|------|
| `src/server/services/chat.service.ts` | 删除 `_extractMemoriesAsync`；`sendMessage` 重写为 Conversation-aware；Context 组装委托给 ContextBuilder |
| `src/server/services/context-builder.ts` | **新建** — Token-aware 上下文组装 |
| `src/server/services/memory-extractor.ts` | **新建** — LLM 记忆提取 |
| `src/server/services/memory-retriever.ts` | **新建** — 记忆检索 |
| `src/server/services/memory-consolidator.ts` | **新建** — 记忆合并/清理 |
| `src/server/services/memory.service.ts` | 删除 `extractFacts()`；保留 `saveMemories`, `getMemories`, `evictMemories` |
| `src/server/services/story-engine.ts` | **新建** — 预留接口文件 |
| `src/server/services/provider-gateway.ts` | 无变化 ✅ |

### API 变更

| 文件 | 变更 |
|------|------|
| `src/app/api/chat/route.ts` | 现有 SSE 端点，增加 conversationId 可选参数 |
| `src/app/api/chat/[characterId]/route.ts` | 新建（Phase 8 P0.1）；改为返回 conversation 列表 |
| `src/app/api/chat/[characterId]/regenerate/route.ts` | 新建（Phase 8 P1.1） |
| `src/app/api/chat/[characterId]/suggest/route.ts` | 新建（Phase 8 P1.2） |

### 前端变更

| 文件 | 变更 |
|------|------|
| `src/app/chat/[characterId]/page.tsx` | 新增 Conversation 列表；conversationId 参数 |
| `src/components/chat/ConversationList.tsx` | **新建** — 会话列表侧栏 |

---

## 13. API 向后兼容策略

### 现有端点 `POST /api/chat`

- 新增可选参数 `conversationId`
- 不传时自动查找或创建默认 Conversation
- SSE 流格式不变

### 现有 `GET /api/chat/[characterId]`（Phase 8 新建）

- 改为返回该角色下的 Conversation 列表
- 响应：`{ conversations: [{ id, title, summary, updatedAt, messageCount }] }`

### 新增 `GET /api/chat/[characterId]/[conversationId]`

- 返回特定 Conversation 的消息历史

---

## 14. 性能考量

| 场景 | 当前问题 | 解决方案 |
|------|---------|---------|
| Memory 全量查询 | Free 100 条，VIP 10000 条 | Phase 1 全部加载到内存做文本匹配；Phase 2 用 pgvector 向量检索 |
| 记忆提取 | Regex 快但脏 | LLM 提取用轻量模型（deepseek-chat），异步不阻塞 |
| Context Builder | 固定条数裁剪 | 动态 Token 估算，chars/3.5，O(n) 遍历 |
| Memory Consolidation | 无 | 定时任务（cron），非高峰执行 |
| Conversation 列表 | 不存在 | 每条 conversation 独立索引，`user_id + character_id` 联合查询 |

---

## 15. 测试策略

| 层级 | 测试内容 |
|------|---------|
| Repository | `findHistory` 返回消息仅限该 userId；`deleteLastAssistant` 不跨用户 |
| Service | `sendMessage` 创建 Conversation；Greeting 持久化；记忆提取 JSON 解析 |
| Context Builder | Token 预算遵守；裁剪优先级正确 |
| 集成 | 用户 A 无法读取用户 B 的消息；SSE 流格式不变 |
| E2E | 创建角色 → 聊天 → 刷新 → 历史保留 → 切换 Conversation |
