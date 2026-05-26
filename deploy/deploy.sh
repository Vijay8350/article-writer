#!/usr/bin/env bash
# Deployment script - runs on the EC2 server.
# Triggered remotely by GitHub Actions over SSH after each push to main.
set -euo pipefail

APP_DIR="/home/ubuntu/Article_Writer"
cd "$APP_DIR"

echo "==> Pulling latest code"
git fetch --all
git reset --hard origin/main

echo "==> Installing backend dependencies"
cd "$APP_DIR/backend"
npm ci --omit=dev

echo "==> Installing & building frontend"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> Reloading PM2 process"
cd "$APP_DIR"
if pm2 describe article-writer-backend > /dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save

echo "==> Deploy finished"
