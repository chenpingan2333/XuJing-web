#!/bin/bash
set -e
cd /root/XuJing-web

echo "🔄 [1/6] 正在拉取最新的境域代码..."
git pull

echo "📦 [2/6] 安装依赖锁依赖..."
pnpm install

echo "🧹 [3/6] 清理旧指纹并执行生产环境编译..."
rm -rf .next
set -a
source .env.production
set +a
pnpm run build

echo "🔧 [4/6] 关键手术：锁死 0.0.0.0 监听并补齐 public 生产基因，阻断 400/502..."
mkdir -p .next/standalone/.next
# 【方案 A 核心固化】全量搬运公共资源资产到黑盒中，防范 Image Optimization 报错
cp -r public .next/standalone/
mkdir -p .next/standalone/public/uploads
cp -r .next/static .next/standalone/.next/static
cp .env.production .next/standalone/

# 强制将主机名绑定锁死在 0.0.0.0，杜绝 IPv6 偏航
sed -i "s/const hostname = process.env.HOSTNAME || '0.0.0.0'/const hostname = '0.0.0.0'/" .next/standalone/server.js

echo "🌐 [5/6] 同步全量静态资产到 Nginx 发布目录，防范 404..."
mkdir -p /usr/share/nginx/xujing-static
rm -rf /usr/share/nginx/xujing-static/*
cp -r .next/static/* /usr/share/nginx/xujing-static/

echo "🔄 [6/6] 重载 Nginx 反代并重启 PM2 守护进程..."
nginx -t && nginx -s reload
pm2 restart xujing-app --update-env

echo "✅ 恭喜主理人！全站官方静态图片 400 根因彻底斩杀，部署流完美封神！"
