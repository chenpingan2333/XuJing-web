# 叙境-web 备份策略总纲

> **文档版本**: v1.0  
> **创建日期**: 2026-06-17  
> **状态**: 方案设计（未执行）  
> **优先级**: P0

---

## 1. 概述

### 1.1 设计原则

| 原则 | 说明 |
|------|------|
| **3-2-1 备份法则** | 3 份数据副本、2 种存储介质、1 份离线/异地 |
| **零删除同步** | 备份操作严禁使用 `--delete` 参数，防止备份覆盖导致数据丢失 |
| **自动化优先** | 所有备份通过 cron 自动执行，减少人为遗漏 |
| **可验证性** | 每次备份后自动校验完整性，定期进行恢复演练 |
| **最小权限** | 备份脚本使用专用系统用户，仅授予必要权限 |

### 1.2 备份范围

| 数据类型 | 存储位置 | 备份方式 | RPO | RTO |
|----------|----------|----------|-----|-----|
| PostgreSQL 数据库 | `127.0.0.1:5432/xujing` | `pg_dump` 全量备份 | 24h | < 30min |
| Uploads 文件 | `/var/data/xujing/uploads/` | `rsync -a` 增量备份 | 24h | < 60min |
| 应用配置 | `/etc/nginx/conf.d/`、PM2 配置 | `tar` 打包 | 7d | < 15min |

### 1.3 备份存储架构

```
生产环境
├── /var/data/xujing/uploads/          ← 源数据
├── 127.0.0.1:5432/xujing              ← 源数据库
│
备份存储（本地）
├── /var/backup/xujing/
│   ├── postgres/                      ← 数据库备份目录
│   │   ├── xujing-20260617_020000.sql.gz
│   │   ├── xujing-20260618_020000.sql.gz
│   │   └── ...
│   ├── uploads/                       ← 文件备份目录
│   │   └── （rsync 镜像，保持目录结构）
│   └── config/                        ← 配置备份目录
│       └── config-20260617.tar.gz
│
异地备份（未来）
└── COS / OSS 对象存储                 ← 异地容灾
```

---

## 2. PostgreSQL 备份策略

> 详细脚本见 `scripts/backup-postgres.sh`  
> Cron 配置见 `cron-postgres-backup.example`

### 2.1 备份方式

| 项目 | 配置 |
|------|------|
| 备份工具 | `pg_dump`（PostgreSQL 原生） |
| 备份模式 | 全量逻辑备份 |
| 输出格式 | 自定义格式（`-Fc`），支持并行恢复 |
| 压缩方式 | `gzip`（压缩率约 80-90%） |
| 文件命名 | `xujing-YYYYMMDD_HHMMSS.dump.gz` |

### 2.2 备份调度

| 备份类型 | 频率 | 时间 | 保留策略 |
|----------|------|------|----------|
| 全量备份 | 每日 | 02:00 CST | 保留 7 天 |
| 全量备份 | 每周日 | 02:00 CST | 保留 4 周 |
| 全量备份 | 每月1日 | 02:00 CST | 保留 6 月 |

### 2.3 备份流程

```
02:00 cron 触发
    ↓
pg_dump -Fc xujing | gzip > xujing-YYYYMMDD_020000.dump.gz
    ↓
校验文件完整性（gzip -t）
    ↓
记录备份元数据（大小、行数、耗时）
    ↓
清理过期备份（按保留策略）
    ↓
输出备份报告到日志
```

### 2.4 恢复流程

```bash
# 1. 停止应用
pm2 stop xujing-app

# 2. 解压备份文件
gunzip -c xujing-20260617_020000.dump.gz > xujing.restore.dump

# 3. 恢复数据库（方式一：覆盖现有库）
pg_restore --clean --if-exists -d xujing xujing.restore.dump

# 3. 恢复数据库（方式二：恢复到新库，更安全）
createdb xujing_restore
pg_restore -d xujing_restore xujing.restore.dump
# 验证后切换

# 4. 重启应用
pm2 start xujing-app
```

### 2.5 数据库连接信息

| 参数 | 值 |
|------|-----|
| Host | 127.0.0.1 |
| Port | 5432 |
| Database | xujing |
| User | postgres |
| Password | （存储在 ~/.pgpass 或环境变量） |

**安全建议**：
- 使用 `~/.pgpass` 文件存储密码，权限设为 `600`
- 禁止在脚本中硬编码密码
- 禁止在 cron 日志中输出密码

---

## 3. Uploads 备份策略

> 详细方案见 `UPLOAD_BACKUP_PLAN.md`  
> 详细脚本见 `scripts/backup-uploads.sh`

### 3.1 备份方式

| 项目 | 配置 |
|------|------|
| 备份工具 | `rsync -a`（增量同步） |
| 备份模式 | 增量镜像（仅传输变更文件） |
| ⚠️ 禁止参数 | **严禁使用 `--delete`** |
| 目标目录 | `/var/backup/xujing/uploads/` |

### 3.2 为什么禁止 `--delete`

```
rsync --delete 的行为：
  源端不存在的文件 → 在目标端删除

场景：
  1. 用户上传 avatar.jpg → 备份到 /var/backup/uploads/avatar.jpg
  2. rsync --delete standalone/public/ /var/www/xujing/public/ 误删源文件
  3. 下次 rsync --delete 备份 → 备份端的 avatar.jpg 也被删除！
  4. 数据彻底丢失，无法恢复

结论：
  备份必须保留「源端已不存在」的文件，这是备份的核心价值
```

### 3.3 备份调度

| 备份类型 | 频率 | 时间 | 说明 |
|----------|------|------|------|
| 增量同步 | 每日 | 03:00 CST | rsync -a，仅传输变更 |
| 完整快照 | 每周日 | 03:30 CST | tar 打包当前备份目录 |

### 3.4 备份流程

```
03:00 cron 触发
    ↓
rsync -a /var/data/xujing/uploads/ /var/backup/xujing/uploads/
    ↓
记录同步统计（传输文件数、总大小）
    ↓
03:30（周日）tar 打包快照
    ↓
清理过期快照（保留 4 周）
    ↓
输出备份报告到日志
```

### 3.5 恢复流程

```bash
# 场景一：单个文件恢复
cp /var/backup/xujing/uploads/avatar.jpg /var/data/xujing/uploads/avatar.jpg

# 场景二：全量恢复（从备份覆盖到生产）
rsync -a /var/backup/xujing/uploads/ /var/data/xujing/uploads/

# 场景三：从快照恢复
tar xzf uploads-snapshot-20260617.tar.gz -C /var/data/xujing/uploads/
```

---

## 4. 应用配置备份策略

### 4.1 备份范围

| 配置文件 | 路径 | 说明 |
|----------|------|------|
| Nginx 配置 | `/etc/nginx/conf.d/xujing.conf` | 反向代理 + uploads alias |
| PM2 配置 | `ecosystem.config.js`（项目根目录） | 进程管理 + 环境变量 |
| 环境变量 | `.env` 或 `.env.production` | 数据库连接、密钥等 |
| 部署脚本 | `deploy.sh` | 部署流程 |
| Docker 配置 | `docker-compose.yml`、`docker-entrypoint.sh` | 容器化配置 |

### 4.2 备份方式

```bash
# 每周打包一次配置文件
tar czf /var/backup/xujing/config/config-$(date +%Y%m%d).tar.gz \
  /etc/nginx/conf.d/xujing.conf \
  /root/XuJing-web/ecosystem.config.js \
  /root/XuJing-web/.env.production \
  /root/XuJing-web/deploy.sh \
  /root/XuJing-web/docker-compose.yml \
  /root/XuJing-web/docker-entrypoint.sh
```

### 4.3 保留策略

| 备份类型 | 保留时间 |
|----------|----------|
| 每周配置备份 | 保留 8 周 |

---

## 5. 备份存储规划

### 5.1 磁盘空间估算

| 数据类型 | 当前大小 | 日增量 | 7天备份 | 30天备份 |
|----------|----------|--------|---------|----------|
| PostgreSQL | ~50MB（估） | ~1MB | ~350MB | ~1.5GB |
| Uploads | ~100MB（估） | ~5MB | ~100MB（rsync增量） | ~100MB |
| 配置 | < 1MB | 0 | < 1MB | < 1MB |
| **合计** | ~150MB | ~6MB | ~450MB | ~1.6GB |

**建议**：备份分区至少预留 **5GB** 空间。

### 5.2 目录结构

```
/var/backup/xujing/
├── postgres/
│   ├── xujing-20260617_020000.dump.gz
│   ├── xujing-20260618_020000.dump.gz
│   └── ...
├── uploads/
│   ├── （rsync 镜像，与生产目录结构一致）
│   └── ...
├── uploads-snapshots/
│   ├── uploads-snapshot-20260615.tar.gz
│   └── ...
└── config/
    ├── config-20260617.tar.gz
    └── ...
```

### 5.3 权限设置

```bash
# 创建备份目录
mkdir -p /var/backup/xujing/{postgres,uploads,uploads-snapshots,config}

# 设置权限（备份专用用户或 root）
chown -R root:root /var/backup/xujing
chmod -R 750 /var/backup/xujing

# 数据库备份目录仅 postgres 用户可写
chown postgres:postgres /var/backup/xujing/postgres
chmod 750 /var/backup/xujing/postgres
```

---

## 6. 监控与告警

### 6.1 备份健康检查

| 检查项 | 频率 | 告警条件 |
|--------|------|----------|
| 备份文件存在性 | 每日 | 最近 26 小时内无新备份 |
| 备份文件大小 | 每日 | 备份文件 < 1KB 或 > 预期 2 倍 |
| 磁盘空间 | 每日 | 备份分区使用率 > 80% |
| 备份日志错误 | 每次执行 | 日志中出现 ERROR/FATAL |

### 6.2 告警方式（建议）

- 阶段一：日志记录 + 邮件通知（`mailx`）
- 阶段二：接入腾讯云 CLS 日志服务
- 阶段三：接入企业微信/钉钉 Webhook

---

## 7. 恢复演练计划

| 演练类型 | 频率 | 验证内容 |
|----------|------|----------|
| 数据库恢复 | 每月 | `pg_restore` 到测试库，验证数据完整性 |
| 文件恢复 | 每月 | 从备份恢复单个文件，验证可访问 |
| 全量恢复 | 每季度 | 完整恢复流程，验证 RTO |

---

## 8. 异地容灾（未来规划）

### 8.1 腾讯云 COS 备份

```bash
# 安装 COSCLI
# https://cloud.tencent.com/document/product/436/63144

# 上传数据库备份到 COS
coscli cp /var/backup/xujing/postgres/xujing-20260617.dump.gz \
  cos://xujing-backup-1250000000/postgres/

# 上传 uploads 快照到 COS
coscli cp /var/backup/xujing/uploads-snapshots/uploads-snapshot-20260617.tar.gz \
  cos://xujing-backup-1250000000/uploads/
```

### 8.2 COS 生命周期

| 规则 | 说明 |
|------|------|
| 标准存储 | 保留 30 天 |
| 低频存储 | 30-90 天 |
| 归档存储 | 90-365 天 |
| 删除 | > 365 天 |

---

## 9. 安全规范

### 9.1 备份数据安全

- 备份文件权限 `640`，仅 owner 和 group 可读
- 数据库备份包含全量数据，等同于数据库本身，需同等保护
- 禁止将备份文件通过 HTTP/FTP 等明文协议传输
- 异地传输使用 HTTPS/TLS 加密

### 9.2 备份脚本安全

- 脚本权限 `750`，仅授权用户可执行
- 密码通过 `~/.pgpass` 或环境变量获取，禁止硬编码
- 脚本变更需 Code Review
- 禁止在日志中输出敏感信息

---

## 10. 执行检查清单

### 10.1 部署前

- [ ] 创建备份目录结构 `/var/backup/xujing/`
- [ ] 配置 `~/.pgpass` 文件
- [ ] 部署 `backup-postgres.sh` 脚本
- [ ] 部署 `backup-uploads.sh` 脚本
- [ ] 配置 cron 定时任务
- [ ] 验证磁盘空间充足（> 5GB）

### 10.2 部署后验证

- [ ] 手动执行 `backup-postgres.sh`，验证备份文件生成
- [ ] 手动执行 `backup-uploads.sh`，验证同步正常
- [ ] 验证 `gzip -t` 校验通过
- [ ] 验证 cron 定时触发
- [ ] 验证过期清理逻辑

---

## 附录：相关文件索引

| 文件 | 路径 | 说明 |
|------|------|------|
| PG 备份脚本 | `scripts/backup-postgres.sh` | PostgreSQL 自动备份 |
| PG Cron 示例 | `cron-postgres-backup.example` | Cron 定时配置 |
| Uploads 备份脚本 | `scripts/backup-uploads.sh` | Uploads 增量备份 |
| Uploads 备份方案 | `UPLOAD_BACKUP_PLAN.md` | Uploads 备份详细方案 |
| 存储方案 | `DOCKER_STORAGE_PLAN.md` | Uploads 独立存储方案 |