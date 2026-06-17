# 叙境-web Audit Log Schema 设计

> **文档版本**：v1.0.0  
> **创建日期**：2026-06-17  
> **安全等级**：P0 — 审计基础设施  
> **状态**：方案设计（未执行）

---

## 1. 设计目标

### 1.1 核心需求

1. **可追溯**：所有敏感操作（数据变更、文件上传、权限变更）留有审计记录
2. **不可篡改**：审计日志写入后不可修改或删除
3. **可查询**：支持按用户、操作类型、时间范围、目标实体等多维度查询
4. **低侵入**：对现有业务逻辑影响最小，通过中间件/工具函数集成
5. **可扩展**：支持未来新增审计事件类型

### 1.2 审计范围

| 类别 | 审计事件 | 优先级 |
|------|----------|--------|
| 文件上传 | 上传成功/失败/拒绝 | P0 |
| 数据变更 | character/message/conversation CRUD | P0 |
| 认证事件 | 登录/登出/Token刷新/认证失败 | P0 |
| 权限变更 | VIP变更/管理员操作 | P1 |
| 系统配置 | API配置/系统参数变更 | P1 |
| 数据删除 | 任何DELETE操作 | P0 |

---

## 2. 数据库 Schema

### 2.1 audit_logs 表

```sql
-- ==============================================================================
-- 叙境-web 审计日志表
-- ==============================================================================
-- 用途：记录所有敏感操作的审计轨迹
-- 特性：INSERT-ONLY（仅插入，禁止UPDATE/DELETE）
-- 存储：PostgreSQL，独立于业务表
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    -- 主键
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 操作时间
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 操作者信息
    actor_id        UUID NOT NULL,                    -- 操作者用户ID（关联 users.id）
    actor_type      VARCHAR(20) NOT NULL DEFAULT 'user',  -- 操作者类型：user / system / admin
    actor_ip        VARCHAR(45),                      -- 操作者IP（支持IPv6）
    actor_ua        VARCHAR(500),                     -- User-Agent（截断至500字符）

    -- 操作描述
    action          VARCHAR(50) NOT NULL,             -- 操作类型（见 AUDIT_ACTIONS.md）
    action_category VARCHAR(30) NOT NULL,             -- 操作分类：auth / data / file / system
    action_result   VARCHAR(20) NOT NULL DEFAULT 'success', -- 结果：success / failure / denied
    error_message   TEXT,                             -- 失败原因（仅 failure/denied 时记录）

    -- 目标实体
    target_type     VARCHAR(50) NOT NULL,             -- 目标实体类型：character / message / conversation / user / file / system
    target_id       VARCHAR(255) NOT NULL,            -- 目标实体ID
    target_name     VARCHAR(255),                     -- 目标实体名称/描述（冗余，便于查询）

    -- 变更详情
    old_value       JSONB,                            -- 变更前值（UPDATE时记录）
    new_value       JSONB,                            -- 变更后值（INSERT/UPDATE时记录）
    metadata        JSONB DEFAULT '{}',               -- 附加元数据（文件大小、MIME类型等）

    -- 请求上下文
    request_id      VARCHAR(100),                     -- 请求追踪ID
    request_method  VARCHAR(10),                      -- HTTP方法：GET / POST / PUT / PATCH / DELETE
    request_path    VARCHAR(500),                     -- 请求路径

    -- 数据生命周期
    retention_until TIMESTAMPTZ                       -- 保留期限（用于自动归档策略）
);

-- ==============================================================================
-- 索引设计
-- ==============================================================================

-- 1. 时间范围查询（最常用：按时间查日志）
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- 2. 按操作者查询（查某用户的所有操作）
CREATE INDEX idx_audit_logs_actor_id ON audit_logs (actor_id, created_at DESC);

-- 3. 按操作类型查询（查某类操作）
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at DESC);

-- 4. 按目标实体查询（查某实体的变更历史）
CREATE INDEX idx_audit_logs_target ON audit_logs (target_type, target_id, created_at DESC);

-- 5. 按操作结果查询（查失败/拒绝的操作）
CREATE INDEX idx_audit_logs_result ON audit_logs (action_result, created_at DESC)
    WHERE action_result IN ('failure', 'denied');

-- 6. 按分类查询（查某分类下的操作）
CREATE INDEX idx_audit_logs_category ON audit_logs (action_category, created_at DESC);

-- 7. JSONB 索引（按元数据查询，如按文件类型查上传记录）
CREATE INDEX idx_audit_logs_metadata ON audit_logs USING gin (metadata)
    WHERE metadata IS NOT NULL AND metadata != '{}';

-- 8. 请求追踪（按 request_id 查完整请求链路）
CREATE INDEX idx_audit_logs_request_id ON audit_logs (request_id)
    WHERE request_id IS NOT NULL;

-- ==============================================================================
-- 分区策略（数据量增长后启用）
-- ==============================================================================
-- 当 audit_logs 超过 100 万行时，建议按月分区
-- 
-- CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
--     FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
--
-- 自动分区管理可通过 pg_partman 扩展实现
-- ==============================================================================
```

### 2.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | UUID | 自动 | 主键，自动生成 |
| `created_at` | TIMESTAMPTZ | 自动 | 操作时间，默认当前时间 |
| `actor_id` | UUID | 是 | 操作者ID，系统操作使用 `00000000-0000-0000-0000-000000000000` |
| `actor_type` | VARCHAR(20) | 是 | `user`/`system`/`admin` |
| `actor_ip` | VARCHAR(45) | 否 | 客户端IP，从 `x-forwarded-for` 或 `x-real-ip` 获取 |
| `actor_ua` | VARCHAR(500) | 否 | User-Agent，截断至500字符 |
| `action` | VARCHAR(50) | 是 | 操作类型，见 AUDIT_ACTIONS.md 枚举 |
| `action_category` | VARCHAR(30) | 是 | `auth`/`data`/`file`/`system` |
| `action_result` | VARCHAR(20) | 是 | `success`/`failure`/`denied` |
| `error_message` | TEXT | 否 | 失败原因 |
| `target_type` | VARCHAR(50) | 是 | 目标实体类型 |
| `target_id` | VARCHAR(255) | 是 | 目标实体ID |
| `target_name` | VARCHAR(255) | 否 | 目标名称（冗余字段，便于直接查询） |
| `old_value` | JSONB | 否 | 变更前值（仅UPDATE操作） |
| `new_value` | JSONB | 否 | 变更后值（INSERT/UPDATE操作） |
| `metadata` | JSONB | 否 | 附加元数据 |
| `request_id` | VARCHAR(100) | 否 | 请求追踪ID |
| `request_method` | VARCHAR(10) | 否 | HTTP方法 |
| `request_path` | VARCHAR(500) | 否 | 请求路径 |
| `retention_until` | TIMESTAMPTZ | 否 | 保留期限 |

### 2.3 数据保护规则

```sql
-- ==============================================================================
-- INSERT-ONLY 保护：禁止 UPDATE 和 DELETE
-- ==============================================================================

-- 方式1：行级安全策略（RLS）
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 仅允许 INSERT，禁止 UPDATE/DELETE（对应用角色）
CREATE POLICY audit_logs_insert_only ON audit_logs
    FOR INSERT
    WITH CHECK (true);

-- 超级管理员可查询（只读）
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT
    USING (true);  -- 根据实际角色系统调整

-- 方式2：触发器保护（更可靠，不依赖角色配置）
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'audit_logs 表禁止 UPDATE 操作';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'audit_logs 表禁止 DELETE 操作';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER trg_prevent_audit_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- ==============================================================================
-- 归档策略（替代 DELETE）
-- ==============================================================================
-- 超过保留期限的记录通过归档函数迁移到归档表，而非直接删除
--
-- CREATE TABLE audit_logs_archive (LIKE audit_logs INCLUDING ALL);
-- 
-- CREATE OR REPLACE FUNCTION archive_old_audit_logs()
-- RETURNS void AS $$
-- BEGIN
--     WITH moved AS (
--         DELETE FROM audit_logs
--         WHERE retention_until IS NOT NULL
--           AND retention_until < now()
--         RETURNING *
--     )
--     INSERT INTO audit_logs_archive SELECT * FROM moved;
-- END;
-- $$ LANGUAGE plpgsql;
-- ==============================================================================
```

---

## 3. 与现有 Schema 的关系

### 3.1 现有表映射

| 现有表 | 审计目标类型 | 审计操作 |
|--------|-------------|----------|
| `users` | `user` | create / update / delete |
| `characters` | `character` | create / update / delete |
| `conversations` | `conversation` | create / update / delete |
| `messages` | `message` | create / update / delete |
| `user_character_settings` | `user_character_settings` | create / update / delete |
| `memories` | `memory` | create / delete |
| `orders` | `order` | create / update |
| `vip-records` | `vip_record` | create |
| `star-diamond-transactions` | `transaction` | create |
| `api-configs` | `api_config` | update |
| `admin-logs` | `admin_log` | create（现有表，审计日志补充） |

### 3.2 与 admin-logs 表的关系

| 维度 | admin-logs（现有） | audit_logs（新增） |
|------|-------------------|-------------------|
| 定位 | 管理员操作日志 | 全局审计日志 |
| 范围 | 仅管理员操作 | 所有用户 + 系统操作 |
| 结构 | 简单文本记录 | 结构化（old/new value） |
| 保护 | 无 | INSERT-ONLY |
| 查询 | 基础 | 多维度索引 |

> `admin-logs` 继续保留用于管理员操作，`audit_logs` 作为全局审计层覆盖所有操作。

---

## 4. Drizzle ORM Schema

对应的 TypeScript Schema 定义见 `audit-log.schema.ts`，与本文档保持同步。

---

## 5. 查询模式

### 5.1 常用查询

```sql
-- 查询某用户最近操作
SELECT action, target_type, target_id, action_result, created_at
FROM audit_logs
WHERE actor_id = '019ebab6-115b-7651-8c62-f2846dfbed9f'
ORDER BY created_at DESC
LIMIT 50;

-- 查询某角色的变更历史
SELECT actor_id, action, old_value, new_value, created_at
FROM audit_logs
WHERE target_type = 'character'
  AND target_id = '019eae1d-...'
ORDER BY created_at DESC;

-- 查询上传操作记录
SELECT actor_id, target_name, metadata->>'fileSize' as size,
       metadata->>'mimeType' as type, action_result, created_at
FROM audit_logs
WHERE action_category = 'file'
  AND action = 'file.upload'
ORDER BY created_at DESC
LIMIT 100;

-- 查询认证失败记录
SELECT actor_id, actor_ip, error_message, created_at
FROM audit_logs
WHERE action = 'auth.login'
  AND action_result = 'failure'
ORDER BY created_at DESC
LIMIT 50;

-- 查询数据删除操作
SELECT actor_id, action, target_type, target_id, old_value, created_at
FROM audit_logs
WHERE action LIKE '%delete'
  AND action_result = 'success'
ORDER BY created_at DESC;

-- 按请求追踪完整链路
SELECT action, target_type, target_id, action_result, created_at
FROM audit_logs
WHERE request_id = 'req-xxx'
ORDER BY created_at;
```

### 5.2 统计查询

```sql
-- 每日操作统计
SELECT DATE(created_at) as date, action_category, action_result, COUNT(*)
FROM audit_logs
WHERE created_at >= now() - INTERVAL '30 days'
GROUP BY DATE(created_at), action_category, action_result
ORDER BY date DESC, action_category;

-- 高频操作者（Top 10）
SELECT actor_id, COUNT(*) as op_count
FROM audit_logs
WHERE created_at >= now() - INTERVAL '7 days'
GROUP BY actor_id
ORDER BY op_count DESC
LIMIT 10;

-- 失败率统计
SELECT action, 
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE action_result = 'failure') as failures,
       ROUND(100.0 * COUNT(*) FILTER (WHERE action_result = 'failure') / COUNT(*), 2) as failure_rate
FROM audit_logs
WHERE created_at >= now() - INTERVAL '7 days'
GROUP BY action
HAVING COUNT(*) FILTER (WHERE action_result = 'failure') > 0
ORDER BY failure_rate DESC;
```

---

## 6. 存储估算

| 场景 | 日均记录 | 月增量 | 年增量 |
|------|----------|--------|--------|
| 低负载（10用户） | ~200 条 | ~6K 条 / 2MB | ~73K 条 / 24MB |
| 中负载（100用户） | ~2K 条 | ~60K 条 / 20MB | ~730K 条 / 240MB |
| 高负载（1000用户） | ~20K 条 | ~600K 条 / 200MB | ~7.3M 条 / 2.4GB |

> JSONB 字段（old_value/new_value）是主要空间消耗来源。
> 建议超过 100 万行时启用分区策略。

---

## 7. 实施检查清单

- [ ] 执行 CREATE TABLE 语句创建 audit_logs 表
- [ ] 创建所有索引
- [ ] 部署 INSERT-ONLY 保护触发器
- [ ] 配置 Drizzle Schema（audit-log.schema.ts）
- [ ] 实现审计日志中间件/工具函数
- [ ] 集成到现有 API 路由
- [ ] 配置归档策略（可选）
- [ ] 设置监控告警（失败率异常）
- [ ] 执行首次审计查询验证
