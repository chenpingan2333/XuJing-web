# 叙境（Xujing）Database Design Constraints Report

> **版本**：V1.2（最终冻结版）
> **日期**：2026-06-07
> **阶段**：Phase 1 - 数据库设计约束冻结
> **依赖**：Architecture Freeze Report V1.1
> **状态**：冻结，可进入 Phase 1.1 Database Schema Design
> **V1.2 变更**：删除 Message 再生系统（parent/generation_index）、新增 StarDiamondTransaction 资金流水表、ApiConfig 增加 is_default 部分唯一索引

---

## 第一部分：数据库设计原则

### 1.1 数据库选型

| 项目 | 选择 | 理由 |
|------|------|------|
| **数据库** | PostgreSQL 16+ | 关系型数据；JSONB 支持角色卡弹性字段；事务保证充值/VIP 扣减原子性 |
| **ORM** | Drizzle ORM | 类型安全、SQL-like、Next.js App Router 兼容 |
| **迁移工具** | Drizzle Kit | 生成 SQL 迁移文件 |

### 1.2 主键策略

| 规则 | 说明 |
|------|------|
| **统一使用 UUID v7** | 所有表的 `id` 字段使用 UUID v7（时间排序 + 全局唯一） |
| **禁止自增 ID** | 不使用 SERIAL / BIGSERIAL / AUTO_INCREMENT |
| **禁止复合主键** | 每表单一 UUID 主键 |

### 1.3 时间字段策略

| 规则 | 说明 |
|------|------|
| **统一字段名** | `created_at` + `updated_at` |
| **统一类型** | `TIMESTAMPTZ` |
| **默认值** | `created_at` 默认 `NOW()` |

### 1.4 金额与数值字段策略

| 字段 | 类型 | 理由 |
|------|------|------|
| Order.amount_rmb | **NUMERIC(10,2)** | 人民币金额，精确到分。禁止 FLOAT |
| User.star_diamonds | **BIGINT** | 星钻整数，余额缓存 |
| StarDiamondTransaction.amount | **BIGINT** | 流水金额（正=入账，负=出账） |
| StarDiamondTransaction.balance_after | **BIGINT** | 变动后余额快照 |
| Memory.importance | NUMERIC(3,2) | 0.00-1.00 权重 |

### 1.5 软删除策略

| 实体 | 策略 | 理由 |
|------|------|------|
| **User** | 不物理删除 | BANNED 通过 status 实现 |
| **Character** | **软删除** | `deleted_at TIMESTAMPTZ NULL` |
| **Message** | **物理删除** | 量大，角色清理时 CASCADE |
| **Memory** | **物理删除** | 量大，超限淘汰和角色清理时物理删除 |
| **ApiConfig** | **物理删除** | 用户主动删除 |
| **Order** | **物理保留，禁止删除** | 资金凭证 |
| **VipRecord** | **物理保留，禁止删除** | 历史凭证 |
| **AdminLog** | **不可删除** | 审计日志 |
| **StarDiamondTransaction** | **物理保留，禁止删除** | 资金流水，不可篡改 |

### 1.6 JSONB 使用策略

**允许 JSONB**：

| 表 | 字段 | 理由 |
|----|------|------|
| Character | `extra_fields` | 角色卡扩展字段弹性结构 |
| Character | `dialogue_examples` | 对话示例不定长数组 |
| AdminLog | `detail` | 操作详情结构差异大 |
| Memory | `embedding` | 向量嵌入预留（JSONB NULL，MVP 可选） |

**禁止 JSONB**：可枚举值、需索引字段、金额字段、固定结构字段。

---

## 第二部分：数据库实体确认

### 2.1 User

| 维度 | 说明 |
|------|------|
| **职责** | 账户管理、身份认证、角色配额、VIP状态、星钻余额 |
| **关键字段** | email（LOWER 存储，UNIQUE）、nickname、avatar_url、role（USER/ADMIN）、status（ACTIVE/BANNED）、vip_expires_at（NULL=非VIP，>NOW()=VIP）、star_diamonds（BIGINT，余额缓存）、persona_setting、has_purchased_vip |
| **VIP 判断** | `vipExpiresAt !== null && vipExpiresAt > new Date()` |
| **生命周期** | 注册 → ACTIVE → 购买VIP → 过期 → BANNED → 永久保留 |
| **删除策略** | 不物理删除 |

### 2.2 Character

| 维度 | 说明 |
|------|------|
| **职责** | 角色定义、对话人格、记忆容器 |
| **关键字段** | user_id（NULL=System Character）、name、avatar_url、background_url、setting、greeting、personality、scenario、dialogue_examples（JSONB）、nickname、group_greeting、main_prompt、post_history_instructions、extra_fields（JSONB）、is_official、version（INTEGER NOT NULL DEFAULT 1）、deleted_at |
| **生命周期** | 创建（version=1）→ 使用 → 编辑升级 → 导出 → 软删除 |
| **删除策略** | **软删除** |

### 2.3 Message（V1.2 简化）

| 维度 | 说明 |
|------|------|
| **职责** | 对话记录存储。**不保留重生成历史、不支持版本切换、不支持会话分支** |
| **关键字段** | id、character_id、user_id、role（USER/ASSISTANT）、content、created_at |
| **重新生成流程** | 用户点击重新生成 → 删除旧 ASSISTANT 消息（`DELETE FROM message WHERE id = :oldMsgId`）→ 重新请求模型 → 插入新 ASSISTANT 消息。**不保留历史版本** |
| **再回复一句** | 发送特殊指令"请继续"→ 模型返回新 ASSISTANT 消息 → 正常 INSERT |
| **AI 帮我回复** | 生成 USER 消息建议文本 → 返回前端填入输入框 → 用户手动发送后才 INSERT |
| **生命周期** | 用户发消息 → AI 回复 → 重生成（DELETE+INSERT）→ 角色物理清理 → CASCADE |
| **删除策略** | **物理删除** |

> **V1.2 删除**：parent_message_id、generation_index、Conversation Tree、会话分支。Message 为扁平线性结构。

### 2.4 Memory

| 维度 | 说明 |
|------|------|
| **职责** | 长期记忆提取、存储、检索 |
| **关键字段** | character_id、user_id、content、importance（NUMERIC(3,2)）、extracted_from_message_id、embedding（JSONB NULL，预留）、created_at |
| **检索策略** | MVP：关键词 + importance 排序。embedding JSONB NULL 预留未来向量检索 |
| **删除策略** | **物理删除**（超限淘汰 + 角色清理 CASCADE） |

### 2.5 ApiConfig（V1.2 新增默认机制）

| 维度 | 说明 |
|------|------|
| **职责** | 存储用户自备的 AI API 配置，支持多配置和默认配置 |
| **关键字段** | user_id、name、platform（枚举）、api_url、api_key_encrypted（AES-256-CBC）、model_id、is_active（BOOLEAN DEFAULT TRUE）、**is_default（BOOLEAN NOT NULL DEFAULT FALSE）**、created_at |
| **默认机制** | `UNIQUE(user_id) WHERE is_default = TRUE` — 每个用户最多一个默认配置。ProviderGateway 优先读取 is_default=TRUE 的配置 |
| **生命周期** | 创建 → 设为默认/取消默认 → 停用/启用 → 删除 |
| **删除策略** | **物理删除** |
设置新的默认配置时：

事务中执行：

UPDATE api_config
SET is_default = FALSE
WHERE user_id = ?

然后：

UPDATE api_config
SET is_default = TRUE
WHERE id = ?

### 2.6 Order

| 维度 | 说明 |
|------|------|
| **职责** | 星钻充值订单全生命周期管理 |
| **关键字段** | user_id、amount_rmb（NUMERIC(10,2)）、star_diamonds、status（PENDING_PAYMENT/PENDING_REVIEW/COMPLETED/REJECTED）、screenshot_url、review_note、reviewed_by、reviewed_at、transaction_id（UUID UNIQUE，审核通过后写入）、completed_at、created_at |
| **幂等保障** | transaction_id UNIQUE 约束。重复审核 → 检查已存在 → 拒绝 |
| **删除策略** | **物理保留，禁止删除** |

### 2.7 VipRecord

| 维度 | 说明 |
|------|------|
| **职责** | VIP 购买历史、到期管理、首次购买判断 |
| **关键字段** | user_id、plan_type（MONTHLY/QUARTERLY/YEARLY）、star_diamonds_spent、is_first_purchase、activated_at、expires_at、created_at |
| **删除策略** | **物理保留，禁止删除** |

### 2.8 AdminLog

| 维度 | 说明 |
|------|------|
| **职责** | 管理员操作审计追踪 |
| **关键字段** | admin_id、action_type（枚举）、target_type（枚举）、target_id（UUID）、detail（JSONB）、request_id（UUID NULL）、ip_address、created_at |
| **删除策略** | **不可删除** |

### 2.9 StarDiamondTransaction（V1.2 新增）

| 维度 | 说明 |
|------|------|
| **职责** | **完整资金流水审计**。所有星钻余额变动必须写入流水。User.star_diamonds 仅为余额缓存 |
| **关键字段** | id（UUID v7）、user_id、amount（BIGINT，正=入账/负=出账）、balance_after（BIGINT，变动后余额快照）、type（枚举）、reference_id（UUID NULL，关联业务记录）、created_at |
| **核心约束** | 任何余额变动必须原子写入流水 + 更新缓存。流水不可修改、不可删除 |
| **reference_id 用途** | RECHARGE → Order.id / VIP_PURCHASE → VipRecord.id / CHAT_CONSUME → Message.id / ADMIN_ADJUST → NULL（管理员手动调账） |
| **生命周期** | 余额变动 → 写入流水 → 永久保留 |
| **删除策略** | **物理保留，禁止删除** |

---

## 第三部分：关系设计确认

### 3.1 User → Character（1:N）

| 外键 | NULL | 级联 |
|------|------|------|
| character.user_id → user.id | 是（NULL=System Character） | RESTRICT |

### 3.2 User → ApiConfig（1:N）

| 外键 | NULL | 级联 |
|------|------|------|
| api_config.user_id → user.id | 否 | 未设置 |

### 3.3 User → Order（1:N）

| 外键 | NULL | 级联 |
|------|------|------|
| order.user_id → user.id | 否 | 未设置 |

### 3.4 User → VipRecord（1:N）

| 外键 | NULL | 级联 |
|------|------|------|
| vip_record.user_id → user.id | 否 | 未设置 |

### 3.5 User → AdminLog（1:N）

| 外键 | NULL | 级联 |
|------|------|------|
| admin_log.admin_id → user.id | 否 | 未设置 |

### 3.6 User → StarDiamondTransaction（1:N）（V1.2 新增）

| 外键 | NULL | 级联 |
|------|------|------|
| star_diamond_transaction.user_id → user.id | 否 | 未设置。User 不物理删除，流水永久保留 |

### 3.7 Character → Message（1:N）

| 外键 | NULL | 级联 |
|------|------|------|
| message.character_id → character.id | 否 | CASCADE（角色物理清理时） |

### 3.8 Character → Memory（1:N）

| 外键 | NULL | 级联 |
|------|------|------|
| memory.character_id → character.id | 否 | CASCADE（角色物理清理时） |

---

## 第四部分：枚举设计

### 4.1 UserRole

```
USER      — 普通用户
ADMIN     — 管理员
```

### 4.2 UserStatus

```
ACTIVE    — 正常
BANNED    — 封禁
```

### 4.3 OrderStatus

```
PENDING_PAYMENT   — 待支付
PENDING_REVIEW    — 待审核
COMPLETED         — 已完成
REJECTED          — 已拒绝
```

### 4.4 MessageRole

```
USER        — 用户发送
ASSISTANT   — AI 角色回复
```

### 4.5 VipPlanType

```
MONTHLY     — 月卡
QUARTERLY   — 季卡
YEARLY      — 年卡
```

### 4.6 ApiPlatform

```
OPENAI / ANTHROPIC / GEMINI / DEEPSEEK / GROK
CUSTOM_OPENAI / CUSTOM_ANTHROPIC / CUSTOM_GEMINI
```

### 4.7 AdminActionType

```
USER_CREATE / USER_BAN / USER_UNBAN
CHARACTER_UNLIST
ORDER_APPROVE / ORDER_REJECT
VIP_GRANT / VIP_REVOKE
```

### 4.8 AdminTargetType

```
USER / CHARACTER / ORDER / VIP
```

### 4.9 TransactionType（V1.2 新增）

```
RECHARGE        — 充值入账（amount > 0）
VIP_PURCHASE    — VIP购买扣减（amount < 0）
CHAT_CONSUME    — 聊天消耗（预留，amount < 0）
ADMIN_ADJUST    — 管理员手动调账（amount 可正可负）
```

数据库实现：`VARCHAR(30) NOT NULL`，CHECK 约束。

---

## 第五部分：索引策略

### 5.1 唯一索引

| 表 | 索引 | 理由 |
|----|------|------|
| User | `LOWER(email) UNIQUE` | 防重复注册 |
| User | `id PRIMARY KEY` | UUID v7 |
| Character | `id PRIMARY KEY` | UUID v7 |
| Message | `id PRIMARY KEY` | UUID v7 |
| Memory | `id PRIMARY KEY` | UUID v7 |
| ApiConfig | `id PRIMARY KEY` | UUID v7 |
| ApiConfig | **`UNIQUE(user_id) WHERE is_default = TRUE`** | **V1.2：每用户最多一个默认配置** |
| Order | `id PRIMARY KEY` | UUID v7 |
| Order | `transaction_id UNIQUE` | 防重复审核 |
| VipRecord | `id PRIMARY KEY` | UUID v7 |
| AdminLog | `id PRIMARY KEY` | UUID v7 |
| StarDiamondTransaction | `id PRIMARY KEY` | UUID v7 |

### 5.2 普通索引

| 表 | 索引 | 理由 |
|----|------|------|
| Character | `(user_id)` | "我的角色" |
| Character | `(is_official)` | 官方角色 |
| Message | `(character_id, created_at DESC)` | 聊天历史 |
| Message | `(user_id, character_id)` | 用户在某角色的消息 |
| Memory | `(character_id, user_id)` | 记忆检索 |
| Memory | `(importance DESC)` | 淘汰排序 |
| ApiConfig | `(user_id)` | 用户配置列表 |
| Order | `(user_id)` | 充值记录 |
| Order | `(status)` | 审核队列 |
| VipRecord | `(user_id)` | VIP 历史 |
| VipRecord | `(expires_at)` | 到期检查 |
| AdminLog | `(admin_id, created_at DESC)` | 操作记录 |
| AdminLog | `(request_id)` | 请求关联排查 |
| StarDiamondTransaction | `(user_id, created_at DESC)` | 用户流水查询 |
| StarDiamondTransaction | `(type)` | 按类型过滤 |
| StarDiamondTransaction | `(reference_id)` | 关联业务记录查询 |

### 5.3 联合索引

| 表 | 联合索引 | 理由 |
|----|---------|------|
| Message | `(character_id, created_at DESC)` | 聊天分页 |
| Memory | `(character_id, user_id, importance DESC)` | 记忆检索 |
| Order | `(status, created_at DESC)` | 审核队列 |

### 5.4 部分索引

| 表 | 部分索引 | 理由 |
|----|---------|------|
| Character | `WHERE deleted_at IS NULL AND user_id IS NOT NULL` | 活跃角色 |
| Order | `WHERE status = 'PENDING_REVIEW'` | 待审核队列 |

> **V1.2 删除**：`INDEX(parent_message_id)` — 随 parent_message_id 字段一并移除。

---

## 第六部分：数据安全策略

### 6.1 API Key 加密

- 算法：AES-256-CBC
- 密钥：环境变量 `API_KEY_ENCRYPTION_KEY`（32字节）
- 存储格式：`iv:encrypted`
- 明文永不写入数据库、永不记录日志、永不返回前端

### 6.2 订单幂等保障

- transaction_id UNIQUE 约束防重复审核
- 应用层预检查双重保障

### 6.3 资金流水完整性（V1.2 新增）

- 所有星钻余额变动必须原子操作：写入 StarDiamondTransaction + 更新 User.star_diamonds
- 流水不可修改、不可删除
- 定期对账：SUM(StarDiamondTransaction.amount) WHERE user_id = X 应等于 User.star_diamonds WHERE id = X

### 6.4 管理员日志不可修改

AdminLog 无 UPDATE/DELETE 接口。

### 6.5 封禁用户保留历史数据

封禁仅修改 status。所有关联数据完整保留。

### 6.6 Email 统一小写

存储/查询统一 LOWER。UNIQUE 索引兜底。

---

## 第七部分：数据库阶段禁止项

### 7.1 明确禁止的表

好感度表、关系等级表、角色广场表、角色发布表、角色排行表、角色点赞表、角色收藏表、邀请码表、签到表、任务表、世界系统表、剧情系统表、Agent 系统表、群聊表、创作者分润表、首页配置表、话题/社区表、通知/推送表、举报/反馈表、系统配置表（共 20 项）

### 7.2 明确禁止的字段

affection、intimacy、love_value、relationship_level、is_published、likes_count、views_count、hot_score、invite_code、invited_by、check_in_streak、last_check_in

### 7.3 V1.2 新增禁止项

| 禁止项 | 说明 |
|--------|------|
| **Conversation Branch / Tree** | 不保留重生成历史、不支持版本切换、不支持会话分支。Message 为扁平线性结构 |
| **owner_type** | 不使用多态关联（如 owner_type + owner_id）替代明确外键 |
| **actor_snapshot** | AdminLog 不使用操作者快照字段，通过 admin_id 关联实时查询 |
| **pgvector 强制依赖** | embedding 用 JSONB NULL 预留。MVP 不强制安装 pgvector 扩展 |

---

## 附录：版本变更记录

### V1.2（2026-06-07）

| # | 变更项 | 说明 |
|---|--------|------|
| 1 | **删除 Message 再生系统** | 移除 parent_message_id、generation_index、Conversation Tree。重新生成改为 DELETE + INSERT 覆盖模式 |
| 2 | **新增 StarDiamondTransaction** | 完整资金流水表。所有余额变动必须写流水。含 RECHARGE/VIP_PURCHASE/CHAT_CONSUME/ADMIN_ADJUST 四种类型 |
| 3 | **ApiConfig.is_default** | 新增 BOOLEAN + 部分唯一索引 `UNIQUE(user_id) WHERE is_default = TRUE`。ProviderGateway 优先读取默认配置 |
| 4 | **新增禁止项** | Conversation Branch/Tree、owner_type、actor_snapshot、pgvector 强制依赖 |

### V1.1（2026-06-07）

- User.role 与 VIP 解耦、Character.version、Memory.embedding 预留、ApiConfig.is_active、Order 幂等字段、AdminLog.request_id、索引优化、email 小写、金额类型修正

---

## 约束冻结声明

Database Design Constraints Report V1.2（最终冻结版）已完成。

- 9 个实体（含新增 StarDiamondTransaction）
- 8 组关系 + 1 组新增（User → StarDiamondTransaction）
- 9 个枚举（含新增 TransactionType）
- 完整索引策略（含 ApiConfig 部分唯一索引）
- 资金流水完整性保障

**状态**：**冻结**，可进入 Phase 1.1 Database Schema Design

**下一步**：Phase 1.1 — 基于本约束报告，输出完整 Drizzle Schema