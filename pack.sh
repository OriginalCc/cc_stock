#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 做T助手 — 项目打包脚本
#
# 将项目打包为最小压缩包，方便上传到宝塔面板
#
# 使用方法:
#   bash pack.sh
#
# 生成文件:
#   stock-t-assistant.tar.gz  (约 5-15MB)
#
# 上传到宝塔后:
#   1. 宝塔面板 → 文件 → 上传到 /www/wwwroot/
#   2. 解压
#   3. 终端执行: cd /www/wwwroot/stock-t-assistant && bash bt-install.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

PROJECT_NAME="stock-t-assistant"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR"

echo ""
echo "📦 打包做T助手项目..."
echo ""

# Create temp directory
TMP_DIR=$(mktemp -d)
COPY_DIR="$TMP_DIR/$PROJECT_NAME"

echo "📋 复制项目文件..."

# Copy essential files
mkdir -p "$COPY_DIR"
cd "$SCRIPT_DIR"

# Core project files
cp -r src "$COPY_DIR/"
cp -r prisma "$COPY_DIR/"
cp -r public "$COPY_DIR/"

# Config files
cp package.json "$COPY_DIR/"
cp bun.lock "$COPY_DIR/" 2>/dev/null || true
cp next.config.ts "$COPY_DIR/"
cp tsconfig.json "$COPY_DIR/"
cp postcss.config.mjs "$COPY_DIR/"
cp eslint.config.mjs "$COPY_DIR/" 2>/dev/null || true
cp components.json "$COPY_DIR/"
cp tailwind.config.ts "$COPY_DIR/" 2>/dev/null || true

# Deployment files
cp ecosystem.config.js "$COPY_DIR/"
cp bt-install.sh "$COPY_DIR/"
cp setup.sh "$COPY_DIR/"
cp Dockerfile "$COPY_DIR/" 2>/dev/null || true
cp docker-compose.yml "$COPY_DIR/" 2>/dev/null || true
cp docker-entrypoint.sh "$COPY_DIR/" 2>/dev/null || true
cp .env.example "$COPY_DIR/"
cp .dockerignore "$COPY_DIR/" 2>/dev/null || true
cp DEPLOY.md "$COPY_DIR/"

# Ensure scripts are executable
chmod +x "$COPY_DIR/bt-install.sh" "$COPY_DIR/setup.sh" 2>/dev/null || true

# Create default .env
cp .env.example "$COPY_DIR/.env"

# Remove unnecessary files from copy
rm -rf "$COPY_DIR/src/components/ui" 2>/dev/null || true  # Will be regenerated
# Actually keep ui components - they're source code
# Restore ui
rm -rf "$COPY_DIR/src"
cp -r src "$COPY_DIR/"

# Pack
echo "🗜️  压缩中..."
cd "$TMP_DIR"
tar -czf "$OUTPUT_DIR/$PROJECT_NAME.tar.gz" "$PROJECT_NAME"

# Cleanup
rm -rf "$TMP_DIR"

# Show result
FILE_SIZE=$(du -h "$OUTPUT_DIR/$PROJECT_NAME.tar.gz" | cut -f1)

echo ""
echo "✅ 打包完成！"
echo ""
echo "   文件: $OUTPUT_DIR/$PROJECT_NAME.tar.gz"
echo "   大小: $FILE_SIZE"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 宝塔面板部署步骤:"
echo ""
echo "  1. 宝塔面板 → 文件 → 上传 $PROJECT_NAME.tar.gz 到 /www/wwwroot/"
echo "  2. 解压压缩包"
echo "  3. 宝塔面板 → 终端 执行:"
echo ""
echo "     cd /www/wwwroot/$PROJECT_NAME"
echo "     bash bt-install.sh"
echo ""
echo "  4. 如需域名访问，在宝塔面板 → 网站 → 添加站点 → 反向代理到 127.0.0.1:3000"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
