# 叙境 P0 安全边界建设报告

> **项目**：叙境（XuJing-web）安全加固
> **优先级**：P0 — 最高
> **版本**：1.0.0
> **日期**：2026-06-17
> **状态**：方案设计完成，待实施
> **作者**：OrcaTerm AI

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [事故回顾](#2-事故回顾)
3. [风险矩阵](#3-风险矩阵)
4. [四维安全方案](#4-四维安全方案)
5. [文件清单与交付物](#5-文件清单与交付物)
6. [实施路线图](#6-实施路线图)
7. [回滚策略](#7-回滚策略)
8. [验证清单](#8-验证清单)
9. [待办事项](#9-待办事项)
10. [附录](#10-附录)

---

## 1. 执行摘要

### 1.1 背景

2026-06-17 05:08:17，因手动执行 `rsync -avz --delete standalone/public/ /var/www/xujing/public/`（history #1087），导致 `/var/www/xujing/public/uploads/` 目录下全部用户上传文件被删除且不可恢复。事故暴露了叙境在文件存储、数据备份、操作审计三个维度的系统性安全缺陷。

### 1.2 影响评估

| 维度 | 影响 |
|------|------|
| **数据损失** | 9 个自建角色头像 + 2 个聊天背景图永久丢失 |
| **数据库残留** | 11 条无效 URL 引用（已清理置空） |
| **用户影响** | 角色头像显示异常、聊天背景缺失 |
| **根因** | uploads 与应用静态资源同目录 + rsync --delete + 无备份 + 无审计 |

### 1.3 建设目标

本次 P0 安全边界建设围绕四个核心维度，从架构层面消除同类事故复现可能：

| # | 维度 | 目标 | 状态 |
|---|------|------|------|
| ① | Uploads 独立存储 | uploads 目录与应用静态资源物理隔离 | ✅ 方案完成 |
| ② | PostgreSQL 自动备份 | 数据库每日自动备份，支持时间点恢复 | ✅ 方案完成 |
| ③ | Uploads 自动备份 | 上传文件每日增量备份，严禁 --delete | ✅ 方案完成 |
| ④ | Audit Log 基础设施 | 全操作审计追踪，INSERT-ONLY 保护 | ✅ 方案完成 |

---

## 2. 事故回顾

### 2.1 时间线

| 时间 | 事件 |
|------|------|
| 2026-06-17 05:08:17 | 手动执行 `rsync -avz --delete standalone/public/ /var/www/xujing/public/` |
| 同日 | uploads 目录下全部文件被删除 |
| 同日 | 发现 9 个角色头像 + 2 个聊天背景图丢失 |
| 同日 | 数据库 11 条 URL 引用变为无效（指向已删除文件） |
| 同日 | 数据库清理：characters 表 9 条 avatar_url 置空，user_character_settings 表 2 条 background_url 置空 |
| 同日 | P0 安全边界建设启动 |

### 2.2 根因分析

```
                    ┌─────────────────────────────┐
                    │      rsync --delete 误删      │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  uploads 与 public/ 同目录    │
                    │  rsync 目标包含 uploads/      │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
   ┌──────────▼──────────┐ ┌──────▼──────┐ ┌──────────▼──────────┐
   │ 无物理隔离           │ │ 无备份机制   │ │ 无审计追踪           │
   │ uploads 在 public/  │ │ 无法恢复     │ │ 无法定位责任人/时间   │
   └─────────────────────┘ └─────────────┘ └─────────────────────┘
```

### 2.3 不可恢复数据清单

**characters 表（9 条 avatar_url）：**

| 角色 | 原 avatar_url | 文件名 | 状态 |
|------|---------------|--------|------|
| 之之 | `https://43.138.193.173/uploads/e81dc794...jpg` | e81dc794...jpg | ❌ 不可恢复 |
| 江予白 | `https://43.138.193.173/uploads/42d413e0...jpg` | 42d413e0...jpg | ❌ 不可恢复 |
| 王橹杰 | `https://43.138.193.173/uploads/5e8d122e...jpeg` | 5e8d122e...jpeg | ❌ 不可恢复 |
| 薛桐 | `https://43.138.193.173/uploads/88c98bcc...jpeg` | 88c98bcc...jpeg | ❌ 不可恢复 |
| 许可晴 | `https://43.138.193.173/uploads/65b68c4f...jpg` | 65b68c4f...jpg | ❌ 不可恢复 |
| 闻敬业 | `https://43.138.193.173/uploads/f2259853...jpeg` | f2259853...jpeg | ❌ 不可恢复 |
| 闻衍和闻烬 | `https://43.138.193.173/uploads/5d41ee99...png` | 5d41ee99...png | ❌ 不可恢复 |
| 顾夜辞 | `https://43.138.193.173/uploads/7a64766d...jpg` | 7a64766d...jpg | ❌ 不可恢复 |
| 顾沉舟 | `https://43.138.193.173/uploads/c4c607e4...jpeg` | c4c607e4...jpeg | ❌ 不可恢复 |

**user_character_settings 表（2 条 background_url）：**

| 角色 | character_id | 原 background_url | 状态 |
|------|-------------|-------------------|------|
| 许可晴 | 019eae1d... | `/uploads/49891ffa...jpg` | ❌ 不可恢复 |
| 顾沉舟 | 019ec49a... | `/uploads/cca3c387...jpeg` | ❌ 不可恢复 |

---

## 3. 风险矩阵

### 3.1 事故前风险状态

| # | 风险 | 可能性 | 影响 | 等级 | 现状 |
|---|------|--------|------|------|------|
| R1 | rsync --delete 误删 uploads | 高 | 致命 | **P0** | ❌ 无防护 |
| R2 | uploads 目录无备份 | 确定 | 致命 | **P0** | ❌ 已发生 |
| R3 | 数据库无自动备份 | 中 | 致命 | **P0** | ❌ 无备份 |
| R4 | 操作无审计追踪 | 高 | 严重 | **P0** | ❌ 无审计 |
| R5 | 上传 API 无路径遍历防护 | 低 | 高 | P1 | ⚠️ 依赖 UUID |
| R6 | 上传 API 无病毒扫描 | 低 | 中 | P2 | ❌ 无扫描 |
| R7 | 上传 API 无文件内容校验 | 低 | 中 | P2 | ⚠️ 仅 MIME |
| R8 | 无文件删除 API | 低 | 低 | P3 | ✅ 无删除入口 |

### 3.2 方案实施后风险状态

| # | 风险 | 原等级 | 新等级 | 降幅 | 残余风险 |
|---|------|--------|--------|------|----------|
| R1 | rsync 误删 | P0 | P3 | ↓↓ | uploads 物理隔离，deploy.sh 排除 |
| R2 | uploads 无备份 | P0 | P2 | ↓↓ | 每日增量 + 周日快照，但无异地容灾 |
| R3 | 数据库无备份 | P0 | P2 | ↓↓ | 每日 pg_dump，但无异地容灾 |
| R4 | 无审计追踪 | P0 | P2 | ↓↓ | audit_logs 全覆盖，但未实施 RLS |
| R5 | 路径遍历 | P1 | P2 | ↓ | UUID 命名 + 独立目录，但未加校验 |
| R6 | 病毒扫描 | P2 | P2 | — | 待后续版本 |
| R7 | 文件内容校验 | P2 | P2 | — | 待后续版本 |
| R8 | 无删除 API | P3 | P3 | — | 无删除需求 |

---

## 4. 四维安全方案

### 4.1 ① Uploads 独立存储

**核心变更**：将 uploads 从 `/var/www/xujing/public/uploads/` 迁移至 `/var/data/xujing/uploads/`

| 项目 | 当前 | 目标 |
|------|------|------|
| 存储路径 | `/var/www/xujing/public/uploads/` | `/var/data/xujing/uploads/` |
| Nginx 映射 | `location /uploads/` → `alias /var/www/xujing/public/uploads/` | `location /uploads/` → `alias /var/data/xujing/uploads/` |
| UPLOAD_DIR | `/var/www/xujing/public/uploads` | `/var/data/xujing/uploads` |
| deploy.sh | 无 --exclude | `rsync --exclude='uploads'` |
| Docker 卷 | 无 | `./data/uploads:/var/data/xujing/uploads` |

**关键设计：**
- 物理隔离：uploads 不再位于 public/ 目录下，rsync --delete 无法触及
- deploy.sh 增强：`rsync -av --exclude='uploads' public/ /var/www/xujing/public/`
- Nginx alias：通过 `location /uploads/` alias 到新路径，URL 不变
- PM2 ecosystem：通过 env 配置 UPLOAD_DIR

**详细方案**：参见 `DOCKER_STORAGE_PLAN.md`、`nginx-xujing-uploads.conf`

---

### 4.2 ② PostgreSQL 自动备份

**核心策略**：每日 02:00 自动 pg_dump，3-2-1 备份法则

| 项目 | 配置 |
|------|------|
| 备份时间 | 每日 02:00 CST |
| 备份方式 | `pg_dump -Fc | gzip`（自定义格式压缩） |
| 存储路径 | `/var/backup/xujing/postgres/` |
| 保留策略 | 每日保留 7 天 / 每周保留 4 周 / 每月保留 6 月 |
| 预估大小 | ~5MB/次（压缩后） |
| 磁盘预留 | 5GB |
| 恢复方式 | `pg_restore -d xujing backup.dump` |

**保留策略详情：**
```
每日备份 → 保留 7 天 → 自动清理
     └── 每周日备份 → 额外保留 4 周
              └── 每月1日备份 → 额外保留 6 月
```

**详细方案**：参见 `BACKUP_STRATEGY.md`、`scripts/backup-postgres.sh`、`cron-postgres-backup.example`

---

### 4.3 ③ Uploads 自动备份

**核心策略**：每日 03:00 rsync 增量备份，**严禁 --delete**

| 项目 | 配置 |
|------|------|
| 备份时间 | 每日 03:00 CST（增量同步） |
| 快照时间 | 每周日 03:30 CST（tar 全量快照） |
| 增量方式 | `rsync -a`（**禁止 --delete**） |
| 快照方式 | `tar czf` 保留 4 周 |
| 存储路径 | `/var/backup/xujing/uploads/`（增量）+ `/var/backup/xujing/uploads/snapshots/`（快照） |
| 源目录 | `/var/data/xujing/uploads/`（迁移后） |
| 恢复方式 | 单文件 cp / 全量 rsync / 快照 tar xf |

**安全铁律：**
- ❌ **严禁** `rsync --delete` — 备份只增不删
- ✅ 备份前校验源目录存在性
- ✅ 增量 + 快照双重保障

**详细方案**：参见 `UPLOAD_BACKUP_PLAN.md`、`scripts/backup-uploads.sh`

---

### 4.4 ④ Audit Log 基础设施

**核心设计**：INSERT-ONLY 审计日志，全操作追踪

| 项目 | 设计 |
|------|------|
| 表名 | `audit_logs` |
| 主键 | UUIDv7（时间排序） |
| 字段数 | 20 |
| 操作定义 | 26 个 AuditAction 常量（12 分类） |
| 枚举 | 4 个 pgEnum（actor_type / action_category / action_result / audit_target_type） |
| 索引 | 8 个（含 2 个部分索引） |
| 保护 | INSERT-ONLY（RLS + 触发器，待实施） |
| 归档 | 超 100 万行按月分区 |

**AuditAction 分类：**

| 分类 | 操作数 | 操作列表 |
|------|--------|----------|
| auth | 4 | login, logout, token.refresh, failure |
| file | 2 | upload, upload.rejected |
| character | 3 | create, update, delete |
| message | 3 | create, update, delete |
| conversation | 3 | create, update, delete |
| memory | 2 | create, delete |
| user_character_settings | 3 | create, update, delete |
| user | 3 | create, update, delete |
| order | 2 | create, update |
| vip_record | 1 | create |
| transaction | 1 | create |
| system | 2 | api_config.update, system.config.update |

**与 admin-logs 互补关系：**
- `audit_logs`：全用户、细粒度、INSERT-ONLY
- `admin_logs`：仅管理员、粗粒度、无特殊保护
- 管理员操作同时写入两张表

**详细方案**：参见 `AUDIT_LOG_SCHEMA.md`、`AUDIT_ACTIONS.md`、`src/db/schema/audit-logs.ts`

---

## 5. 文件清单与交付物

### 5.1 已交付文件（12/12）

| # | 文件路径 | 类型 | 说明 |
|---|----------|------|------|
| 1 | `docs/p0-security/UPLOAD_ASSET_REPORT.md` | 文档 | 上传资产事故报告 |
| 2 | `docs/p0-security/nginx-xujing-uploads.conf` | 配置 | Nginx uploads 独立存储配置 |
| 3 | `docs/p0-security/DOCKER_STORAGE_PLAN.md` | 文档 | Docker 存储方案与迁移计划 |
| 4 | `docs/p0-security/BACKUP_STRATEGY.md` | 文档 | 3-2-1 备份策略总纲 |
| 5 | `docs/p0-security/scripts/backup-postgres.sh` | 脚本 | PostgreSQL 自动备份脚本 |
| 6 | `docs/p0-security/cron-postgres-backup.example` | 配置 | crontab 备份定时任务示例 |
| 7 | `docs/p0-security/scripts/backup-uploads.sh` | 脚本 | Uploads 增量备份脚本 |
| 8 | `docs/p0-security/UPLOAD_BACKUP_PLAN.md` | 文档 | Uploads 备份详细方案 |
| 9 | `docs/p0-security/AUDIT_LOG_SCHEMA.md` | 文档 | 审计日志表结构设计 |
| 10 | `docs/p0-security/AUDIT_ACTIONS.md` | 文档 | 审计操作常量参考手册 |
| 11 | `docs/p0-security/SECURITY_P0_REPORT.md` | 文档 | P0 安全边界建设总结报告（本文件） |
| 12 | `src/db/schema/audit-logs.ts` | 代码 | 审计日志 Schema 定义 |

### 5.2 文件依赖关系

```
SECURITY_P0_REPORT.md (本文件)
├── UPLOAD_ASSET_REPORT.md          ← 事故详情
├── DOCKER_STORAGE_PLAN.md          ← ① Uploads 独立存储
│   └── nginx-xujing-uploads.conf   ← Nginx 配置
├── BACKUP_STRATEGY.md              ← ②③ 备份策略总纲
│   ├── scripts/backup-postgres.sh  ← ② PG 备份脚本
│   ├── cron-postgres-backup.example ← ② crontab 示例
│   ├── UPLOAD_BACKUP_PLAN.md       ← ③ Uploads 备份方案
│   └── scripts/backup-uploads.sh   ← ③ Uploads 备份脚本
└── AUDIT_LOG_SCHEMA.md             ← ④ 审计日志设计
    ├── AUDIT_ACTIONS.md            ← ④ 操作常量参考
    └── src/db/schema/audit-logs.ts ← ④ Schema 代码
```

---

## 6. 实施路线图

### 6.1 阶段划分

```
Phase 1: 基础防护（1-2 天）          Phase 2: 存储迁移（1 天）
┌─────────────────────────┐         ┌─────────────────────────┐
│ ✅ PG 备份脚本部署       │         │ ✅ 创建 /var/data/xujing │
│ ✅ Uploads 备份脚本部署  │    →    │ ✅ 迁移 uploads 目录     │
│ ✅ crontab 定时任务配置  │         │ ✅ Nginx 配置切换        │
│ ✅ 首次备份验证          │         │ ✅ UPLOAD_DIR 环境变量   │
└─────────────────────────┘         │ ✅ deploy.sh 增强        │
                                    └────────────┬────────────┘
                                                 │
Phase 3: 审计基础设施（2-3 天）      Phase 4: 强化与验证（1-2 天）
┌─────────────────────────┐         ┌─────────────────────────┐
│ ✅ schema/index.ts 更新  │         │ ✅ RLS 策略实施          │
│ ✅ 数据库迁移执行        │    →    │ ✅ 恢复演练              │
│ ✅ 业务代码埋点          │         │ ✅ 安全审计              │
│ ✅ INSERT-ONLY 触发器    │         │ ✅ 监控告警              │
└─────────────────────────┘         └─────────────────────────┘
```

### 6.2 详细步骤

#### Phase 1：基础防护

| 步骤 | 操作 | 预估时间 | 风险 |
|------|------|----------|------|
| 1.1 | 创建备份目录 `/var/backup/xujing/{postgres,uploads,snapshots}` | 1 min | 无 |
| 1.2 | 部署 `backup-postgres.sh`，设置执行权限 | 2 min | 无 |
| 1.3 | 部署 `backup-uploads.sh`，设置执行权限 | 2 min | 无 |
| 1.4 | 配置 crontab 定时任务 | 2 min | 无 |
| 1.5 | 手动执行首次 PG 备份并验证 | 5 min | 低 |
| 1.6 | 手动执行首次 Uploads 备份并验证 | 5 min | 低 |

#### Phase 2：存储迁移

| 步骤 | 操作 | 预估时间 | 风险 |
|------|------|----------|------|
| 2.1 | 创建 `/var/data/xujing/uploads/` 目录 | 1 min | 无 |
| 2.2 | 停止 PM2 xujing-app | 10 sec | 中（停服） |
| 2.3 | `cp -a /var/www/xujing/public/uploads/* /var/data/xujing/uploads/` | 1 min | 低 |
| 2.4 | 验证文件完整性（数量 + 大小） | 2 min | 无 |
| 2.5 | 更新 Nginx 配置（alias 指向新路径） | 2 min | 中 |
| 2.6 | 更新 UPLOAD_DIR 环境变量 | 1 min | 低 |
| 2.7 | 更新 deploy.sh 增加 `--exclude='uploads'` | 2 min | 低 |
| 2.8 | 启动 PM2 xujing-app | 10 sec | 低 |
| 2.9 | 验证上传功能正常 | 5 min | 低 |

#### Phase 3：审计基础设施

| 步骤 | 操作 | 预估时间 | 风险 |
|------|------|----------|------|
| 3.1 | 更新 `schema/index.ts` 添加 auditLogs 导出 | 2 min | 低 |
| 3.2 | 执行数据库迁移创建 audit_logs 表 | 5 min | 中 |
| 3.3 | 创建 INSERT-ONLY 触发器 | 2 min | 低 |
| 3.4 | 配置 RLS 策略 | 5 min | 中 |
| 3.5 | 业务代码埋点（auth/file/character 等关键操作） | 2-3 hr | 中 |
| 3.6 | 验证审计日志写入 | 10 min | 低 |

#### Phase 4：强化与验证

| 步骤 | 操作 | 预估时间 | 风险 |
|------|------|----------|------|
| 4.1 | PG 备份恢复演练 | 30 min | 低 |
| 4.2 | Uploads 备份恢复演练 | 15 min | 低 |
| 4.3 | 安全审计（上传 API / 权限 / 日志） | 1 hr | 低 |
| 4.4 | 监控告警配置（磁盘 / 备份失败） | 1 hr | 低 |

### 6.3 总预估时间

| 阶段 | 时间 | 停服时间 |
|------|------|----------|
| Phase 1 | 20 min | 0 |
| Phase 2 | 30 min | ~2 min |
| Phase 3 | 3-4 hr | 0 |
| Phase 4 | 3 hr | 0 |
| **合计** | **7-8 hr** | **~2 min** |

---

## 7. 回滚策略

### 7.1 Phase 1 回滚（备份脚本）

- 删除 crontab 定时任务
- 保留备份文件（不删除）
- 无业务影响

### 7.2 Phase 2 回滚（存储迁移）

| 步骤 | 操作 |
|------|------|
| 1 | 停止 PM2 xujing-app |
| 2 | 恢复 Nginx 配置（alias 指回 `/var/www/xujing/public/uploads/`） |
| 3 | 恢复 UPLOAD_DIR 环境变量 |
| 4 | 重启 Nginx + PM2 |
| 5 | 验证上传功能 |

> 迁移后原目录 `/var/www/xujing/public/uploads/` 保留不删除，可随时回滚

### 7.3 Phase 3 回滚（审计日志）

| 步骤 | 操作 |
|------|------|
| 1 | 移除业务代码中的审计埋点 |
| 2 | `DROP TABLE audit_logs`（审计日志为新增表，无关联依赖） |
| 3 | 恢复 `schema/index.ts` |

---

## 8. 验证清单

### 8.1 Phase 1 验证

- [ ] `/var/backup/xujing/postgres/` 目录存在且包含 `.sql.gz` 文件
- [ ] `/var/backup/xujing/uploads/` 目录存在且与源目录同步
- [ ] crontab -l 显示两条定时任务
- [ ] 手动执行 `backup-postgres.sh` 成功
- [ ] 手动执行 `backup-uploads.sh` 成功
- [ ] 备份文件可正常解压/恢复

### 8.2 Phase 2 验证

- [ ] `/var/data/xujing/uploads/` 目录存在且包含所有文件
- [ ] Nginx 配置 alias 指向新路径
- [ ] `nginx -t` 测试通过
- [ ] 上传 API 正常工作（上传新文件）
- [ ] 已上传文件可通过 URL 访问
- [ ] deploy.sh 包含 `--exclude='uploads'`
- [ ] PM2 环境变量 UPLOAD_DIR 已更新

### 8.3 Phase 3 验证

- [ ] `schema/index.ts` 包含 auditLogs 导出
- [ ] 数据库中 audit_logs 表已创建
- [ ] 20 个字段 + 8 个索引存在
- [ ] 4 个 pgEnum 已创建
- [ ] INSERT-ONLY 触发器生效（UPDATE/DELETE 被拒绝）
- [ ] 业务操作产生审计记录
- [ ] 审计记录包含正确的 action / actor / target 信息

### 8.4 Phase 4 验证

- [ ] PG 备份恢复成功（数据完整）
- [ ] Uploads 备份恢复成功（文件完整）
- [ ] 上传 API 安全检查通过
- [ ] 磁盘监控告警配置完成
- [ ] 备份失败告警配置完成

---

## 9. 待办事项

### 9.1 P0 遗留（本次方案实施时处理）

| # | 事项 | 优先级 | 关联阶段 |
|---|------|--------|----------|
| 1 | 9 个自建角色头像需重新上传 | P0 | Phase 2 后 |
| 2 | 2 个聊天背景图需重新设置 | P0 | Phase 2 后 |
| 3 | `schema/index.ts` 添加 auditLogs 导出 | P0 | Phase 3 |
| 4 | deploy.sh 增加 `--exclude='uploads'` | P0 | Phase 2 |

### 9.2 P1 后续优化

| # | 事项 | 说明 |
|---|------|------|
| 1 | 上传 API 路径遍历防护 | 显式校验文件名不含 `..`/`/` |
| 2 | 上传 API 文件内容校验 | Magic bytes 校验而非仅 MIME |
| 3 | 备份异地容灾 | 腾讯云 COS 异地备份 |
| 4 | 审计日志查询 API | 管理后台审计日志查看界面 |
| 5 | 审计日志归档自动化 | 超 100 万行自动按月分区 |

### 9.3 P2 长期规划

| # | 事项 | 说明 |
|---|------|------|
| 1 | 文件病毒扫描 | ClamAV 集成 |
| 2 | 文件去重 | 相同内容文件复用存储 |
| 3 | 图片处理管线 | 缩略图/WebP 转换/CDN |
| 4 | Docker 容器化部署 | 按DOCKER_STORAGE_PLAN.md方案 |
| 5 | 对象存储迁移 | 腾讯云 COS 替代本地存储 |

---

## 10. 附录

### 10.1 环境信息

| 项目 | 值 |
|------|-----|
| 服务器 IP | 43.138.193.173 |
| 域名 | xujing.modelbridge.top |
| 操作系统 | Linux（CVM） |
| 应用端口 | 3003 |
| PM2 进程 | xujing-app |
| Nginx 配置 | /etc/nginx/conf.d/xujing.conf |
| 项目路径 | /root/XuJing-web/ |
| 数据库 | PostgreSQL 15 @ 127.0.0.1:5432/xujing |
| 当前 uploads | /var/www/xujing/public/uploads/（空） |
| 静态资源 | /usr/share/nginx/xujing-static/ |
| 公共资源 | /var/www/xujing/public/ |

### 10.2 数据库 Schema 概览

| 表名 | 说明 | 与审计关联 |
|------|------|------------|
| admin_logs | 管理员日志 | 互补（管理员操作双写） |
| api_configs | API 配置 | system.api_config.update |
| characters | 角色 | character.create/update/delete |
| conversations | 会话 | conversation.create/update/delete |
| memories | 记忆 | memory.create/delete |
| messages | 消息 | message.create/update/delete |
| orders | 订单 | order.create/update |
| star_diamond_transactions | 交易 | transaction.create |
| user_character_settings | 用户角色设置 | user_character_settings.create/update/delete |
| users | 用户 | user.create/update/delete |
| vip_records | VIP 记录 | vip_record.create |
| **audit_logs** | **审计日志（新增）** | **核心表** |

### 10.3 上传 API 安全现状

| 安全项 | 状态 | 说明 |
|--------|------|------|
| 认证 | ✅ | requireAuth 中间件 |
| 频率限制 | ✅ | free: 10/min, vip: 30/min |
| 文件类型 | ✅ | jpg/png/webp 白名单 |
| 文件大小 | ✅ | 10MB 限制 |
| UUID 命名 | ✅ | 防止文件名冲突和路径猜测 |
| 路径遍历防护 | ⚠️ | 依赖 UUID，无显式校验 |
| 病毒扫描 | ❌ | 未集成 |
| 文件内容校验 | ⚠️ | 仅 MIME 类型检查 |
| 文件删除 API | ❌ | 无删除入口（安全） |

### 10.4 备份存储估算

| 备份类型 | 单次大小 | 日增量 | 月增量 | 年增量 |
|----------|----------|--------|--------|--------|
| PostgreSQL | ~5 MB | 5 MB | 150 MB | 1.8 GB |
| Uploads（增量） | 视上传量 | ~10 MB | ~300 MB | ~3.6 GB |
| Uploads（快照） | ~50 MB | — | 200 MB | 2.4 GB |
| **合计** | — | ~15 MB | ~650 MB | ~7.8 GB |

> 预留磁盘空间：5 GB（当前），建议扩容至 10 GB

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-17 | 1.0.0 | 初始版本，P0 安全边界建设方案设计完成 |
