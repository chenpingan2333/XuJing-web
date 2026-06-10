#!/bin/bash
set -e
cd ~/XuJing-web
git pull
pnpm install
mkdir -p public/uploads
# Backup uploaded avatars before clearing .next
UPLOAD_BACKUP=$(mktemp -d)
if [ -d ".next/standalone/public/uploads" ] && [ "$(ls -A .next/standalone/public/uploads 2>/dev/null)" ]; then
  cp -r .next/standalone/public/uploads "$UPLOAD_BACKUP/" 2>/dev/null || true
fi
rm -rf .next
set -a
source .env.production
set +a
pnpm run build
pkill -f "server.js" 2>/dev/null || true
sleep 1
cp -r public .next/standalone/
mkdir -p .next/standalone/public/uploads
if [ -d "$UPLOAD_BACKUP/uploads" ] && [ "$(ls -A $UPLOAD_BACKUP/uploads 2>/dev/null)" ]; then
  cp -r "$UPLOAD_BACKUP/uploads/"* .next/standalone/public/uploads/ 2>/dev/null || true
fi
rm -rf "$UPLOAD_BACKUP"
cp -r .next/static .next/standalone/.next/static
cp .env.production .next/standalone/
HOSTNAME=0.0.0.0 PORT=3003 nohup node .next/standalone/server.js > /tmp/xujing.log 2>&1 &
sleep 3
curl http://127.0.0.1:3003/api/health
