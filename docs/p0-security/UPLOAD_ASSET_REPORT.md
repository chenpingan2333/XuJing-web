# Uploads 资产审计报告

> 生成时间：2026-06-17 | 审计范围：叙境-web 全部 uploads 相关资产

---

## 1. 事故概述

### 1.1 事件时间线

| 时间 | 事件 |
|------|------|
| 2026-06-17 05:08:17 | `rsync -avz --delete standalone/public/ /var/www/xujing/public/` 执行（history #1087） |
| 2026-06-17 05:08:17+ | uploads/ 目录下所有用户上传文件被 `--delete` 清除 |
| 2026-06-17 ~05:30 | 发现文件丢失，开始排查 |
| 2026-06-17 ~06:00 | 根因确认，数据库无效URL清理完成 |

### 1.2 根因分析

**直接原因**：手动执行 `rsync -avz --delete standalone/public/ /var/www/xujing/public/`

- `--delete` 参数会删除目标目录中源目录不存在的文件
- `standalone/public/` 中不包含 `uploads/` 子目录（uploads 是运行时动态生成的）
- 因此 `/var/www/xujing/public/uploads/` 下的所有文件被删除

**深层原因**：
1. uploads 目录与应用代码的 public 目录耦合，部署时易被误操作
2. 缺乏 uploads 目录的独立备份机制
3. deploy.sh 未包含 public/ 的 rsync（仅同步 .next/static/），但操作者可能误以为需要同步
4. 无文件删除保护机制（如 immutable 属性、独立挂载点）

---

## 2. 资产清单

### 2.1 存储层资产

| 资产 | 路径 | 当前状态 | 说明 |
|------|------|----------|------|
| uploads 目录 | `/var/www/xujing/public/uploads/` | ❌ 空 | 权限 755 root:root |
| 官方角色图片 | `/var/www/xujing/public/images/official/` | ✅ 正常 | 沈嘉明.png、雫崎富香.png |
| 根目录静态资源 | `/var/www/xujing/public/` | ✅ 正常 | logo.png、favicon.svg |
| Next.js 静态资源 | `/usr/share/nginx/xujing-static/` | ✅ 正常 | _next/static/ |

### 2.2 数据库层资产（uploads 相关字段）

#### characters 表 — avatar_url 字段

| 角色名 | 原 avatar_url | 当前状态 |
|--------|---------------|----------|
| 之之 | `https://43.138.193.173/uploads/e81dc794...jpg` | 已置空 |
| 江予白 | `https://43.138.193.173/uploads/42d413e0...jpg` | 已置空 |
| 王橹杰 | `https://43.138.193.173/uploads/5e8d122e...jpeg` | 已置空 |
| 薛桐 | `https://43.138.193.173/uploads/88c98bcc...jpeg` | 已置空 |
| 许可晴 | `https://43.138.193.173/uploads/65b68c4f...jpg` | 已置空 |
| 闻敬业 | `https://43.138.193.173/uploads/f2259853...jpeg` | 已置空 |
| 闻衍和闻烬 | `https://43.138.193.173/uploads/5d41ee99...png` | 已置空 |
| 顾夜辞 | `https://43.138.193.173/uploads/7a64766d...jpg` | 已置空 |
| 顾沉舟 | `https://43.138.193.173/uploads/c4c607e4...jpeg` | 已置空 |

#### user_character_settings 表 — background_url 字段

| 角色 | character_id | 原 background_url | 当前状态 |
|------|-------------|-------------------|----------|
| 许可晴 | `019eae1d-...` | `/uploads/49891ffa...jpg` | 已置空 |
| 顾沉舟 | `019ec49a-...` | `/uploads/cca3c387...jpeg` | 已置空 |

### 2.3 URL 存储格式差异

| 表 | 格式 | 示例 |
|----|------|------|
| characters.avatar_url | 完整 URL | `https://43.138.193.173/uploads/xxx.jpg` |
| user_character_settings.background_url | 相对路径 | `/uploads/xxx.jpg` |

> ⚠️ **风险**：两种格式不一致，迁移时需统一处理

---

## 3. 上传 API 安全审计

### 3.1 当前配置（`src/app/api/upload/route.ts`）

| 项目 | 值 | 评估 |
|------|-----|------|
| 存储目录 | `/var/www/xujing/public/uploads` | ⚠️ 与应用 public 耦合 |
| 文件命名 | `crypto.randomUUID() + ext` | ✅ UUID 防碰撞 |
| 文件大小限制 | 10 MB | ✅ 合理 |
| 文件类型校验 | jpg/png/webp (MIME) | ✅ 基础防护 |
| 认证 | requireAuth | ✅ 必须登录 |
| 频率限制 | free:10/min, vip:30/min | ✅ 防滥用 |
| 路径遍历防护 | ❌ 无（依赖 UUID 命名） | ⚠️ 隐式防护 |
| 文件删除 API | ❌ 无 | ⚠️ 孤儿文件无法清理 |
| 病毒扫描 | ❌ 无 | ⚠️ 低优先级 |
| 文件内容校验 | ❌ 仅 MIME 类型 | ⚠️ 可伪造 |

### 3.2 Nginx 配置（`/etc/nginx/conf.d/xujing.conf`）

```nginx
location /uploads/ {
    alias /var/www/xujing/public/uploads/;
    expires 7d;
    add_header Cache-Control "public, max-age=604800";
}
```

- ✅ 通过 alias 直接提供文件，绕过 Next.js
- ⚠️ 无防盗链配置
- ⚠️ 无访问日志单独记录

---

## 4. 数据丢失影响评估

### 4.1 不可恢复的文件

| 类别 | 数量 | 可恢复性 |
|------|------|----------|
| 自建角色头像 | 9 个 | ❌ 不可恢复（无备份） |
| 聊天背景图 | 2 个 | ❌ 不可恢复（无备份） |

### 4.2 已恢复/正常的文件

| 类别 | 数量 | 说明 |
|------|------|------|
| 官方角色图片 | 2 个 | images/official/ 未受影响 |
| favicon.svg | 1 个 | 从 public/ 源目录恢复 |
| logo.png | 1 个 | 从 public/ 源目录恢复 |

### 4.3 业务影响

- 9 个自建角色头像显示为空/默认头像，需用户重新上传
- 2 个聊天背景图失效，需用户重新设置
- 无数据完整性问题（数据库 URL 已清理）

---

## 5. 风险矩阵

| 风险 | 可能性 | 影响 | 优先级 | 缓解措施 |
|------|--------|------|--------|----------|
| rsync --delete 再次误删 uploads | 中 | 严重 | P0 | Uploads 独立存储 + deploy.sh 防护 |
| uploads 目录无备份 | 确定 | 严重 | P0 | 自动备份脚本 |
| 孤儿文件累积 | 高 | 低 | P2 | 文件删除 API |
| 路径遍历攻击 | 低 | 严重 | P1 | 显式路径校验 |
| MIME 类型伪造 | 低 | 中 | P2 | 文件头魔数校验 |
| 无审计日志 | 确定 | 中 | P0 | Audit Log 基础设施 |

---

## 6. 修复状态

| 项目 | 状态 | 说明 |
|------|------|------|
| 数据库无效 URL 清理 | ✅ 完成 | 9+2 条记录已置空 |
| 静态资源恢复 | ✅ 完成 | favicon.svg、logo.png、images/ 已恢复 |
| uploads 目录重建 | ✅ 完成 | mkdir -p，权限 755 |
| 自建角色头像重传 | ❌ 待办 | 需用户重新上传 9 个头像 |
| 聊天背景图重设 | ❌ 待办 | 需用户重新设置 2 个背景 |
| Uploads 独立存储 | ❌ 待办 | 见 DOCKER_STORAGE_PLAN.md |
| 自动备份 | ❌ 待办 | 见 BACKUP_STRATEGY.md |
| Audit Log | ❌ 待办 | 见 AUDIT_LOG_SCHEMA.md |

---

## 附录 A：上传 API 完整代码

见 `src/app/api/upload/route.ts`

## 附录 B：Nginx uploads 配置

见 `/etc/nginx/conf.d/xujing.conf` 中 `location /uploads/` 段

## 附录 C：deploy.sh 当前版本

见 `/root/XuJing-web/deploy.sh`

> ⚠️ deploy.sh 仅 rsync --delete .next/static/，不涉及 public/ 同步；会 mkdir -p /var/www/xujing/public/uploads
