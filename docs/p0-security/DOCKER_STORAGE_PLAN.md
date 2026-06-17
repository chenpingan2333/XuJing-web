# Uploads 独立存储方案

> **文档版本**: v1.0  
> **创建日期**: 2026-06-17  
> **状态**: 方案设计（未执行）  
> **优先级**: P0

---

## 1. 背景与动机

### 1.1 事故回顾

2026-06-17 05:08:17，手动执行 `rsync -avz --delete standalone/public/ /var/www/xujing/public/`（history #1087），
导致 `/var/www/xujing/public/uploads/` 目录下所有用户上传文件被删除且不可恢复。

### 1.2 根因分析

| 因素 | 说明 |
|------|------|
| 存储耦合 | uploads 与应用公共资源共存于 `public/` 目录，rsync `--delete` 波及 uploads |
| 部署脚本 | `deploy.sh` 仅 `--delete` 同步 `.next/static/`，但无法阻止手动误操作 |
| 无备份 | uploads 目录无任何自动/手动备份机制 |
| 无隔离 | uploads 路径与应用路径无物理隔离，一次 rsync 即可摧毁 |

### 1.3 设计目标

1. **物理隔离**：uploads 存储路径与应用代码/公共资源完全分离
2. **部署安全**：任何部署操作（含手动 rsync --delete）均不影响 uploads
3. **独立生命周期**：uploads 可独立备份、恢复、扩容
4. **零停机迁移**：方案设计支持平滑切换，无需停服

---

## 2. 架构设计

### 2.1 当前架构（Before）

```
/var/www/xujing/public/          ← rsync --delete 目标（危险！）
├── images/
│   └── official/
│       ├── 沈嘉明.png
│       └── 雫崎富香.png
n├── logo.png
├── favicon.svg
└── uploads/                     ← 用户上传文件（与公共资源耦合）
    ├── e81dc794-xxxx.jpg
    ├── 42d413e0-xxxx.jpg
    └── ...
```

**问题**：`rsync --delete standalone/public/ /var/www/xujing/public/` 会删除目标端源端不存在的文件，
uploads 目录首当其冲。

### 2.2 目标架构（After）

```
/var/data/xujing/uploads/        ← 独立存储卷（新路径）
├── e81dc794-xxxx.jpg
├── 42d413e0-xxxx.jpg
└── ...

/var/www/xujing/public/          ← 仅存公共资源（安全）
├── images/
│   └── official/
│       ├── 沈嘉明.png
│       └── 雫崎富香.png
├── logo.png
└── favicon.svg

/usr/share/nginx/xujing-static/  ← Next.js 静态资源
└── _next/static/
```

**关键变更**：
- uploads 从 `/var/www/xujing/public/uploads/` 迁移到 `/var/data/xujing/uploads/`
- Nginx 通过 `alias` 指令将 `/uploads/` 请求映射到新路径
- 应用代码无需感知路径变更

### 2.3 请求链路

```
浏览器请求 /uploads/xxx.jpg
    ↓
Nginx location /uploads/ {
    alias /var/data/xujing/uploads/;   ← 新路径
    add_header X-Content-Type-Options nosniff;
}
    ↓
返回文件 /var/data/xujing/uploads/xxx.jpg
```

---

## 3. Nginx 配置方案

> 详细配置见 `nginx-xujing-uploads.conf`

### 3.1 核心配置

```nginx
# Uploads 独立存储 - alias 方案
location /uploads/ {
    alias /var/data/xujing/uploads/;
    
    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header Cache-Control "public, max-age=86400";
    
    # 独立访问日志
    access_log /var/log/nginx/xujing-uploads.access.log;
    
    # 仅允许 GET/HEAD
    limit_except GET HEAD {
        deny all;
    }
    
    # 可选：防盗链
    # valid_referers none blocked xujing.modelbridge.top 43.138.193.173;
    # if ($invalid_referer) {
    #     return 403;
    # }
}
```

### 3.2 与现有配置的关系

| 配置项 | 现有值 | 新值 | 变更 |
|--------|--------|------|------|
| `location /uploads/` | `alias /var/www/xujing/public/uploads/` | `alias /var/data/xujing/uploads/` | 路径变更 |
| `X-Content-Type-Options` | 无 | `nosniff` | 新增 |
| 独立 access_log | 无 | `/var/log/nginx/xujing-uploads.access.log` | 新增 |
| `limit_except` | 无 | 仅 GET/HEAD | 新增 |

---

## 4. 应用层变更

### 4.1 上传 API（`src/app/api/upload/route.ts`）

**当前**：
```typescript
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
```

**目标**：
```typescript
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');
```

**说明**：
- 通过环境变量 `UPLOAD_DIR` 控制存储路径
- 默认值保持兼容（开发环境仍使用 `public/uploads`）
- 生产环境设置 `UPLOAD_DIR=/var/data/xujing/uploads`

### 4.2 环境变量配置

| 变量 | 开发环境 | 生产环境 | 说明 |
|------|----------|----------|------|
| `UPLOAD_DIR` | （不设置，使用默认值） | `/var/data/xujing/uploads` | 上传文件存储路径 |

### 4.3 PM2 配置变更

**当前**：PM2 直接启动 `node server.js`，无环境变量配置。

**目标**：通过 PM2 ecosystem 配置环境变量：

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'xujing-app',
    script: 'server.js',
    env: {
      UPLOAD_DIR: '/var/data/xujing/uploads',
      NODE_ENV: 'production'
    }
  }]
};
```

或通过 `.env` 文件（如项目已支持 dotenv）。

---

## 5. 迁移方案

### 5.1 迁移步骤（需在维护窗口执行）

```bash
#!/bin/bash
# === Uploads 独立存储迁移脚本 ===
# ⚠️ 需在维护窗口执行，预计停服 5-10 分钟

set -euo pipefail

# 1. 创建目标目录
mkdir -p /var/data/xujing/uploads
chown www-data:www-data /var/data/xujing/uploads
chmod 755 /var/data/xujing/uploads

# 2. 停止应用（防止迁移期间有新上传）
pm2 stop xujing-app

# 3. 迁移现有文件（如有）
if [ -d "/var/www/xujing/public/uploads" ] && [ "$(ls -A /var/www/xujing/public/uploads 2>/dev/null)" ]; then
    echo "迁移现有 uploads 文件..."
    cp -av /var/www/xujing/public/uploads/* /var/data/xujing/uploads/
    echo "迁移完成，验证文件数量..."
    SRC_COUNT=$(find /var/www/xujing/public/uploads -type f | wc -l)
    DST_COUNT=$(find /var/data/xujing/uploads -type f | wc -l)
    echo "源: ${SRC_COUNT} 文件, 目标: ${DST_COUNT} 文件"
    if [ "$SRC_COUNT" -ne "$DST_COUNT" ]; then
        echo "❌ 文件数量不匹配，终止迁移"
        exit 1
    fi
fi

# 4. 更新 Nginx 配置
# （替换 xujing.conf 中的 alias 路径）
cp /etc/nginx/conf.d/xujing.conf /etc/nginx/conf.d/xujing.conf.bak.$(date +%Y%m%d%H%M%S)
# 手动编辑或使用 sed 替换 alias 路径
sed -i 's|alias /var/www/xujing/public/uploads/;|alias /var/data/xujing/uploads/;|' /etc/nginx/conf.d/xujing.conf
nginx -t && nginx -s reload

# 5. 设置环境变量并启动应用
export UPLOAD_DIR=/var/data/xujing/uploads
pm2 start xujing-app --update-env
# 或: pm2 restart xujing-app --update-env UPLOAD_DIR=/var/data/xujing/uploads

# 6. 验证
sleep 3
curl -I https://xujing.modelbridge.top/uploads/test.jpg 2>/dev/null || echo "验证: uploads 路径可访问"
pm2 status xujing-app

echo "✅ 迁移完成"
```

### 5.2 回滚方案

```bash
# 回滚 Nginx 配置
sed -i 's|alias /var/data/xujing/uploads/;|alias /var/www/xujing/public/uploads/;|' /etc/nginx/conf.d/xujing.conf
nginx -t && nginx -s reload

# 回滚应用环境变量
pm2 restart xujing-app --update-env UPLOAD_DIR=/var/www/xujing/public/uploads

# 如需回滚文件
# cp -av /var/data/xujing/uploads/* /var/www/xujing/public/uploads/
```

---

## 6. deploy.sh 增强方案

### 6.1 当前 deploy.sh 分析

```bash
# 当前关键行
rsync -avz --delete .next/static/ /usr/share/nginx/xujing-static/_next/static/
mkdir -p /var/www/xujing/public/uploads
```

**安全点**：`--delete` 仅作用于 `.next/static/`，不影响 `public/uploads/`。

### 6.2 增强方案

```bash
# 增强后的 public 同步（排除 uploads）
rsync -avz --exclude='uploads' public/ /var/www/xujing/public/

# 确保 uploads 目录存在（独立存储路径）
mkdir -p /var/data/xujing/uploads
chown www-data:www-data /var/data/xujing/uploads
```

**关键变更**：
- `public/` 同步增加 `--exclude='uploads'`，即使误加 `--delete` 也不影响 uploads
- `mkdir -p` 指向新的独立存储路径
- 移除对 `/var/www/xujing/public/uploads` 的依赖

---

## 7. Docker 存储卷方案（未来）

### 7.1 docker-compose.yml 配置

```yaml
services:
  xujing-app:
    image: xujing-web:latest
    volumes:
      - upload-data:/var/data/xujing/uploads  # 独立存储卷
      - pg-data:/var/lib/postgresql/data       # 数据库持久化
    environment:
      - UPLOAD_DIR=/var/data/xujing/uploads
      - DATABASE_URL=postgresql://postgres:***@db:5432/xujing

volumes:
  upload-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/data/xujing/uploads
  pg-data:
    driver: local
```

### 7.2 docker-entrypoint.sh 适配

```bash
#!/bin/bash
# 确保 uploads 目录存在且权限正确
mkdir -p "${UPLOAD_DIR:-/var/data/xujing/uploads}"
chown -R www-data:www-data "${UPLOAD_DIR:-/var/data/xujing/uploads}"

# 执行数据库迁移
npx drizzle-kit migrate

# 启动应用
exec node server.js
```

---

## 8. 安全加固

### 8.1 目录权限

```bash
# uploads 目录权限
chown -R www-data:www-data /var/data/xujing/uploads
chmod -R 755 /var/data/xujing/uploads

# 禁止执行权限
find /var/data/xujing/uploads -type f -exec chmod 644 {} \;
find /var/data/xujing/uploads -type d -exec chmod 755 {} \;
```

### 8.2 Nginx 安全头

| Header | 值 | 作用 |
|--------|-----|------|
| `X-Content-Type-Options` | `nosniff` | 防止 MIME 嗅探 |
| `Cache-Control` | `public, max-age=86400` | 缓存 24 小时 |
| `Content-Disposition` | （可选）`inline` | 防止下载而非预览 |

### 8.3 上传 API 安全清单

| 检查项 | 当前状态 | 建议 |
|--------|----------|------|
| 认证 | ✅ requireAuth | 已有 |
| 频率限制 | ✅ rateLimit (free:10/min, vip:30/min) | 已有 |
| 文件类型 | ✅ jpg/png/webp | 已有 |
| 文件大小 | ✅ 10MB | 已有 |
| UUID 命名 | ✅ 防路径遍历 | 已有 |
| 文件删除 API | ❌ 无 | **不建议添加**，防止误删 |
| 路径遍历防护 | ⚠️ 依赖 UUID | 建议增加 `path.basename()` 校验 |
| 病毒扫描 | ❌ 无 | 建议未来接入 ClamAV |
| 文件内容校验 | ⚠️ 仅 MIME | 建议增加 magic bytes 校验 |

---

## 9. 验证清单

### 9.1 迁移前验证

- [ ] 确认 `/var/data/xujing/uploads` 目录已创建
- [ ] 确认目录权限 `www-data:www-data 755`
- [ ] 确认 Nginx 配置语法正确 `nginx -t`
- [ ] 确认环境变量 `UPLOAD_DIR` 已设置
- [ ] 确认回滚方案已准备

### 9.2 迁移后验证

- [ ] 上传新文件 → 检查存储到 `/var/data/xujing/uploads/`
- [ ] 访问 `/uploads/xxx` → 返回正确文件
- [ ] 执行 `rsync -avz --delete standalone/public/ /var/www/xujing/public/` → uploads 不受影响
- [ ] PM2 进程正常运行
- [ ] Nginx 无错误日志

---

## 10. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 迁移期间文件丢失 | 低 | 高 | 先 cp 后删，验证数量 |
| Nginx alias 配置错误 | 低 | 高 | `nginx -t` 预检 |
| 环境变量未生效 | 中 | 高 | PM2 `--update-env` + 启动日志验证 |
| 磁盘空间不足 | 低 | 高 | 迁移前 `df -h` 检查 |
| 回滚失败 | 极低 | 极高 | 保留原目录直到验证完成 |

---

## 附录 A：目录结构对比

```
Before:                              After:
/var/www/xujing/public/             /var/data/xujing/uploads/        ← 独立
├── images/                          ├── e81dc794-xxxx.jpg
│   └── official/                    ├── 42d413e0-xxxx.jpg
│       ├── 沈嘉明.png               └── ...
│       └── 雫崎富香.png
├── logo.png                         /var/www/xujing/public/          ← 安全
├── favicon.svg                      ├── images/
└── uploads/  ← 危险！              │   └── official/
    ├── e81dc794-xxxx.jpg            │       ├── 沈嘉明.png
    └── ...                          │       └── 雫崎富香.png
                                     ├── logo.png
                                     └── favicon.svg
```

## 附录 B：相关文件

| 文件 | 路径 | 说明 |
|------|------|------|
| Nginx 配置 | `docs/p0-security/nginx-xujing-uploads.conf` | Uploads 独立 Nginx 配置 |
| 上传 API | `src/app/api/upload/route.ts` | 文件上传接口 |
| 部署脚本 | `deploy.sh` | 部署流程 |
| Docker 入口 | `docker-entrypoint.sh` | Docker 启动脚本 |
| 资产审计 | `docs/p0-security/UPLOAD_ASSET_REPORT.md` | Uploads 资产审计报告 |