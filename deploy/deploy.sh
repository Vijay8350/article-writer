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

echo "==> Running database migrations (skipped until a 'migrate' script exists)"
# --if-present exits 0 when no migrate script is defined yet, so pre-SaaS deploys still pass.
# Migrations must be idempotent + tracked (a schema_migrations table) so re-deploys are safe.
npm run migrate --if-present

echo "==> Installing & building frontend"
cd "$APP_DIR/frontend"
npm ci
# Cap V8 heap so the Vite build can't OOM the 908MB instance (swap covers the rest).
NODE_OPTIONS="--max-old-space-size=512" npm run build

echo "==> Reloading PM2 process"
cd "$APP_DIR"
if pm2 describe article-writer-backend > /dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save

echo "==> Deploy finished"
