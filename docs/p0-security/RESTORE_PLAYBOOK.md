# 叙境（XuJing）恢复演练手册

> **版本**: 1.0.0  
> **创建日期**: 2026-06-17  
> **适用范围**: 叙境-web 生产环境备份恢复  
> **关联脚本**: `backup-master.sh` / `backup-postgres.sh` / `backup-uploads.sh`  
> **事故根因**: `rsync -avz --delete` 误删 uploads，无备份无审计（history #1087）

---

## 目录

1. [概述与原则](#1-概述与原则)
2. [备份架构速查](#2-备份架构速查)
3. [RUN_ID 定位机制](#3-run_id-定位机制)
4. [情景一：Uploads 误删局部恢复](#4-情景一uploads-误删局部恢复)
5. [情景二：DB + 文件全量回滚](#5-情景二db--文件全量回滚)
6. [恢复验证清单](#6-恢复验证清单)
7. [常见问题与注意事项](#7-常见问题与注意事项)
8. [附录：命令速查卡](#8-附录命令速查卡)

---

## 1. 概述与原则

### 1.1 设计目标

本手册覆盖叙境生产环境的两大恢复场景，确保在数据丢失或损坏时能够**快速、安全、可验证**地恢复业务数据。

### 1.2 恢复铁律

| # | 铁律 | 说明 |
|---|------|------|
| 1 | **先备份当前状态** | 恢复前必须先对当前（即使已损坏的）数据做快照，防止恢复操作造成二次破坏 |
| 2 | **基于 RUN_ID 定位** | 每次恢复必须先确认目标 RUN_ID，禁止凭记忆猜测备份时间点 |
| 3 | **只增不删** | Uploads 恢复使用 `rsync -av`（**严禁 `--delete`**），只补充缺失文件，不删除现有文件 |
| 4 | **先验证后上线** | 恢复完成后必须执行验证清单，确认数据完整性后再开放用户访问 |
| 5 | **记录恢复操作** | 所有恢复操作必须记录到 `/var/backup/xujing/restore.log`，包含时间、操作人、RUN_ID、结果 |

### 1.3 恢复优先级

```
P0 - 数据库损坏/丢失     → 立即执行情景二（全量回滚）
P1 - Uploads 误删/损坏   → 执行情景一（局部恢复）
P2 - 单文件误删          → 从 Uploads 备份中单独提取
```

---

## 2. 备份架构速查

### 2.1 目录结构

```
/var/backup/xujing/
├── postgres/                          # PG 备份目录
│   ├── xujing-20260617_020000.dump.gz # 压缩备份文件（-Fc 格式）
│   ├── xujing-20260617_020000.meta    # 元数据文件
│   └── ...
├── uploads/                           # Uploads 增量备份目录
│   ├── .backup-meta-20260617-030000.json  # 备份元数据
│   ├── .backup-manifest-20260617-030000.lst # 文件清单
│   ├── characters/                    # 角色头像
│   ├── backgrounds/                   # 聊天背景
│   └── ...
├── snapshots/                         # 周日 tar 快照
│   ├── uploads-snapshot-20260615.tar.gz
│   └── ...
└── runs/                              # 统一调度运行记录
    ├── run-20260617-020000-a1b2.state    # 运行状态
    ├── run-20260617-020000-a1b2.summary  # 运行摘要
    └── ...
```

### 2.2 备份调度

| 时间 | 任务 | 脚本 | 说明 |
|------|------|------|------|
| 每日 02:00 | 统一调度 | `backup-master.sh` | 串联 PG + Uploads 备份，生成 RUN_ID |
| 每日 02:00 | PG 备份 | `backup-postgres.sh` | `pg_dump -Fc \| gzip`，保留 7天/4周/6月 |
| 每日 03:00 | Uploads 增量 | `backup-uploads.sh` | `rsync -av`（**严禁 --delete**） |
| 每周日 03:30 | Uploads 快照 | `backup-uploads.sh --snapshot` | `tar -czf` 全量快照 |

### 2.3 保留策略

| 备份类型 | 保留策略 | 预估空间 |
|----------|----------|----------|
| PG 日备份 | 7 天 | ~50MB/次 |
| PG 周备份 | 4 周 | ~50MB/次 |
| PG 月备份 | 6 月 | ~50MB/次 |
| Uploads 增量 | 持续累积 | 视文件量增长 |
| Uploads 快照 | 最近 4 个周日 | 视总文件量 |

---

## 3. RUN_ID 定位机制

### 3.1 RUN_ID 格式

```
run-YYYYMMDD-HHMMSS-XXXX

示例: run-20260617-020000-a1b2
      │        │       └── 4位随机后缀
      │        └── 备份启动时间
      └── 备份日期
```

### 3.2 查找可用备份

#### 方法一：查看运行摘要（推荐）

```bash
# 列出所有成功的备份运行
ls -lt /var/backup/xujing/runs/*.summary | head -20

# 查看特定运行的摘要
cat /var/backup/xujing/runs/run-20260617-020000-a1b2.summary
```

摘要文件内容示例：
```json
{
  "run_id": "run-20260617-020000-a1b2",
  "start_time": "2026-06-17T02:00:00+08:00",
  "end_time": "2026-06-17T02:03:45+08:00",
  "pg_backup_status": "success",
  "uploads_backup_status": "success",
  "overall_status": "success",
  "log_file": "/var/backup/xujing/runs/run-20260617-020000-a1b2.log"
}
```

#### 方法二：查看运行状态

```bash
# 查看运行状态（success/failed/partial）
cat /var/backup/xujing/runs/run-20260617-020000-a1b2.state
```

#### 方法三：直接查看备份文件

```bash
# 查看 PG 备份文件
ls -lt /var/backup/xujing/postgres/*.dump.gz | head -10

# 查看 PG 备份元数据
cat /var/backup/xujing/postgres/xujing-20260617_020000.meta

# 查看 Uploads 备份元数据
ls -lt /var/backup/xujing/uploads/.backup-meta-*.json | head -10
cat /var/backup/xujing/uploads/.backup-meta-20260617-030000.json

# 查看 Uploads 文件清单
head -50 /var/backup/xujing/uploads/.backup-manifest-20260617-030000.lst
```

### 3.3 确认备份完整性

```bash
# 验证 PG 备份文件可读
gunzip -t /var/backup/xujing/postgres/xujing-20260617_020000.dump.gz && echo "PG备份文件完整"

# 验证 Uploads 备份元数据
jq . /var/backup/xujing/uploads/.backup-meta-20260617-030000.json

# 统计备份文件数量
jq '.backup_file_count' /var/backup/xujing/uploads/.backup-meta-20260617-030000.json
```

---

## 4. 情景一：Uploads 误删局部恢复

### 4.1 场景描述

**触发条件**：类似 history #1087 事故，`rsync --delete` 或其他操作导致 `/var/data/xujing/uploads/` 中的文件被误删。

**恢复目标**：从备份中恢复被误删的文件，**不影响现有正常文件**。

**预估耗时**：10-30 分钟（视文件量）

### 4.2 恢复步骤

#### Step 1：评估损失

```bash
# 确认当前 uploads 目录状态
ls -la /var/data/xujing/uploads/

# 统计当前文件数量
find /var/data/xujing/uploads/ -type f | wc -l

# 检查数据库中引用的文件
psql -U xujing -d xujing -c "
  SELECT 'avatar_url' AS field, COUNT(*) AS total,
         COUNT(CASE WHEN avatar_url IS NOT NULL AND avatar_url != '' THEN 1 END) AS filled
  FROM characters
  UNION ALL
  SELECT 'background_url', COUNT(*),
         COUNT(CASE WHEN background_url IS NOT NULL AND background_url != '' THEN 1 END)
  FROM user_character_settings;
"
```

#### Step 2：保护现场

```bash
# 对当前（已损坏的）uploads 目录做快照，防止恢复操作造成二次破坏
timestamp=$(date +%Y%m%d-%H%M%S)
tar -czf /var/backup/xujing/snapshots/uploads-pre-restore-${timestamp}.tar.gz \
  -C /var/data/xujing uploads/ 2>/dev/null || true

echo "现场快照已保存: /var/backup/xujing/snapshots/uploads-pre-restore-${timestamp}.tar.gz"
```

#### Step 3：定位恢复点

```bash
# 查找最近的成功备份
ls -lt /var/backup/xujing/runs/*.summary | head -5

# 选择误删操作之前的备份，查看摘要
cat /var/backup/xujing/runs/run-XXXXXXXX-XXXXXX-XXXX.summary

# 确认 uploads_backup_status 为 success
# 记录 RUN_ID，例如: run-20260617-030000-c3d4
```

#### Step 4：从增量备份恢复

```bash
# ⚠️ 核心命令：rsync -av 只增不删，严禁 --delete
# 从备份目录同步到生产目录，仅补充缺失文件

rsync -av /var/backup/xujing/uploads/ /var/data/xujing/uploads/ \
  --exclude='.backup-meta-*' \
  --exclude='.backup-manifest-*'

# 查看恢复结果
echo "恢复完成，当前文件数量:"
find /var/data/xujing/uploads/ -type f | wc -l
```

> **为什么不用 `--delete`？**  
> 增量备份目录是所有历史文件的累积。如果使用 `--delete`，会删除备份中不存在但生产中新增的文件，造成新的数据丢失。这正是 history #1087 事故的根因。

#### Step 5：从周日快照恢复（增量备份不足时）

如果增量备份中也没有目标文件（例如文件在备份建立前就已丢失），可从周日 tar 快照恢复：

```bash
# 查看可用快照
ls -lt /var/backup/xujing/snapshots/uploads-snapshot-*.tar.gz | head -5

# 选择最近的快照，先查看内容
tar -tzf /var/backup/xujing/snapshots/uploads-snapshot-20260615.tar.gz | head -20

# 恢复到临时目录
mkdir -p /tmp/uploads-snapshot-restore
tar -xzf /var/backup/xujing/snapshots/uploads-snapshot-20260615.tar.gz \
  -C /tmp/uploads-snapshot-restore/

# 从临时目录 rsync 到生产目录（同样严禁 --delete）
rsync -av /tmp/uploads-snapshot-restore/uploads/ /var/data/xujing/uploads/

# 清理临时目录
rm -rf /tmp/uploads-snapshot-restore
```

#### Step 6：验证恢复结果

```bash
# 1. 检查文件数量
find /var/data/xujing/uploads/ -type f | wc -l

# 2. 检查关键目录
ls -la /var/data/xujing/uploads/characters/
ls -la /var/data/xujing/uploads/backgrounds/

# 3. 随机抽检文件可读性
find /var/data/xujing/uploads/ -type f -name '*.png' | head -3 | while read f; do
  file "$f" && echo "✅ $f 可读"
done

# 4. 检查文件权限
ls -la /var/data/xujing/uploads/ | head -5

# 5. Web 访问测试
curl -sI https://xujing.modelbridge.top/uploads/characters/test.png | head -3
```

#### Step 7：记录恢复操作

```bash
cat >> /var/backup/xujing/restore.log << EOF
[$(date -Iseconds)] RESTORE uploads
  operator: $(whoami)
  run_id: run-XXXXXXXX-XXXXXX-XXXX
  method: incremental_rsync
  result: success
  file_count: $(find /var/data/xujing/uploads/ -type f | wc -l)
EOF
```

### 4.3 单文件恢复

如果只需恢复个别文件：

```bash
# 从增量备份中复制单个文件
cp /var/backup/xujing/uploads/characters/xxx.png /var/data/xujing/uploads/characters/xxx.png

# 或从快照中提取单个文件
tar -xzf /var/backup/xujing/snapshots/uploads-snapshot-20260615.tar.gz \
  -C /var/data/xujing/ \
  uploads/characters/xxx.png
```

---

## 5. 情景二：DB + 文件全量回滚

### 5.1 场景描述

**触发条件**：
- 数据库损坏/误操作导致数据丢失
- 需要将整个系统回滚到某个已知良好的时间点
- 数据库 + 文件同时需要恢复

**恢复目标**：将 PostgreSQL 数据库和 Uploads 文件同时回滚到指定 RUN_ID 对应的备份点。

**预估耗时**：30-60 分钟  
**停服时间**：~5 分钟（数据库恢复期间）

### 5.2 恢复步骤

#### Step 1：确认恢复点

```bash
# 查找目标备份运行
ls -lt /var/backup/xujing/runs/*.summary | head -10

# 查看摘要，确认 PG 和 Uploads 备份均成功
cat /var/backup/xujing/runs/run-XXXXXXXX-XXXXXX-XXXX.summary

# 确认以下字段均为 success:
#   pg_backup_status: success
#   uploads_backup_status: success  
#   overall_status: success

# 记录 RUN_ID
TARGET_RUN_ID="run-XXXXXXXX-XXXXXX-XXXX"
echo "目标恢复点: $TARGET_RUN_ID"
```

#### Step 2：定位备份文件

```bash
# 从 PG 元数据中找到对应的备份文件
cat /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.meta
# 确认 meta 文件中的 run_id 与 TARGET_RUN_ID 一致

# 从 Uploads 元数据中确认备份可用
cat /var/backup/xujing/uploads/.backup-meta-XXXXXXXX-XXXXXX.json
# 确认 meta 文件中的 run_id 与 TARGET_RUN_ID 一致
```

#### Step 3：通知与停服

```bash
# 1. 通知相关人员（如有）
echo "⚠️ 叙境即将进行数据库恢复，服务将短暂中断"

# 2. 停止应用服务
pm2 stop xujing-app

# 3. 确认服务已停止
pm2 status | grep xujing-app
curl -s http://127.0.0.1:3003/ > /dev/null 2>&1 && echo "⚠️ 服务仍在运行" || echo "✅ 服务已停止"
```

#### Step 4：保护现场

```bash
# 1. 备份当前数据库（即使已损坏，也要保留现场）
timestamp=$(date +%Y%m%d-%H%M%S)
su - postgres -c "pg_dump -Fc xujing" | gzip > \
  /var/backup/xujing/postgres/xujing-pre-restore-${timestamp}.dump.gz
echo "当前数据库已备份: xujing-pre-restore-${timestamp}.dump.gz"

# 2. 备份当前 uploads 目录
tar -czf /var/backup/xujing/snapshots/uploads-pre-restore-${timestamp}.tar.gz \
  -C /var/data/xujing uploads/ 2>/dev/null || true
echo "当前 uploads 已备份: uploads-pre-restore-${timestamp}.tar.gz"
```

#### Step 5：恢复 PostgreSQL

```bash
# 1. 解压备份文件
gunzip -k /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump.gz
# -k 保留压缩文件

# 2. 重建数据库
su - postgres -c "psql -c 'DROP DATABASE IF EXISTS xujing;'"
su - postgres -c "psql -c 'CREATE DATABASE xujing;'"

# 3. 恢复数据
su - postgres -c "pg_restore -d xujing /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump"

# 4. 验证恢复
su - postgres -c "psql -d xujing -c '\dt'" | head -20
su - postgres -c "psql -d xujing -c 'SELECT count(*) FROM characters;'"

# 5. 清理解压文件
rm -f /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump
```

> **注意**：如果 `pg_restore` 报权限错误，可能需要先恢复 schema：
> ```bash
> su - postgres -c "pg_restore --schema-only -d xujing /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump"
> su - postgres -c "pg_restore --data-only -d xujing /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump"
> ```

#### Step 6：恢复 Uploads

```bash
# ⚠️ 核心命令：rsync -av 只增不删，严禁 --delete
rsync -av /var/backup/xujing/uploads/ /var/data/xujing/uploads/ \
  --exclude='.backup-meta-*' \
  --exclude='.backup-manifest-*'

# 如果需要完全回滚到快照状态（清除快照后新增的文件），使用以下命令：
# ⚠️ 此操作会删除快照中不存在的文件，仅在确认需要完全回滚时使用
# 
# # 先清空目标目录
# rm -rf /var/data/xujing/uploads/*
# # 从快照恢复
# tar -xzf /var/backup/xujing/snapshots/uploads-snapshot-XXXXXXXX.tar.gz \
#   -C /var/data/xujing/

# 查看恢复结果
find /var/data/xujing/uploads/ -type f | wc -l
```

#### Step 7：修复权限

```bash
# 确保 uploads 目录权限正确
chown -R www-data:www-data /var/data/xujing/uploads/
chmod -R 755 /var/data/xujing/uploads/

# 确保数据库权限正确
su - postgres -c "psql -d xujing -c 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xujing;'"
su - postgres -c "psql -d xujing -c 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xujing;'"
```

#### Step 8：启动服务

```bash
# 1. 启动应用
pm2 start xujing-app

# 2. 等待服务就绪
sleep 5
pm2 status | grep xujing-app

# 3. 健康检查
curl -sf http://127.0.0.1:3003/ > /dev/null && echo "✅ 服务已启动" || echo "❌ 服务启动失败"
```

#### Step 9：端到端验证

```bash
# 1. 数据库连接测试
psql -U xujing -d xujing -c "SELECT count(*) FROM characters;" 2>/dev/null || \
  su - postgres -c "psql -d xujing -c 'SELECT count(*) FROM characters;'"

# 2. API 健康检查
curl -sf http://127.0.0.1:3003/api/health > /dev/null && echo "✅ API 正常" || echo "❌ API 异常"

# 3. Uploads 访问测试
ls /var/data/xujing/uploads/characters/ | head -3
curl -sI https://xujing.modelbridge.top/uploads/ | head -3

# 4. 前端页面测试
curl -sf https://xujing.modelbridge.top/ > /dev/null && echo "✅ 前端正常" || echo "❌ 前端异常"
```

#### Step 10：记录恢复操作

```bash
cat >> /var/backup/xujing/restore.log << EOF
[$(date -Iseconds)] RESTORE full_rollback
  operator: $(whoami)
  run_id: ${TARGET_RUN_ID}
  pg_backup: xujing-XXXXXXXX_XXXXXX.dump.gz
  uploads_method: incremental_rsync
  downtime: X minutes
  result: success
  db_tables: $(su - postgres -c "psql -d xujing -t -c 'SELECT count(*) FROM pg_tables WHERE schemaname=\"public\";'" 2>/dev/null | tr -d ' ')
  uploads_files: $(find /var/data/xujing/uploads/ -type f | wc -l)
EOF
```

---

## 6. 恢复验证清单

### 6.1 Uploads 恢复验证

| # | 检查项 | 命令 | 期望结果 |
|---|--------|------|----------|
| 1 | 目录存在 | `ls -la /var/data/xujing/uploads/` | 目录存在且有内容 |
| 2 | 文件数量 | `find /var/data/xujing/uploads/ -type f \| wc -l` | > 0 |
| 3 | 子目录完整 | `ls /var/data/xujing/uploads/` | 包含 characters/ 等 |
| 4 | 文件可读 | `file /var/data/xujing/uploads/characters/*.png \| head -3` | PNG image data |
| 5 | 权限正确 | `ls -la /var/data/xujing/uploads/` | www-data:www-data 755 |
| 6 | Nginx 代理 | `curl -sI https://xujing.modelbridge.top/uploads/` | 200 或 301 |

### 6.2 PostgreSQL 恢复验证

| # | 检查项 | 命令 | 期望结果 |
|---|--------|------|----------|
| 1 | 数据库存在 | `su - postgres -c "psql -l" \| grep xujing` | xujing 数据库存在 |
| 2 | 表数量 | `su - postgres -c "psql -d xujing -c '\\dt'" \| wc -l` | 与备份前一致 |
| 3 | 核心表数据 | `su - postgres -c "psql -d xujing -c 'SELECT count(*) FROM characters;'"` | > 0 |
| 4 | 用户数据 | `su - postgres -c "psql -d xujing -c 'SELECT count(*) FROM users;'"` | 与备份前一致 |
| 5 | 连接测试 | `psql -U xujing -d xujing -c 'SELECT 1;'` | 返回 1 |

### 6.3 服务恢复验证

| # | 检查项 | 命令 | 期望结果 |
|---|--------|------|----------|
| 1 | PM2 进程 | `pm2 status \| grep xujing-app` | online |
| 2 | 端口监听 | `ss -tlnp \| grep 3003` | LISTEN |
| 3 | API 响应 | `curl -sf http://127.0.0.1:3003/` | HTTP 200 |
| 4 | 前端页面 | `curl -sf https://xujing.modelbridge.top/` | HTTP 200 |
| 5 | 日志无错误 | `pm2 logs xujing-app --lines 20` | 无 FATAL/ERROR |

---

## 7. 常见问题与注意事项

### 7.1 常见问题

#### Q1: 恢复后数据库连接失败

```bash
# 检查 PostgreSQL 服务状态
systemctl status postgresql

# 检查数据库是否存在
su - postgres -c "psql -l" | grep xujing

# 检查用户权限
su - postgres -c "psql -c '\du'" | grep xujing

# 重新授权
su - postgres -c "psql -d xujing -c 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xujing;'"
su - postgres -c "psql -d xujing -c 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xujing;'"
```

#### Q2: rsync 恢复后文件权限不对

```bash
chown -R www-data:www-data /var/data/xujing/uploads/
chmod -R 755 /var/data/xujing/uploads/
```

#### Q3: pg_restore 报错 "already exists"

```bash
# 先清空目标数据库再恢复
su - postgres -c "psql -c 'DROP DATABASE IF EXISTS xujing;'"
su - postgres -c "psql -c 'CREATE DATABASE xujing;'"
su - postgres -c "pg_restore -d xujing /path/to/xujing.dump"
```

#### Q4: 找不到对应的 RUN_ID

```bash
# 查看所有运行记录
ls -lt /var/backup/xujing/runs/*.summary

# 如果 runs 目录为空，直接查看备份文件
ls -lt /var/backup/xujing/postgres/*.meta
ls -lt /var/backup/xujing/uploads/.backup-meta-*.json

# 使用 meta 文件中的时间戳定位备份
```

#### Q5: 备份文件损坏

```bash
# 测试 PG 备份完整性
gunzip -t /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump.gz

# 测试 tar 快照完整性
gunzip -t /var/backup/xujing/snapshots/uploads-snapshot-XXXXXXXX.tar.gz

# 如果损坏，尝试更早的备份
ls -lt /var/backup/xujing/postgres/*.dump.gz
```

### 7.2 注意事项

1. **严禁 `rsync --delete`**：恢复 Uploads 时绝对不能使用 `--delete` 参数，这是事故根因
2. **先备份再恢复**：恢复前必须对当前状态做快照，即使数据已损坏
3. **停服恢复**：数据库恢复必须停服，避免恢复期间产生新数据导致不一致
4. **权限检查**：恢复后必须检查文件权限和数据库权限
5. **日志记录**：所有恢复操作必须记录到 `/var/backup/xujing/restore.log`
6. **恢复演练**：建议每季度在测试环境执行一次恢复演练，验证备份可用性

---

## 8. 附录：命令速查卡

### 8.1 快速定位备份

```bash
# 最近成功的备份
ls -lt /var/backup/xujing/runs/*.summary | head -5

# 特定日期的备份
ls /var/backup/xujing/runs/run-20260617-*.summary

# PG 备份文件
ls -lt /var/backup/xujing/postgres/*.dump.gz | head -5

# Uploads 备份元数据
ls -lt /var/backup/xujing/uploads/.backup-meta-*.json | head -5
```

### 8.2 快速恢复 Uploads

```bash
# ⚠️ 严禁 --delete
rsync -av /var/backup/xujing/uploads/ /var/data/xujing/uploads/ \
  --exclude='.backup-meta-*' \
  --exclude='.backup-manifest-*'
```

### 8.3 快速恢复 PostgreSQL

```bash
# 停服 → 备份当前 → 重建 → 恢复 → 启动
pm2 stop xujing-app &&
gunzip -k /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump.gz &&
su - postgres -c "psql -c 'DROP DATABASE IF EXISTS xujing;'" &&
su - postgres -c "psql -c 'CREATE DATABASE xujing;'" &&
su - postgres -c "pg_restore -d xujing /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump" &&
rm -f /var/backup/xujing/postgres/xujing-XXXXXXXX_XXXXXX.dump &&
pm2 start xujing-app
```

### 8.4 恢复日志格式

```
[2026-06-17T10:30:00+08:00] RESTORE uploads
  operator: root
  run_id: run-20260617-030000-c3d4
  method: incremental_rsync
  result: success
  file_count: 42
```

---

> **文档维护**：每次恢复操作后，请根据实际经验更新本手册。  
> **下次演练**：建议在 P0 安全边界实施完成后 1 周内执行首次恢复演练。