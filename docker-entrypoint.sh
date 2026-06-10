#!/bin/sh
set -e

echo "=== 叙境 Xujing ==="
echo "启动数据库迁移..."
npx drizzle-kit migrate

echo "启动 Next.js 服务 (port ${PORT:-3000})..."
exec node server.js