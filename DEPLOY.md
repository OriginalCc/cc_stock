# 做T助手 — 宝塔面板一键部署

> 只需3步，5分钟搞定部署

📖 **完整部署说明书**: [BAOTA_DEPLOY.md](./BAOTA_DEPLOY.md)（推荐阅读，图文详细）

---

## 🚀 快速开始

### Step 1: 上传项目

**方式A — 打包上传（推荐）**

在本地开发机上执行打包：
```bash
bash pack.sh
```
会生成 `stock-t-assistant.tar.gz`（约 5-15MB）

然后在宝塔面板：
1. **文件** → 进入 `/www/wwwroot/`
2. 点击 **上传** → 选择 `stock-t-assistant.tar.gz`
3. 右键压缩包 → **解压**

**方式B — Git 克隆**

在宝塔终端执行：
```bash
cd /www/wwwroot
git clone https://your-repo.git stock-t-assistant
```

---

### Step 2: 一键安装

在宝塔终端执行：
```bash
cd /www/wwwroot/stock-t-assistant
bash bt-install.sh
```

脚本自动完成：安装 Node.js → 安装 PM2 → 安装依赖 → 构建项目 → 启动服务

> 🔐 默认密码: `888888`，可自定义: `bash bt-install.sh 你的密码`

---

### Step 3: 绑定域名（可选）

如果需要域名访问（推荐，可加 HTTPS）：

1. 宝塔面板 → **网站** → **添加站点**
   - 域名: 你的域名
   - PHP: 纯静态

2. 点击站点名 → **反向代理** → **添加反向代理**
   - 目标URL: `http://127.0.0.1:3000`
   - 发送域名: `$host`

3. 点击站点名 → **SSL** → Let's Encrypt → 申请证书 → 开启**强制HTTPS**

4. 访问 `https://你的域名` 🎉

---

## 🌐 暂不绑域名？

直接用 IP 访问: `http://你的服务器IP:3000`

需要在宝塔面板 → **安全** → 防火墙 → 放行 `3000` 端口

---

## 📋 常用命令

```bash
pm2 status                        # 查看服务状态
pm2 logs stock-t-assistant        # 查看日志
pm2 restart stock-t-assistant     # 重启服务
pm2 stop stock-t-assistant        # 停止服务
```

## 🔄 更新部署

```bash
cd /www/wwwroot/stock-t-assistant
git pull                          # 拉取最新代码
bash bt-install.sh                # 重新构建并启动
```

## 🔐 密码管理

- 登录后点击右上角 **「密码管理」** 按钮修改
- 密码保存在数据库中，重启不丢失

## 💾 数据库备份

宝塔面板 → **计划任务** → 添加 Shell 脚本:
```bash
#!/bin/bash
cp /www/wwwroot/stock-t-assistant/db/custom.db /www/backup/stock-t/custom_$(date +\%Y\%m\%d).db
find /www/backup/stock-t/ -name "custom_*.db" -mtime +30 -delete
```
执行周期: 每天 03:00

---

## ❓ 常见问题

**Q: 构建时报内存不足？**
```bash
# 添加 swap
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
# 重新执行
bash bt-install.sh
```

**Q: 端口 3000 被占用？**
```bash
# 查看占用进程
lsof -i :3000
# 或修改端口: 编辑 ecosystem.config.js 中 args 和 PORT
```

**Q: Nginx 502 错误？**
```bash
# 检查服务是否运行
pm2 status
# 如果未运行，查看错误日志
pm2 logs stock-t-assistant --err --lines 30
```

> 更多问题排查见 👉 [BAOTA_DEPLOY.md](./BAOTA_DEPLOY.md)

---

## 🐳 Docker 部署（替代方案）

如果服务器安装了 Docker：
```bash
docker-compose up -d
```
详见 `docker-compose.yml`
