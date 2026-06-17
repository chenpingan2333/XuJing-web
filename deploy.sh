#!/bin/bash
set -e
cd ~/XuJing-web
git pull
pnpm install
rm -rf .next
set -a
source .env.production
set +a
pnpm run build
# Copy static assets to standalone output
cp -r public .next/standalone/
mkdir -p .next/standalone/public/uploads
cp -r .next/static .next/standalone/.next/static
cp .env.production .next/standalone/
# Ensure Nginx-served uploads directory exists
mkdir -p /var/www/xujing/public/uploads
# Sync static assets to Nginx directory (fix ChunkLoadError)
rsync -av --delete .next/static/ /usr/share/nginx/xujing-static/
# Restart via PM2
pm2 restart xujing-app
sleep 3
curl http://localhost:3003/api/health
