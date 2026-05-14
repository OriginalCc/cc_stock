#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 做T助手 — 一键部署脚本 (Ubuntu/Debian/CentOS)
#
# 使用方法:
#   git clone https://your-repo.git && cd stock-t-assistant
#   bash setup.sh
#
# 或直接:
#   curl -fsSL https://your-repo/setup.sh | bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Detect OS ──
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
  elif command -v lsb_release &>/dev/null; then
    OS=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
  else
    OS="unknown"
  fi
  info "检测到系统: $OS"
}

# ── Check root ──
check_root() {
  if [ "$EUID" -ne 0 ]; then
    warn "建议使用 root 用户运行此脚本"
    warn "非 root 用户可能需要 sudo 权限安装依赖"
  fi
}

# ── Install Node.js ──
install_node() {
  if command -v node &>/dev/null && [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -ge 18 ]; then
    ok "Node.js $(node -v) 已安装"
    return
  fi

  info "安装 Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null || {
    # fallback to nvm
    info "使用 nvm 安装..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    nvm alias default 20
  }
  sudo apt-get install -y nodejs 2>/dev/null || sudo yum install -y nodejs 2>/dev/null || true
  ok "Node.js $(node -v) 安装完成"
}

# ── Install Bun ──
install_bun() {
  if command -v bun &>/dev/null; then
    ok "Bun $(bun -v) 已安装"
    return
  fi
  info "安装 Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  ok "Bun 安装完成"
}

# ── Install PM2 ──
install_pm2() {
  if command -v pm2 &>/dev/null; then
    ok "PM2 已安装"
    return
  fi
  info "安装 PM2..."
  sudo npm install -g pm2 2>/dev/null || npm install -g pm2
  ok "PM2 安装完成"
}

# ── Install Git ──
install_git() {
  if command -v git &>/dev/null; then
    ok "Git 已安装"
    return
  fi
  info "安装 Git..."
  sudo apt-get install -y git 2>/dev/null || sudo yum install -y git 2>/dev/null || true
  ok "Git 安装完成"
}

# ── Setup project ──
setup_project() {
  PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
  info "项目目录: $PROJECT_DIR"

  cd "$PROJECT_DIR"

  # Create .env if not exists
  if [ ! -f .env ]; then
    info "创建 .env 配置文件..."
    cat > .env << 'EOF'
DATABASE_URL=file:./db/custom.db
APP_PASSWORD=888888
NODE_ENV=production
EOF
    warn "默认密码为 888888，请在启动后在界面上修改！"
  else
    ok ".env 配置文件已存在"
  fi

  # Create logs directory
  mkdir -p logs

  # Install dependencies
  info "安装依赖 (可能需要1-2分钟)..."
  bun install 2>/dev/null || npm install

  # Generate Prisma client
  info "生成 Prisma Client..."
  npx prisma generate

  # Initialize database
  info "初始化数据库..."
  npx prisma db push

  # Build
  info "构建项目 (可能需要2-5分钟，请耐心等待)..."
  NODE_OPTIONS="--max-old-space-size=2048" bun run build 2>/dev/null || \
    NODE_OPTIONS="--max-old-space-size=2048" npm run build

  ok "项目构建完成！"
}

# ── Start with PM2 ──
start_pm2() {
  info "启动 PM2 服务..."
  pm2 start ecosystem.config.js
  pm2 save

  # Setup auto-start on reboot
  pm2_startup=$(pm2 startup 2>/dev/null | grep "sudo" || true)
  if [ -n "$pm2_startup" ]; then
    info "配置开机自启..."
    eval "$pm2_startup" 2>/dev/null || true
  fi

  ok "PM2 服务已启动！"
}

# ── Verify ──
verify() {
  info "验证服务..."
  sleep 3

  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200"; then
    ok "服务运行正常！"
  else
    warn "服务可能还在启动中，请稍等几秒后访问"
    info "手动检查: curl http://localhost:3000"
  fi
}

# ── Print success ──
print_success() {
  # Get server IP
  SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "你的服务器IP")

  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  ✅ 做T助手 部署成功！${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  🌐 访问地址: ${BLUE}http://${SERVER_IP}:3000${NC}"
  echo -e "  🔐 默认密码: ${YELLOW}888888${NC}"
  echo -e "  📝 请登录后在「密码管理」中修改密码"
  echo ""
  echo -e "  常用命令:"
  echo -e "    查看状态:  ${BLUE}pm2 status${NC}"
  echo -e "    查看日志:  ${BLUE}pm2 logs stock-t-assistant${NC}"
  echo -e "    重启服务:  ${BLUE}pm2 restart stock-t-assistant${NC}"
  echo -e "    停止服务:  ${BLUE}pm2 stop stock-t-assistant${NC}"
  echo ""
  echo -e "  更新部署:"
  echo -e "    ${BLUE}git pull && bash setup.sh${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ━━━ Main ━━━
main() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  做T助手 — 一键部署${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  detect_os
  check_root

  info "Step 1/6: 安装基础环境..."
  install_git
  install_node
  install_bun
  install_pm2

  info "Step 2/6: 配置项目..."
  setup_project

  info "Step 3/6: 启动服务..."
  start_pm2

  info "Step 4/6: 验证部署..."
  verify

  info "Step 5/6: 配置防火墙..."
  if command -v ufw &>/dev/null; then
    sudo ufw allow 3000/tcp 2>/dev/null && ok "防火墙已放行 3000 端口" || true
  elif command -v firewall-cmd &>/dev/null; then
    sudo firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null && \
    sudo firewall-cmd --reload 2>/dev/null && ok "防火墙已放行 3000 端口" || true
  else
    warn "未检测到防火墙，请手动确保 3000 端口可访问"
  fi

  info "Step 6/6: 完成！"
  print_success
}

main "$@"
