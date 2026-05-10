# 做T助手 — 宝塔面板部署指南

> 本文档详细介绍如何将「做T助手」Next.js 应用部署到使用宝塔面板（BT Panel）的 Linux 服务器上。

---

## 目录

1. [服务器环境要求](#1-服务器环境要求)
2. [宝塔面板安装](#2-宝塔面板安装)
3. [基础环境配置](#3-基础环境配置)
4. [项目上传与构建](#4-项目上传与构建)
5. [PM2 进程管理](#5-pm2-进程管理)
6. [Nginx 反向代理配置](#6-nginx-反向代理配置)
7. [SSL 证书配置（HTTPS）](#7-ssl-证书配置https)
8. [Prisma 数据库初始化](#8-prisma-数据库初始化)
9. [环境变量配置](#9-环境变量配置)
10. [更新部署流程](#10-更新部署流程)
11. [常见问题排查](#11-常见问题排查)
12. [性能优化建议](#12-性能优化建议)

---

## 1. 服务器环境要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| 操作系统 | CentOS 7+ / Ubuntu 18+ / Debian 10+ | Ubuntu 20.04 / 22.04 LTS |
| CPU | 1 核 | 2 核+ |
| 内存 | 1 GB | 2 GB+ |
| 磁盘 | 10 GB | 20 GB+ SSD |
| Node.js | 18.x+ | 20.x LTS |
| 包管理器 | npm / bun | bun |

---

## 2. 宝塔面板安装

如果你的服务器还没有安装宝塔面板，执行以下命令：

### Ubuntu/Debian：

```bash
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec
```

### CentOS：

```bash
yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && sh install.sh ed8484bec
```

安装完成后，记录面板访问地址、用户名和密码。

登录宝塔面板后，在**推荐安装**中选择 **Nginx** 安装（不需要 MySQL、PHP 等），数据库使用的是 SQLite。

---

## 3. 基础环境配置

### 3.1 安装 Node.js

在宝塔面板中：

1. 进入 **软件商店**
2. 搜索 **PM2管理器** 并安装（会自动安装 Node.js）
3. 或者手动安装指定版本：

```bash
# 安装 nvm（Node 版本管理器）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# 安装 Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# 验证
node -v   # 应显示 v20.x.x
npm -v
```

### 3.2 安装 Bun（推荐）

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun -v
```

> 💡 Bun 比 npm 快得多，构建和安装依赖速度可提升 3-10 倍。

### 3.3 安装 PM2

```bash
npm install -g pm2
pm2 -v
```

---

## 4. 项目上传与构建

### 4.1 上传项目文件

**方式一：Git 克隆（推荐）**

```bash
# 创建项目目录
mkdir -p /www/wwwroot
cd /www/wwwroot

# 克隆项目（替换为你的仓库地址）
git clone https://your-repo-url.git stock-t-assistant
cd stock-t-assistant
```

**方式二：宝塔面板上传**

1. 进入宝塔面板 → **文件**
2. 导航到 `/www/wwwroot/`
3. 点击 **上传**，将项目压缩包上传并解压

**方式三：SCP 上传**

在本地电脑执行：

```bash
# 打包项目（排除 node_modules 和 .next）
tar --exclude='node_modules' --exclude='.next' -czf stock-t-assistant.tar.gz /path/to/project

# 上传到服务器
scp stock-t-assistant.tar.gz root@your-server-ip:/www/wwwroot/

# 在服务器上解压
ssh root@your-server-ip
cd /www/wwwroot
tar -xzf stock-t-assistant.tar.gz
```

### 4.2 安装依赖

```bash
cd /www/wwwroot/stock-t-assistant

# 使用 Bun（推荐，更快）
bun install

# 或使用 npm
npm install
```

### 4.3 生成 Prisma 客户端

```bash
# 生成 Prisma Client
npx prisma generate

# 推送数据库 Schema（创建 SQLite 数据库文件）
npx prisma db push
```

### 4.4 构建项目

```bash
# 使用 Bun
NODE_OPTIONS="--max-old-space-size=2048" bun run build

# 或使用 npm
NODE_OPTIONS="--max-old-space-size=2048" npm run build
```

> ⚠️ 构建过程需要约 1-3 分钟，内存消耗较大。如果服务器内存不足 2GB，建议添加 swap：
> ```bash
> # 创建 2GB swap
> sudo fallocate -l 2G /swapfile
> sudo chmod 600 /swapfile
> sudo mkswap /swapfile
> sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

构建成功后，会在项目根目录生成 `.next` 文件夹。

### 4.5 验证构建

```bash
# 手动启动测试
NODE_OPTIONS="--max-old-space-size=2048" npx next start -p 3000

# 测试访问
curl http://localhost:3000
# 应返回 HTML 内容

# Ctrl+C 停止测试
```

---

## 5. PM2 进程管理

### 5.1 创建 PM2 配置文件

在项目根目录创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [
    {
      name: 'stock-t-assistant',
      script: './node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/www/wwwroot/stock-t-assistant',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=2048',
        PORT: 3000,
        DATABASE_URL: 'file:/www/wwwroot/stock-t-assistant/db/custom.db',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/www/wwwlogs/stock-t-error.log',
      out_file: '/www/wwwlogs/stock-t-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
    },
  ],
};
```

### 5.2 启动应用

```bash
cd /www/wwwroot/stock-t-assistant

# 使用配置文件启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs stock-t-assistant

# 保存进程列表（开机自启）
pm2 save
pm2 startup
```

### 5.3 常用 PM2 命令

```bash
pm2 restart stock-t-assistant   # 重启
pm2 stop stock-t-assistant      # 停止
pm2 delete stock-t-assistant    # 删除
pm2 logs stock-t-assistant      # 查看日志
pm2 monit                       # 监控面板
pm2 describe stock-t-assistant  # 详细信息
```

---

## 6. Nginx 反向代理配置

### 6.1 在宝塔面板中添加站点

1. 进入宝塔面板 → **网站** → **添加站点**
2. 填写：
   - **域名**：填写你的域名（如 `stock.example.com`）
   - **根目录**：`/www/wwwroot/stock-t-assistant`
   - **PHP版本**：选择 **纯静态**
   - **数据库**：不创建
3. 点击 **提交**

### 6.2 配置反向代理

1. 点击站点名称 → **反向代理**
2. 点击 **添加反向代理**
3. 填写：
   - **代理名称**：`stock-t-assistant`
   - **目标URL**：`http://127.0.0.1:3000`
   - **发送域名**：`$host`
4. 点击 **提交**

### 6.3 手动配置 Nginx（进阶）

如果需要更精细的控制，可以直接编辑 Nginx 配置：

1. 点击站点名称 → **配置文件**
2. 替换为以下内容：

```nginx
server {
    listen 80;
    server_name stock.example.com;  # 替换为你的域名

    # 安全头部
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Next.js 静态资源缓存（.next/static 下的文件有内容哈希，可长期缓存）
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Next.js 图片优化
    location /_next/image {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API 路由（不缓存）
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # SSE/长连接支持
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;

        # 超时设置（选股等API可能耗时较长）
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    # 通用反向代理
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
    }

    # 禁止访问敏感目录
    location ~ ^/(prisma|db|agent-ctx|examples)/ {
        deny all;
    }

    # 日志
    access_log /www/wwwlogs/stock.example.com.log;
    error_log /www/wwwlogs/stock.example.com.error.log;
}
```

3. 保存后，Nginx 会自动重载配置。

---

## 7. SSL 证书配置（HTTPS）

### 7.1 使用宝塔面板申请 Let's Encrypt 免费证书

1. 进入 **网站** → 点击站点名称 → **SSL**
2. 选择 **Let's Encrypt**
3. 勾选域名，点击 **申请**
4. 申请成功后，开启 **强制HTTPS**

### 7.2 WebSocket 支持（如果需要）

在 SSL 配置中，确保 Nginx 支持 WebSocket 升级：

```nginx
# 在 location / 块中确保有以下配置
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### 7.3 HTTP/2 推荐配置

在宝塔面板 SSL 设置中，开启 **HTTP/2** 以提升性能。

---

## 8. Prisma 数据库初始化

### 8.1 确认数据库路径

项目使用 SQLite 数据库，文件位于 `db/custom.db`。确保 `.env` 中的路径正确：

```bash
# 编辑环境变量
cat > /www/wwwroot/stock-t-assistant/.env << 'EOF'
DATABASE_URL=file:/www/wwwroot/stock-t-assistant/db/custom.db
EOF
```

### 8.2 初始化数据库

```bash
cd /www/wwwroot/stock-t-assistant

# 推送 Schema 到数据库（创建表）
npx prisma db push

# 如果需要重置数据库
# npx prisma migrate reset
```

### 8.3 数据库备份

```bash
# 手动备份
cp /www/wwwroot/stock-t-assistant/db/custom.db \
   /www/backup/custom.db.$(date +%Y%m%d_%H%M%S)

# 设置定时备份（宝塔面板 → 计划任务 → Shell脚本）
# 任务名称：备份做T助手数据库
# 执行周期：每天 03:00
# 脚本内容：
#!/bin/bash
BACKUP_DIR="/www/backup/stock-t"
mkdir -p $BACKUP_DIR
cp /www/wwwroot/stock-t-assistant/db/custom.db "$BACKUP_DIR/custom_$(date +\%Y\%m\%d_\%H\%M\%S).db"
# 保留最近 30 天的备份
find $BACKUP_DIR -name "custom_*.db" -mtime +30 -delete
```

---

## 9. 环境变量配置

### 9.1 生产环境 .env 文件

```bash
cat > /www/wwwroot/stock-t-assistant/.env << 'EOF'
# 数据库
DATABASE_URL=file:/www/wwwroot/stock-t-assistant/db/custom.db

# Node 环境
NODE_ENV=production

# 如需配置 API 密钥等，可在此添加
# API_KEY=your_api_key
EOF
```

### 9.2 通过 PM2 环境变量

环境变量也可以在 `ecosystem.config.js` 的 `env` 字段中配置，两者都有效，PM2 的 `env` 优先级更高。

---

## 10. 更新部署流程

### 10.1 自动化部署脚本

在项目根目录创建 `deploy.sh`：

```bash
#!/bin/bash
set -e

PROJECT_DIR="/www/wwwroot/stock-t-assistant"
BACKUP_DIR="/www/backup/stock-t"
LOG_FILE="/www/wwwlogs/deploy.log"

echo "========================================" | tee -a $LOG_FILE
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始部署" | tee -a $LOG_FILE

cd $PROJECT_DIR

# 1. 备份数据库
echo "📦 备份数据库..." | tee -a $LOG_FILE
mkdir -p $BACKUP_DIR
cp db/custom.db "$BACKUP_DIR/custom_$(date '+%Y%m%d_%H%M%S').db"

# 2. 拉取最新代码
echo "📥 拉取最新代码..." | tee -a $LOG_FILE
git pull origin main

# 3. 安装依赖
echo "📦 安装依赖..." | tee -a $LOG_FILE
bun install

# 4. 生成 Prisma Client
echo "🔧 生成 Prisma Client..." | tee -a $LOG_FILE
npx prisma generate

# 5. 更新数据库 Schema（如有变更）
echo "🗄️ 更新数据库..." | tee -a $LOG_FILE
npx prisma db push

# 6. 构建项目
echo "🏗️ 构建项目..." | tee -a $LOG_FILE
NODE_OPTIONS="--max-old-space-size=2048" bun run build

# 7. 重启服务
echo "🔄 重启服务..." | tee -a $LOG_FILE
pm2 restart stock-t-assistant

# 8. 等待启动并检查
echo "⏳ 等待服务启动..." | tee -a $LOG_FILE
sleep 5

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo "✅ 部署成功！服务运行正常" | tee -a $LOG_FILE
else
    echo "⚠️ 服务可能未正常启动，请检查日志" | tee -a $LOG_FILE
    pm2 logs stock-t-assistant --lines 50
fi

echo "========================================" | tee -a $LOG_FILE
```

给脚本执行权限：

```bash
chmod +x deploy.sh
```

### 10.2 手动更新步骤

```bash
cd /www/wwwroot/stock-t-assistant

# 拉取代码
git pull origin main

# 安装依赖
bun install

# 生成 Prisma Client
npx prisma generate

# 更新数据库
npx prisma db push

# 构建
NODE_OPTIONS="--max-old-space-size=2048" bun run build

# 重启
pm2 restart stock-t-assistant

# 检查
pm2 logs stock-t-assistant --lines 20
```

### 10.3 一键部署命令

```bash
cd /www/wwwroot/stock-t-assistant && ./deploy.sh
```

---

## 11. 常见问题排查

### 11.1 构建失败 — 内存不足

**症状**：`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out memory`

**解决方案**：

```bash
# 增加 Node 内存限制
NODE_OPTIONS="--max-old-space-size=4096" bun run build

# 或添加 swap
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 11.2 端口被占用

**症状**：`Error: listen EADDRINUSE: address already in use :::3000`

**解决方案**：

```bash
# 查找占用 3000 端口的进程
lsof -i :3000
# 或
fuser 3000/tcp

# 杀死进程
fuser -k 3000/tcp

# 重启 PM2
pm2 restart stock-t-assistant
```

### 11.3 Nginx 502 Bad Gateway

**症状**：浏览器访问显示 502 错误

**排查步骤**：

```bash
# 1. 检查 Next.js 是否在运行
pm2 status
curl http://localhost:3000

# 2. 如果 Next.js 未运行，查看错误日志
pm2 logs stock-t-assistant --err --lines 50

# 3. 检查 Nginx 配置
nginx -t

# 4. 检查防火墙
sudo ufw status
# 或宝塔面板 → 安全 → 确认 80/443 端口已放行
```

### 11.4 数据库文件权限问题

**症状**：`PrismaClientInitializationError: P1001: Can't reach database server`

**解决方案**：

```bash
# 修改数据库文件权限
chmod 664 /www/wwwroot/stock-t-assistant/db/custom.db
chmod 775 /www/wwwroot/stock-t-assistant/db/

# 修改项目目录所有者（如果使用 www 用户运行）
chown -R www:www /www/wwwroot/stock-t-assistant
```

### 11.5 API 请求超时

**症状**：选股等接口响应很慢或超时

**解决方案**：

在 Nginx 配置中增加超时时间：

```nginx
location /api/ {
    # ...
    proxy_connect_timeout 60s;
    proxy_send_timeout 180s;
    proxy_read_timeout 180s;
}
```

### 11.6 Prisma Client 未生成

**症状**：`Cannot find module '@prisma/client'`

**解决方案**：

```bash
cd /www/wwwroot/stock-t-assistant
npx prisma generate
pm2 restart stock-t-assistant
```

### 11.7 页面样式异常

**症状**：CSS 未加载或样式错乱

**解决方案**：

```bash
# 清理构建缓存重新构建
rm -rf .next
NODE_OPTIONS="--max-old-space-size=2048" bun run build
pm2 restart stock-t-assistant
```

---

## 12. 性能优化建议

### 12.1 开启 Gzip 压缩

在宝塔面板 → 网站 → 站点配置 → 配置文件，添加：

```nginx
# Gzip 压缩
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_comp_level 6;
gzip_types
    text/plain
    text/css
    text/xml
    text/javascript
    application/json
    application/javascript
    application/xml
    application/rss+xml
    image/svg+xml;
gzip_disable "msie6";
```

### 12.2 开启 Brotli 压缩（如果 Nginx 支持）

```nginx
# Brotli 压缩（需安装 nginx-module-brotli）
brotli on;
brotli_comp_level 6;
brotli_types text/plain text/css text/javascript application/javascript application/json;
```

### 12.3 静态资源 CDN 加速

如果访问速度慢，可考虑：
1. 使用宝塔面板自带的 **CDN 加速**功能
2. 将 `/_next/static` 资源托管到 OSS/CDN
3. 修改 `next.config.ts` 中的 `assetPrefix` 配置

### 12.4 PM2 集群模式（多核服务器）

如果服务器有 2 核以上 CPU，可启用集群模式：

```javascript
// ecosystem.config.js 中修改
instances: 'max',    // 自动匹配 CPU 核心数
exec_mode: 'cluster', // 集群模式
```

> ⚠️ 注意：集群模式下 SQLite 可能存在写入冲突，建议仅使用单实例，或改用 PostgreSQL/MySQL。

### 12.5 日志轮转

```bash
# 安装 PM2 日志轮转模块
pm2 install pm2-logrotate

# 配置：保留 7 天日志，单文件最大 50MB
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## 附录 A：完整部署检查清单

| 序号 | 检查项 | 状态 |
|------|--------|------|
| 1 | 服务器已安装宝塔面板 | ☐ |
| 2 | Node.js 20.x 已安装 | ☐ |
| 3 | Bun 已安装（可选） | ☐ |
| 4 | PM2 已安装 | ☐ |
| 5 | 项目已上传到 `/www/wwwroot/stock-t-assistant` | ☐ |
| 6 | 依赖已安装 (`bun install`) | ☐ |
| 7 | Prisma Client 已生成 (`npx prisma generate`) | ☐ |
| 8 | 数据库已初始化 (`npx prisma db push`) | ☐ |
| 9 | 项目已构建 (`bun run build`) | ☐ |
| 10 | `.env` 文件已配置 | ☐ |
| 11 | PM2 配置文件已创建 (`ecosystem.config.js`) | ☐ |
| 12 | PM2 进程已启动并保存 | ☐ |
| 13 | 宝塔面板已添加站点 | ☐ |
| 14 | Nginx 反向代理已配置 | ☐ |
| 15 | 域名 DNS 已解析到服务器 IP | ☐ |
| 16 | SSL 证书已申请并启用 | ☐ |
| 17 | 防火墙已放行 80/443 端口 | ☐ |
| 18 | 数据库定时备份已设置 | ☐ |
| 19 | `http://localhost:3000` 可正常访问 | ☐ |
| 20 | 外部域名可正常访问 | ☐ |

---

## 附录 B：目录结构参考

```
/www/wwwroot/stock-t-assistant/
├── .env                          # 环境变量
├── .next/                        # 构建产物（gitignore）
├── db/
│   └── custom.db                 # SQLite 数据库文件
├── node_modules/                 # 依赖（gitignore）
├── prisma/
│   └── schema.prisma             # 数据库 Schema
├── public/                       # 静态资源
│   └── logo.svg
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx              # 首页
│   │   ├── layout.tsx            # 布局
│   │   └── api/                  # API 路由
│   ├── components/               # React 组件
│   ├── hooks/                    # 自定义 Hooks
│   └── lib/                      # 工具函数
├── ecosystem.config.js           # PM2 配置（需创建）
├── deploy.sh                     # 部署脚本（需创建）
├── next.config.ts                # Next.js 配置
├── package.json
└── tsconfig.json
```

---

## 附录 C：快速部署命令汇总

```bash
# === 一键部署（从零开始）===

# 1. 安装 Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && source ~/.bashrc && nvm install 20

# 2. 安装 Bun
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc

# 3. 安装 PM2
npm install -g pm2

# 4. 克隆项目
cd /www/wwwroot && git clone https://your-repo.git stock-t-assistant && cd stock-t-assistant

# 5. 安装依赖 + 构建
bun install && npx prisma generate && npx prisma db push && NODE_OPTIONS="--max-old-space-size=2048" bun run build

# 6. 创建 PM2 配置
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'stock-t-assistant',
    script: './node_modules/.bin/next',
    args: 'start -p 3000',
    cwd: '/www/wwwroot/stock-t-assistant',
    env: {
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=2048',
      DATABASE_URL: 'file:/www/wwwroot/stock-t-assistant/db/custom.db',
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    error_file: '/www/wwwlogs/stock-t-error.log',
    out_file: '/www/wwwlogs/stock-t-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }],
};
EOF

# 7. 启动
pm2 start ecosystem.config.js && pm2 save && pm2 startup

# 8. 在宝塔面板添加站点 → 配置反向代理到 127.0.0.1:3000
```

---

> 📝 **提示**：部署完成后，建议在宝塔面板的**计划任务**中设置定时备份数据库和自动重启 PM2 进程，确保服务稳定运行。
