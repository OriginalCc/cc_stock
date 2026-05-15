#!/bin/sh
set -e

# ── 做T助手 Docker Entry Point ──
# Initializes SQLite database on first run

echo "🚀 做T助手 启动中..."

# Initialize database if it doesn't exist
if [ ! -f /app/db/custom.db ]; then
  echo "📦 初始化数据库..."
  npx prisma db push --skip-generate 2>/dev/null || echo "⚠️ 数据库初始化可能需要手动执行"
else
  echo "✅ 数据库已存在"
fi

# Start the application
echo "🌐 启动服务 (端口: 3000)..."
exec "$@"
