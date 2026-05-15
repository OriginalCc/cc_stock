#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 做T助手 — 宝塔面板一键安装脚本
#
# 🎯 使用方法 (二选一):
#
#   【方式A】上传项目后安装:
#     1. 宝塔面板 → 文件 → 上传项目压缩包到 /www/wwwroot/
#     2. 解压压缩包
#     3. 宝塔终端执行:
#        cd /www/wwwroot/stock-t-assistant
#        bash bt-install.sh
#
#   【方式B】直接在终端一键安装 (需有Git仓库):
#     bash <(curl -fsSL https://your-repo/bt-install.sh)
#
# 📋 宝塔面板前置操作:
#   软件商店 → 安装 "PM2管理器" (会自动装Node.js)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

# ── Colors ──
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; C='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${B}[INFO]${NC} $1"; }
ok()    { echo -e "${G}[OK]${NC} $1"; }
warn()  { echo -e "${Y}[WARN]${NC} $1"; }
err()   { echo -e "${R}[ERROR]${NC} $1"; exit 1; }
step()  { echo -e "\n${C}━━━ $1 ━━━${NC}"; }

# ── Project directory ──
PROJECT_DIR=""
INSTALL_DIR="/www/wwwroot/stock-t-assistant"

# ── Parse arguments ──
PASSWORD="${1:-888888}"

# ━━━━━━━━━━━━━━━ Step 1: 环境 ━━━━━━━━━━━━━━━

install_node() {
  # 宝塔的 PM2 管理器自带的 Node.js
  if [ -d "/www/server/nodejs" ]; then
    export PATH="/www/server/nodejs/v20*/bin:$PATH"
  fi
  if [ -d "/www/server/nvm" ]; then
    export NVM_DIR="/www/server/nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  fi

  if command -v node &>/dev/null && [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -ge 18 ]; then
    ok "Node.js $(node -v)"
    return
  fi

  step "安装 Node.js 20"
  # Try nodesource first
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null
    yum install -y nodejs
  else
    # Fallback: nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm install 20 && nvm alias default 20
  fi

  command -v node &>/dev/null || err "Node.js 安装失败，请手动安装"
  ok "Node.js $(node -v)"
}

install_pm2() {
  if command -v pm2 &>/dev/null; then
    ok "PM2 $(pm2 -v)"
    return
  fi
  step "安装 PM2"
  npm install -g pm2
  command -v pm2 &>/dev/null || err "PM2 安装失败"
  ok "PM2 安装完成"
}

# ━━━━━━━━━━━━━━━ Step 2: 项目 ━━━━━━━━━━━━━━━

find_project() {
  # 如果脚本在项目目录内运行
  if [ -f "$(cd "$(dirname "$0")" && pwd)/package.json" ]; then
    PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
    return
  fi

  # 如果是从 curl 管道运行，需要 clone
  if [ ! -d "$INSTALL_DIR" ]; then
    step "下载项目"
    mkdir -p /www/wwwroot 2>/dev/null || true

    # 尝试 git clone (需要用户设置仓库地址)
    if [ -n "$REPO_URL" ]; then
      git clone "$REPO_URL" "$INSTALL_DIR"
    else
      err "请先上传项目文件到 $INSTALL_DIR 或设置 REPO_URL 环境变量"
    fi
  fi

  PROJECT_DIR="$INSTALL_DIR"
}

setup_project() {
  step "配置项目"
  cd "$PROJECT_DIR"
  info "项目目录: $PROJECT_DIR"

  # .env
  if [ ! -f .env ]; then
    cat > .env << ENVEOF
DATABASE_URL=file:$PROJECT_DIR/db/custom.db
APP_PASSWORD=$PASSWORD
NODE_ENV=production
ENVEOF
    ok ".env 已创建 (密码: $PASSWORD)"
  else
    ok ".env 已存在"
  fi

  mkdir -p logs db

  # Install deps
  step "安装依赖"
  if command -v bun &>/dev/null; then
    bun install
  else
    npm install
  fi

  # Prisma
  step "初始化数据库"
  npx prisma generate
  npx prisma db push

  # Build
  step "构建项目 (2-5分钟，请耐心等待...)"
  if command -v bun &>/dev/null; then
    NODE_OPTIONS="--max-old-space-size=2048" bun run build
  else
    NODE_OPTIONS="--max-old-space-size=2048" npm run build
  fi
  ok "构建完成"
}

# ━━━━━━━━━━━━━━━ Step 3: 启动 ━━━━━━━━━━━━━━━

start_service() {
  step "启动服务"

  # Stop existing if any
  pm2 delete stock-t-assistant 2>/dev/null || true

  # Start
  pm2 start ecosystem.config.js
  pm2 save

  # Auto start on reboot
  pm2_startup_output=$(pm2 startup 2>/dev/null || true)
  startup_cmd=$(echo "$pm2_startup_output" | grep -E "^sudo" | head -1)
  if [ -n "$startup_cmd" ]; then
    info "配置开机自启..."
    eval "$startup_cmd" 2>/dev/null || true
  fi

  ok "服务已启动"
}

# ━━━━━━━━━━━━━━━ Step 4: 宝塔配置提示 ━━━━━━━━━━━━━━━

bt_tips() {
  SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "你的服务器IP")

  echo ""
  echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${G}  ✅ 做T助手 安装成功！${NC}"
  echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  🔐 默认密码: ${Y}$PASSWORD${NC}  (登录后在右上角「密码管理」修改)"
  echo ""
  echo -e "  ${C}📋 接下来在宝塔面板操作 (绑定域名+HTTPS):${NC}"
  echo ""
  echo -e "  ${B}1.${NC} 宝塔面板 → ${B}网站${NC} → ${B}添加站点${NC}"
  echo -e "     域名填你的域名，PHP选「纯静态」"
  echo ""
  echo -e "  ${B}2.${NC} 点击站点名 → ${B}反向代理${NC} → ${B}添加反向代理${NC}"
  echo -e "     目标URL: ${Y}http://127.0.0.1:3000${NC}"
  echo -e "     发送域名: ${Y}\$host${NC}"
  echo ""
  echo -e "  ${B}3.${NC} 点击站点名 → ${B}SSL${NC} → Let's Encrypt → 申请证书"
  echo -e "     开启 ${Y}强制HTTPS${NC}"
  echo ""
  echo -e "  ${C}完成后访问: https://你的域名${NC}"
  echo ""
  echo -e "  ────────────────────────────────────"
  echo -e "  ${C}暂不绑域名? 直接IP访问:${NC}"
  echo -e "  ${B}http://${SERVER_IP}:3000${NC}"
  echo ""
  echo -e "  宝塔面板 → 安全 → 防火墙 → 放行 ${Y}3000${NC} 端口"
  echo -e "  ────────────────────────────────────"
  echo ""
  echo -e "  ${C}常用命令:${NC}"
  echo -e "    查看状态: ${B}pm2 status${NC}"
  echo -e "    查看日志: ${B}pm2 logs stock-t-assistant${NC}"
  echo -e "    重启服务: ${B}pm2 restart stock-t-assistant${NC}"
  echo -e "    更新部署: ${B}cd $PROJECT_DIR && git pull && bash bt-install.sh${NC}"
  echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ━━━━━━━━━━━━━━━ Main ━━━━━━━━━━━━━━━

main() {
  echo ""
  echo -e "${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${C}  做T助手 — 宝塔面板一键安装${NC}"
  echo -e "${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # Step 1: Environment
  step "Step 1/4: 检查并安装环境"
  install_node
  install_pm2

  # Step 2: Project
  find_project
  setup_project

  # Step 3: Start
  start_service

  # Step 4: Tips
  step "Step 4/4: 完成"
  bt_tips
}

main "$@"
