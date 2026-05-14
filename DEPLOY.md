# 做T助手 — 部署指南

> 三种部署方式，从简单到灵活，选择最适合你的

---

## 🐳 方式一：Docker 一键部署（推荐，最简单）

### 前提条件
- 安装了 [Docker](https://docs.docker.com/get-docker/) 和 Docker Compose

### 一条命令搞定

```bash
# 1. 克隆项目
git clone https://your-repo.git stock-t-assistant
cd stock-t-assistant

# 2. （可选）修改密码 — 编辑 docker-compose.yml 中的 APP_PASSWORD
#    默认密码: 888888

# 3. 一键启动！
docker-compose up -d
```

### 访问
打开浏览器访问 `http://你的服务器IP:3000`，输入密码 `888888`

### 常用命令

```bash
docker-compose logs -f           # 查看日志
docker-compose restart           # 重启服务
docker-compose down              # 停止服务
docker-compose up -d --build     # 更新并重启（代码更新后执行）
```

### 数据持久化
数据库自动保存在 Docker Volume `stock-t-assistant-data` 中，删除容器不会丢失数据。

---

## 🖥️ 方式二：VPS 一键脚本部署

### 前提条件
- 一台 Ubuntu/Debian/CentOS 服务器
- 可以用 root 或有 sudo 权限的用户

### 一条命令搞定

```bash
# 克隆项目并一键部署
git clone https://your-repo.git stock-t-assistant
cd stock-t-assistant
bash setup.sh
```

脚本会自动完成：
1. ✅ 安装 Node.js 20 + Bun + PM2
2. ✅ 安装项目依赖
3. ✅ 初始化 SQLite 数据库
4. ✅ 构建项目
5. ✅ 启动 PM2 服务（自动重启 + 开机自启）
6. ✅ 配置防火墙放行 3000 端口

### 访问
打开浏览器访问 `http://你的服务器IP:3000`，输入密码 `888888`

### 更新部署

```bash
cd stock-t-assistant
git pull
bash setup.sh          # 重新构建并重启
```

### 常用命令

```bash
pm2 status                          # 查看服务状态
pm2 logs stock-t-assistant          # 查看日志
pm2 restart stock-t-assistant       # 重启服务
pm2 stop stock-t-assistant          # 停止服务
```

---

## 🔧 方式三：宝塔面板部署

适合已安装宝塔面板的服务器，可以通过 Nginx 反向代理 + 域名访问。

### 步骤

```bash
# 1. 在宝塔面板安装 PM2管理器（软件商店搜索安装）

# 2. 上传项目到 /www/wwwroot/stock-t-assistant

# 3. SSH 执行
cd /www/wwwroot/stock-t-assistant
bash setup.sh

# 4. 宝塔面板 → 网站 → 添加站点
#    域名: 你的域名
#    PHP: 纯静态

# 5. 站点设置 → 反向代理 → 添加
#    目标URL: http://127.0.0.1:3000
#    发送域名: $host

# 6. （推荐）站点设置 → SSL → 申请 Let's Encrypt 免费证书 → 开启强制HTTPS
```

### 访问
打开浏览器访问 `https://你的域名`

---

## 🔐 密码管理

- 默认密码: `888888`
- 登录后点击右上角 **「密码管理」** 按钮即可修改
- 密码修改后保存在数据库中，重启不丢失
- 也可以通过环境变量 `APP_PASSWORD` 设置初始密码

## 💾 数据备份

```bash
# 手动备份数据库
cp db/custom.db backup/custom_$(date +%Y%m%d).db

# Docker 环境
docker cp stock-t-assistant:/app/db/custom.db ./backup/

# 设置定时备份（crontab -e）
0 3 * * * cp /path/to/db/custom.db /path/to/backup/custom_$(date +\%Y\%m\%d).db
```

## ❓ 常见问题

**Q: 构建内存不足？**
```bash
# 增加 swap
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

**Q: 端口被占用？**
```bash
# 修改端口: 编辑 ecosystem.config.js 中的 PORT 和 args
# 或 Docker: 修改 docker-compose.yml 中的 ports "你的端口:3000"
```

**Q: 无法访问？**
```bash
# 检查服务是否运行
pm2 status          # VPS 部署
docker-compose ps   # Docker 部署

# 检查防火墙
sudo ufw allow 3000/tcp
```
