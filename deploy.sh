#!/bin/bash
set -e
cd ~/XuJing-web
git pull
npm install --production
mkdir -p public/uploads
rm -rf .next
npm run build
pkill -f "server.js" 2>/dev/null || true
sleep 1
cp -r public .next/standalone/
rm -rf .next/standalone/public/uploads
ln -sfn $(pwd)/public/uploads .next/standalone/public/uploads
cp -r .next/static .next/standalone/.next/static
cp .env.production .next/standalone/
HOSTNAME=0.0.0.0 nohup node .next/standalone/server.js > /tmp/xujing.log 2>&1 &
sleep 3
curl http://127.0.0.1:3000/api/health