# 叙境-web Uploads 备份方案

> **文档版本**：v1.0.0  
> **创建日期**：2026-06-17  
> **安全等级**：P0 — 数据保护  
> **状态**：方案设计（未执行）

---

## 1. 背景与动机

### 1.1 事故回顾

2026-06-17 05:08:17，因手动执行 `rsync -avz --delete standalone/public/ /var/www/xujing/public/`（history #1087），导致 `/var/www/xujing/public/uploads/` 目录下全部用户上传文件被删除且**不可恢复**。

**根因**：
- `--delete` 参数使目标端与源端完全一致，源端不存在的文件在目标端被删除
- uploads 目录不在 `standalone/public/` 中（运行时由用户上传产生），但存在于生产服务器
- 无任何备份机制，文件一旦删除无法恢复

### 1.2 影响范围

| 类别 | 数量 | 详情 |
|------|------|------|
| 角色头像 | 9 个 | 之之、江予白、王橹杰、薛桐、许可晴、闻敬业、闻衍和闻烬、顾夜辞、顾沉舟 |
| 聊天背景 | 2 个 | 许可晴、顾沉舟 |
| 数据库无效URL | 11 条 | characters表9条avatar_url + user_character_settings表2条background_url（已置空） |

### 1.3 设计目标

1. **零丢失**：任何上传文件在备份中都有副本
2. **防误删**：备份操作绝不使用 `--delete`，源端文件丢失不影响备份
3. **可恢复**：提供明确的恢复流程，RTO < 30分钟
4. **可验证**：每次备份生成完整性报告
5. **自动化**：cron 定时执行，无需人工干预

---

## 2. 架构设计

### 2.1 存储架构

```
┌─────────────────────────┐
│  生产服务器              │
│  /var/www/xujing/       │
│  └── public/uploads/    │ ← 源：用户上传文件（当前为空，待恢复）
│      ├── avatars/       │    未来：UUID命名的图片文件
│      └── backgrounds/   │    未来：UUID命名的背景图
└────────────┬────────────┘
             │
             │ rsync -av（严禁 --delete）
             │ 每日 03:00
             ▼
┌─────────────────────────┐
│  备份存储                │
│  /var/backup/xujing/    │
│  └── uploads/           │ ← 目标：增量备份副本
│      ├── avatars/       │    保留所有历史文件
│      ├── backgrounds/   │    即使源端已删除
│      ├── .backup-meta-* │    元数据文件
│      └── .backup-manifest-* │ 清单文件
└─────────────────────────┘
```

### 2.2 关键设计原则

| 原则 | 实现 | 说明 |
|------|------|------|
| **禁止 --delete** | rsync -av | 仅增量添加/更新，永不删除备份中的文件 |
| **增量备份** | rsync 归档模式 | 仅传输变化文件，节省带宽和时间 |
| **完整性校验** | 文件计数 + 清单 | 每次备份后比对源端/备份端文件数 |
| **元数据记录** | JSON 格式 | 记录备份时间、文件数、大小等 |
| **磁盘保护** | 阈值检查 | 磁盘使用率 ≥90% 时拒绝执行 |

---

## 3. 备份策略

### 3.1 执行计划

| 项目 | 配置 |
|------|------|
| 执行频率 | 每日 1 次 |
| 执行时间 | 03:00（PG备份后1小时，错峰执行） |
| 备份方式 | rsync -av 增量同步 |
| 源目录 | `/var/www/xujing/public/uploads/` |
| 备份目录 | `/var/backup/xujing/uploads/` |
| 日志文件 | `/var/log/xujing/backup-uploads.log` |

### 3.2 Crontab 配置

```cron
# Uploads 每日增量备份 — 凌晨 03:00
0 3 * * * /usr/local/bin/backup-uploads.sh --source-dir=/var/www/xujing/public/uploads/ --backup-dir=/var/backup/xujing/uploads >> /var/log/xujing/backup-uploads.log 2>&1
```

### 3.3 保留策略

Uploads 备份采用**只增不减**策略：

| 层级 | 保留规则 | 说明 |
|------|----------|------|
| 备份文件 | **永久保留** | rsync -av 不删除，即使源端文件已丢失 |
| 清单文件 | 7 天 | `.backup-manifest-*.lst` 每日生成，保留7天 |
| 元数据文件 | 7 天 | `.backup-meta-*.json` 每日生成，保留7天 |

> ⚠️ 与 PG 备份不同，Uploads 备份文件不按时间删除。这是因为：
> 1. 用户上传文件可能随时被引用（数据库URL指向）
> 2. 即使源端文件被误删，备份中仍需保留
> 3. 磁盘空间通过监控告警人工管理

### 3.4 磁盘空间规划

| 场景 | 预估大小 | 说明 |
|------|----------|------|
| 当前（空） | 0 MB | uploads 目录为空 |
| 3个月预估 | 500 MB - 2 GB | 基于用户增长和上传频率 |
| 1年预估 | 2 - 10 GB | 含历史版本和已删除文件 |

**建议**：备份分区至少预留 20GB 空间

---

## 4. 备份脚本

### 4.1 脚本位置

```
docs/p0-security/scripts/backup-uploads.sh
```

### 4.2 核心逻辑

```bash
# 安全约束：严禁 --delete
SAFE_RSYNC_OPTS="-av"

# 增量同步（仅添加/更新，不删除）
rsync ${SAFE_RSYNC_OPTS} "${SOURCE_DIR}" "${BACKUP_DIR}/"

# 完整性校验
SOURCE_COUNT=$(find "${SOURCE_DIR}" -type f | wc -l)
BACKUP_COUNT=$(find "${BACKUP_DIR}" -type f | wc -l)

# 生成元数据
# 生成清单文件
```

### 4.3 安全检查

脚本内置多重安全检查：

1. **--delete 参数检测**：启动时检查 rsync 参数，发现 `--delete` 立即终止
2. **源目录存在性**：源目录不存在时报错退出
3. **磁盘空间检查**：使用率 ≥90% 时拒绝执行
4. **rsync 退出码**：非零退出码触发错误处理
5. **deleting 关键词检测**：rsync 输出中出现 `deleting` 时发出警告

---

## 5. 恢复流程

### 5.1 全量恢复（uploads 目录丢失）

```bash
# 1. 确认备份目录状态
ls -la /var/backup/xujing/uploads/

# 2. 确认目标目录存在
mkdir -p /var/www/xujing/public/uploads/

# 3. 从备份恢复（使用 rsync -av，不使用 --delete）
rsync -av /var/backup/xujing/uploads/ /var/www/xujing/public/uploads/

# 4. 验证文件数
find /var/www/xujing/public/uploads/ -type f | wc -l
find /var/backup/xujing/uploads/ -type f -not -name '*.meta' -not -name '*.md5' -not -name '*.lst' | wc -l

# 5. 验证 Nginx 可访问
curl -I https://xujing.modelbridge.top/uploads/<test-file>
```

### 5.2 单文件恢复

```bash
# 1. 在备份中查找目标文件
ls /var/backup/xujing/uploads/<uuid>.jpg

# 2. 复制到生产目录
cp /var/backup/xujing/uploads/<uuid>.jpg /var/www/xujing/public/uploads/

# 3. 验证
curl -I https://xujing.modelbridge.top/uploads/<uuid>.jpg
```

### 5.3 数据库 URL 恢复

```bash
# 恢复 characters 表 avatar_url
psql -U postgres -d xujing -c \
  "UPDATE characters SET avatar_url = '/uploads/<uuid>.jpg' WHERE id = '<character-id>';"

# 恢复 user_character_settings 表 background_url
psql -U postgres -d xujing -c \
  "UPDATE user_character_settings SET background_url = '/uploads/<uuid>.jpg' \
   WHERE user_id = '<user-id>' AND character_id = '<character-id>';"
```

### 5.4 RTO/RPO

| 指标 | 目标 | 说明 |
|------|------|------|
| RPO（恢复点目标） | ≤ 24 小时 | 每日备份，最多丢失1天数据 |
| RTO（恢复时间目标） | ≤ 30 分钟 | rsync 恢复 + Nginx 验证 |

---

## 6. 验证与测试

### 6.1 首次部署验证

```bash
# 1. 部署脚本
cp docs/p0-security/scripts/backup-uploads.sh /usr/local/bin/
chmod +x /usr/local/bin/backup-uploads.sh

# 2. 创建必要目录
mkdir -p /var/backup/xujing/uploads
mkdir -p /var/log/xujing

# 3. 手动执行一次
/usr/local/bin/backup-uploads.sh --source-dir=/var/www/xujing/public/uploads/ --backup-dir=/var/backup/xujing/uploads

# 4. 检查日志
cat /var/log/xujing/backup-uploads.log

# 5. 检查备份目录
ls -la /var/backup/xujing/uploads/
```

### 6.2 定期验证（建议每周）

```bash
# 1. 检查最近备份日志
tail -50 /var/log/xujing/backup-uploads.log

# 2. 比对文件数
SOURCE_COUNT=$(find /var/www/xujing/public/uploads/ -type f | wc -l)
BACKUP_COUNT=$(find /var/backup/xujing/uploads/ -type f -not -name '.*' | wc -l)
echo "源端: ${SOURCE_COUNT}, 备份端: ${BACKUP_COUNT}"

# 3. 随机抽取文件验证
RANDOM_FILE=$(find /var/backup/xujing/uploads/ -type f -not -name '.*' | shuf -n 1)
if [[ -n "${RANDOM_FILE}" ]]; then
    BASENAME=$(basename "${RANDOM_FILE}")
    diff <(md5sum "${RANDOM_FILE}" | awk '{print $1}') <(md5sum "/var/www/xujing/public/uploads/${BASENAME}" 2>/dev/null | awk '{print $1}') && echo "校验通过" || echo "文件不一致或源端缺失"
fi
```

### 6.3 恢复演练（建议每月）

```bash
# 在测试目录中演练恢复流程
mkdir -p /tmp/uploads-restore-test
rsync -av /var/backup/xujing/uploads/ /tmp/uploads-restore-test/
find /tmp/uploads-restore-test/ -type f -not -name '.*' | wc -l
rm -rf /tmp/uploads-restore-test
```

---

## 7. 监控与告警

### 7.1 监控指标

| 指标 | 检查方式 | 告警条件 |
|------|----------|----------|
| 备份执行状态 | 日志中 "备份完成" | 连续2天未出现 |
| 磁盘使用率 | df -h | ≥85% 警告，≥90% 严重 |
| 备份文件数 | 元数据 JSON | 备份端 < 源端 |
| rsync 错误 | 日志中 ERROR | 任何出现 |

### 7.2 日志轮转

```bash
# /etc/logrotate.d/xujing-backup-uploads
/var/log/xujing/backup-uploads.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

---

## 8. 与其他备份组件的关系

```
┌──────────────────────────────────────────────────────┐
│                  BACKUP_STRATEGY.md 总纲              │
├──────────────┬──────────────┬────────────────────────┤
│  PG 备份     │ Uploads 备份 │  配置备份              │
│  02:00       │ 03:00        │  周日 04:00            │
│  pg_dump     │ rsync -av    │  tar czf               │
│  7d/4w/6m    │ 只增不减     │  4w                    │
├──────────────┼──────────────┼────────────────────────┤
│  本文档      │  本文档      │  BACKUP_STRATEGY.md    │
│  详细方案    │  详细方案    │  配置备份章节           │
└──────────────┴──────────────┴────────────────────────┘
```

---

## 9. 安全约束清单

| # | 约束 | 实现 | 验证 |
|---|------|------|------|
| 1 | 严禁 --delete | rsync -av，脚本内置检测 | grep -c delete 脚本 |
| 2 | 备份文件不自动清理 | 只增不减策略 | 保留策略文档 |
| 3 | 磁盘空间保护 | ≥90% 拒绝执行 | 手动触发测试 |
| 4 | 错误不静默 | ERR trap + 日志 | 检查日志输出 |
| 5 | 完整性可验证 | 文件计数 + 清单 | 比对源端/备份端 |

---

## 10. 实施检查清单

- [ ] 部署 `backup-uploads.sh` 到 `/usr/local/bin/`
- [ ] 赋予执行权限 `chmod +x`
- [ ] 创建备份目录 `mkdir -p /var/backup/xujing/uploads`
- [ ] 创建日志目录 `mkdir -p /var/log/xujing`
- [ ] 手动执行一次验证
- [ ] 配置 crontab 定时任务
- [ ] 配置 logrotate 日志轮转
- [ ] 设置磁盘空间监控告警
- [ ] 执行首次恢复演练
- [ ] 文档归档到运维知识库
