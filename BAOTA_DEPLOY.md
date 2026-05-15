# 做T助手 — 宝塔面板部署说明书

> 本文档手把手教你如何在**宝塔面板**上部署「做T助手」，从零开始，图文对照，零基础也能搞定。

---

## 📋 目录

1. [前置条件](#-前置条件)
2. [方案选择](#-方案选择)
3. [方案一：打包上传部署（推荐）](#-方案一打包上传部署推荐)
4. [方案二：Git 克隆部署](#-方案二git-克隆部署)
5. [方案三：Docker 部署](#-方案三docker-部署)
6. [绑定域名 + HTTPS](#-绑定域名--https)
7. [不绑域名：直接 IP 访问](#-不绑域名直接-ip-访问)
8. [常用管理命令](#-常用管理命令)
9. [更新部署](#-更新部署)
10. [数据库备份](#-数据库备份)
11. [密码管理](#-密码管理)
12. [常见问题排查](#-常见问题排查)

---

## 🔧 前置条件

在开始之前，确保你的服务器满足以下条件：

| 条件 | 要求 |
|------|------|
| 操作系统 | CentOS / Ubuntu / Debian 均可 |
| 宝塔面板 | 已安装（如未安装，见下方说明） |
| 内存 | ≥ 1GB（推荐 2GB+） |
| 磁盘 | ≥ 5GB 可用空间 |
| 网络 | 能访问外网（下载依赖用） |

### 安装宝塔面板（如未安装）

> ⚠️ 如果你已有宝塔面板，跳过此步

**Ubuntu/Debian：**
```bash
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec
```

**CentOS：**
```bash
yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && sh install.sh ed8484bec
```

安装完成后，记录面板访问地址、用户名和密码。

---

## 🎯 方案选择

| 方案 | 适合场景 | 难度 | 耗时 |
|------|---------|------|------|
| **方案一：打包上传** | 无 Git 仓库，本地有项目代码 | ⭐ | 5-10 分钟 |
| **方案二：Git 克隆** | 代码在 GitHub/Gitee 上 | ⭐⭐ | 5-10 分钟 |
| **方案三：Docker** | 服务器已装 Docker | ⭐ | 3 分钟 |

---

## 📦 方案一：打包上传部署（推荐）

### Step 1：本地打包

在你的开发机上，打开终端进入项目目录，执行：

```bash
bash pack.sh
```

执行完毕后，项目根目录会生成 **`stock-t-assistant.tar.gz`** 文件（约 5-15MB）。

### Step 2：宝塔安装 PM2 管理器

1. 登录宝塔面板
2. 点击左侧 **「软件商店」**
3. 搜索 **「PM2管理器」**，点击 **「安装」**
4. 等待安装完成（会自动安装 Node.js）

> 💡 PM2管理器安装完成后，Node.js 环境就有了，无需单独安装。

### Step 3：上传项目文件

1. 点击宝塔左侧 **「文件」**
2. 进入 `/www/wwwroot/` 目录
3. 点击 **「上传」** 按钮
4. 选择刚才生成的 `stock-t-assistant.tar.gz`
5. 等待上传完成

### Step 4：解压文件

1. 在 `/www/wwwroot/` 目录下，找到 `stock-t-assistant.tar.gz`
2. **右键** → **解压**
3. 解压后会生成 `/www/wwwroot/stock-t-assistant/` 目录

### Step 5：一键安装

1. 点击宝塔左侧 **「终端」**
2. 执行以下命令：

```bash
cd /www/wwwroot/stock-t-assistant
bash bt-install.sh
```

> 🔐 如需自定义初始密码（默认 888888），执行：
> ```bash
> bash bt-install.sh 你的密码
> ```

脚本会自动完成以下操作：
- ✅ 检查 Node.js 环境
- ✅ 安装 PM2 进程管理器
- ✅ 创建 `.env` 配置文件
- ✅ 安装项目依赖
- ✅ 初始化数据库
- ✅ 构建项目（2-5 分钟，请耐心等待）
- ✅ 启动服务并配置开机自启

### Step 6：验证

看到以下提示说明安装成功：

```
✅ 做T助手 安装成功！
🔐 默认密码: 888888
```

此时服务已在 **3000 端口** 运行。

👉 继续查看 [绑定域名 + HTTPS](#-绑定域名--https) 或 [直接 IP 访问](#-不绑域名直接-ip-访问)

---

## 🐙 方案二：Git 克隆部署

### Step 1：宝塔安装 PM2 管理器和 Git

1. 宝塔面板 → **软件商店** → 搜索安装 **「PM2管理器」**
2. 软件商店 → 搜索安装 **「Git」**（如未安装）

### Step 2：克隆项目

打开宝塔 **「终端」**，执行：

```bash
cd /www/wwwroot
git clone https://你的仓库地址.git stock-t-assistant
```

### Step 3：一键安装

```bash
cd /www/wwwroot/stock-t-assistant
bash bt-install.sh
```

> 💡 自定义密码：`bash bt-install.sh 你的密码`

### Step 4：验证

看到 `✅ 做T助手 安装成功！` 即为成功。

---

## 🐳 方案三：Docker 部署

> 适用于已安装 Docker 的宝塔面板

### Step 1：安装 Docker

宝塔面板 → **软件商店** → 搜索安装 **「Docker管理器」**

### Step 2：上传项目

同方案一的 Step 3-4，上传并解压项目到 `/www/wwwroot/stock-t-assistant/`

### Step 3：一键启动

打开宝塔 **「终端」**：

```bash
cd /www/wwwroot/stock-t-assistant

# 修改密码（可选，默认 888888）
# 编辑 docker-compose.yml 中 APP_PASSWORD 的值

# 启动
docker-compose up -d
```

### Step 4：验证

```bash
docker-compose ps    # 查看容器状态
docker-compose logs  # 查看日志
```

### Docker 常用命令

```bash
docker-compose up -d          # 启动
docker-compose down           # 停止
docker-compose restart        # 重启
docker-compose logs -f        # 实时查看日志
docker-compose up -d --build  # 更新并重启
```

---

## 🌐 绑定域名 + HTTPS

> 强烈推荐绑定域名 + 开启 HTTPS，更安全更专业

### Step 1：添加站点

1. 宝塔面板 → 左侧 **「网站」** → **「添加站点」**
2. 填写配置：

| 配置项 | 填写内容 |
|--------|---------|
| 域名 | 你的域名（如 `stock.example.com`） |
| 根目录 | 默认即可 |
| PHP版本 | **纯静态** |
| 数据库 | 不创建 |

3. 点击 **「提交」**

### Step 2：配置反向代理

1. 在网站列表中，点击你刚添加的 **站点名称**
2. 左侧菜单点击 **「反向代理」**
3. 点击 **「添加反向代理」**
4. 填写配置：

| 配置项 | 填写内容 |
|--------|---------|
| 代理名称 | `stock-t` （随便起） |
| 目标URL | `http://127.0.0.1:3000` |
| 发送域名 | `$host` |

5. 点击 **「提交」**

### Step 3：申请 SSL 证书

1. 点击站点名 → 左侧 **「SSL」**
2. 选择 **「Let's Encrypt」** 标签
3. 勾选你的域名
4. 点击 **「申请」**
5. 申请成功后，开启 **「强制HTTPS」**

### Step 4：访问

打开浏览器访问：`https://你的域名`

输入默认密码 `888888`，登录后在右上角 **「密码管理」** 中修改。

🎉 恭喜！部署完成！

---

## 📡 不绑域名：直接 IP 访问

如果暂时没有域名，也可以直接用 IP + 端口访问。

### 放行端口

1. 宝塔面板 → 左侧 **「安全」**
2. 在 **「防火墙」** 区域，添加放行规则：
   - 端口：`3000`
   - 备注：`做T助手`
3. 点击 **「放行」**

> ⚠️ 还需在云服务商控制台的安全组中放行 3000 端口（阿里云/腾讯云/华为云等都需要）

### 访问

浏览器打开：`http://你的服务器IP:3000`

---

## 🔧 常用管理命令

在宝塔 **「终端」** 中执行：

```bash
# 查看服务状态
pm2 status

# 查看实时日志
pm2 logs stock-t-assistant

# 只看错误日志
pm2 logs stock-t-assistant --err

# 重启服务
pm2 restart stock-t-assistant

# 停止服务
pm2 stop stock-t-assistant

# 启动服务
pm2 start stock-t-assistant

# 删除服务（不删数据）
pm2 delete stock-t-assistant
```

### 通过宝塔 PM2 管理器操作

1. 宝塔面板 → **软件商店** → 找到 **「PM2管理器」** → **「设置」**
2. 可以直接在界面上启动/停止/重启服务
3. 也可以查看日志

---

## 🔄 更新部署

### 方案一用户（打包上传）

1. 在本地开发机重新打包：
   ```bash
   bash pack.sh
   ```

2. 宝塔面板 → **文件** → 上传新的 `stock-t-assistant.tar.gz` 到 `/www/wwwroot/`

3. 解压覆盖（注意**不要删除** `/www/wwwroot/stock-t-assistant/db/` 目录，那是数据库！）

4. 终端执行：
   ```bash
   cd /www/wwwroot/stock-t-assistant
   bash bt-install.sh
   ```

### 方案二用户（Git 克隆）

```bash
cd /www/wwwroot/stock-t-assistant
git pull
bash bt-install.sh
```

### Docker 用户

```bash
cd /www/wwwroot/stock-t-assistant
docker-compose up -d --build
```

---

## 💾 数据库备份

### 手动备份

```bash
cp /www/wwwroot/stock-t-assistant/db/custom.db /www/backup/custom_$(date +%Y%m%d).db
```

### 自动备份（推荐）

1. 宝塔面板 → 左侧 **「计划任务」**
2. 点击 **「添加任务」**
3. 配置：

| 配置项 | 填写内容 |
|--------|---------|
| 任务类型 | Shell 脚本 |
| 任务名称 | 备份做T助手数据库 |
| 执行周期 | 每天 |
| 执行时间 | 03:00 |
| 脚本内容 | 见下方 |

脚本内容：
```bash
#!/bin/bash
BACKUP_DIR="/www/backup/stock-t"
mkdir -p $BACKUP_DIR
cp /www/wwwroot/stock-t-assistant/db/custom.db $BACKUP_DIR/custom_$(date +\%Y\%m\%d_\%H\%M).db
# 只保留最近 30 天的备份
find $BACKUP_DIR -name "custom_*.db" -mtime +30 -delete
echo "备份完成: custom_$(date +\%Y\%m\%d_\%H\%M).db"
```

4. 点击 **「添加」**

### 恢复数据库

```bash
# 先停止服务
pm2 stop stock-t-assistant

# 替换数据库文件
cp /www/backup/stock-t/custom_20250101.db /www/wwwroot/stock-t-assistant/db/custom.db

# 重启服务
pm2 start stock-t-assistant
```

---

## 🔐 密码管理

### 默认密码

首次部署的默认密码为 **`888888`**

### 修改密码

1. 用默认密码登录系统
2. 点击右上角 **「🛡️ 密码管理」** 按钮
3. 输入当前密码 → 新密码 → 确认新密码
4. 点击确认，密码修改成功

### 忘记密码怎么办？

在宝塔终端执行：

```bash
cd /www/wwwroot/stock-t-assistant

# 重置密码为 888888
# 方法1：修改 .env 文件
sed -i 's/APP_PASSWORD=.*/APP_PASSWORD=888888/' .env

# 方法2：删除数据库中的密码记录（回退到 .env 或默认值）
npx prisma db execute --stdin << 'SQL'
DELETE FROM AppConfig WHERE key = 'app_password';
SQL

# 重启服务
pm2 restart stock-t-assistant
```

然后用 `888888` 登录，再去界面修改为新密码。

---

## ❓ 常见问题排查

### Q1：构建时报内存不足 (JavaScript heap out of memory)

**原因**：服务器内存太小（1GB 以下）

**解决方案**：

```bash
# 添加 2GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 重新构建
cd /www/wwwroot/stock-t-assistant
bash bt-install.sh
```

### Q2：端口 3000 被占用

**查看占用进程**：
```bash
lsof -i :3000
```

**解决方案1：结束占用进程**
```bash
kill -9 $(lsof -t -i :3000)
```

**解决方案2：更换端口**

编辑 `/www/wwwroot/stock-t-assistant/ecosystem.config.js`：
```javascript
args: 'start -p 3001',  // 改为其他端口
env: {
  PORT: 3001,           // 同步修改
}
```

然后重启：
```bash
pm2 restart stock-t-assistant
```

> ⚠️ 如果使用了反向代理，记得同步修改目标 URL 的端口

### Q3：Nginx 502 Bad Gateway

**原因**：Node.js 服务未运行或崩溃

**排查步骤**：
```bash
# 1. 检查服务是否在运行
pm2 status

# 2. 查看错误日志
pm2 logs stock-t-assistant --err --lines 50

# 3. 如果服务已停止，尝试重启
pm2 restart stock-t-assistant

# 4. 等待 5 秒后再次检查
sleep 5 && pm2 status
```

### Q4：页面加载很慢

**可能原因和解决方案**：

1. **首次访问冷启动**：正常现象，等 10-20 秒
2. **服务器配置低**：建议 2 核 2GB 以上
3. **网络带宽低**：建议 1Mbps 以上

### Q5：宝塔终端找不到 node/npm/pm2 命令

**原因**：宝塔安装的 Node.js 路径不在系统 PATH 中

**解决方案**：

```bash
# 加载宝塔的 Node.js 环境变量
source /www/server/nvm/nvm.sh 2>/dev/null

# 或者使用完整路径
/www/server/nodejs/v20*/bin/node -v
/www/server/nodejs/v20*/bin/npm -v
/www/server/nodejs/v20*/bin/pm2 status
```

**永久解决**：在宝塔终端的 `~/.bashrc` 末尾添加：
```bash
export PATH="/www/server/nodejs/v20*/bin:$PATH"
```

### Q6：更新后页面没变化（浏览器缓存）

**清除方法**：
- Chrome：`Ctrl + Shift + R`（强制刷新）
- 或打开开发者工具 → Network → 勾选「Disable cache」

### Q7：SSL 证书申请失败

**常见原因**：
1. 域名未解析到服务器 IP → 去 DNS 服务商添加 A 记录
2. 80 端口未放行 → 宝塔安全 + 云服务商安全组都放行 80 端口
3. 域名刚解析，未生效 → 等待 10 分钟后重试

### Q8：云服务商安全组如何配置？

无论用哪家云服务商，需要在安全组中放行以下端口：

| 端口 | 用途 | 是否必须 |
|------|------|---------|
| 80 | HTTP | 绑域名时需要 |
| 443 | HTTPS | 绑域名+SSL时需要 |
| 3000 | 直接IP访问 | 不绑域名时需要 |

---

## 📊 系统架构参考

```
用户浏览器
    ↓
[HTTPS] / [HTTP:3000]
    ↓
宝塔 Nginx（反向代理） → Node.js 服务 (PM2管理)
                            ↓
                       Next.js 应用
                            ↓
                      SQLite 数据库
                   (/www/wwwroot/stock-t-assistant/db/custom.db)
```

---

## 📞 获取帮助

- 查看日志：`pm2 logs stock-t-assistant`
- 检查服务状态：`pm2 status`
- 检查端口：`lsof -i :3000`
- 检查磁盘：`df -h`
- 检查内存：`free -m`

---

> 🎉 部署愉快！如有问题，先看「常见问题排查」，90% 的问题都能在那里找到答案。
