'use client'

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import {
  Server,
  Shield,
  Globe,
  Terminal,
  Copy,
  Check,
  ChevronRight,
  Package,
  Database,
  Zap,
  ExternalLink,
  Monitor,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Copy-to-clipboard code block                                      */
/* ------------------------------------------------------------------ */
interface CodeBlockProps {
  code: string
  lang?: string
}

const CodeBlock = React.memo(function CodeBlock({ code, lang }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback – should not happen in modern browsers
    }
  }, [code])

  return (
    <div className="group relative my-2 rounded-lg border border-border/60 bg-zinc-950 dark:bg-zinc-900 overflow-hidden">
      {/* top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 dark:bg-zinc-800 border-b border-border/40">
        <span className="text-[11px] font-mono text-zinc-500 select-none">
          {lang ?? 'bash'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-zinc-400 hover:text-white"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 text-[11px]">
            {copied ? '已复制' : '复制'}
          </span>
        </Button>
      </div>
      {/* code body */}
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed text-green-400 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  )
})

/* ------------------------------------------------------------------ */
/*  Step card                                                         */
/* ------------------------------------------------------------------ */
interface StepCardProps {
  step: number
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'info'
}

const stepVariantMap: Record<string, string> = {
  default: 'border-border/60',
  success: 'border-green-500/40 bg-green-500/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  info: 'border-blue-500/40 bg-blue-500/5',
}

const badgeVariantMap: Record<string, string> = {
  default: 'bg-zinc-700 text-zinc-100',
  success: 'bg-green-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-blue-600 text-white',
}

const StepCard = React.memo(function StepCard({
  step,
  title,
  icon,
  children,
  variant = 'default',
}: StepCardProps) {
  return (
    <Card className={`border ${stepVariantMap[variant]} transition-colors`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${badgeVariantMap[variant]}`}
          >
            {step}
          </span>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            {icon}
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  )
})

/* ------------------------------------------------------------------ */
/*  Info / Warning callout                                            */
/* ------------------------------------------------------------------ */
interface CalloutProps {
  type: 'info' | 'warning' | 'success'
  children: React.ReactNode
}

const calloutStyles: Record<string, string> = {
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  success: 'border-green-500/40 bg-green-500/10 text-green-300',
}

const calloutIcons: Record<string, React.ReactNode> = {
  info: <Shield className="h-4 w-4 shrink-0" />,
  warning: <Zap className="h-4 w-4 shrink-0" />,
  success: <Check className="h-4 w-4 shrink-0" />,
}

const Callout = React.memo(function Callout({ type, children }: CalloutProps) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${calloutStyles[type]}`}
    >
      {calloutIcons[type]}
      <div>{children}</div>
    </div>
  )
})

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */
const BaotaDeployGuide = React.memo(function BaotaDeployGuide() {
  return (
    <div className="mx-auto max-w-4xl max-h-[85vh] overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin">
      {/* ---- Header ---- */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Server className="h-8 w-8 text-primary" />
          宝塔面板部署指南
        </div>
        <p className="text-muted-foreground text-sm">
          将「做T助手」一键部署到你的宝塔面板服务器
        </p>
      </div>

      {/* ---- Tabs ---- */}
      <Tabs defaultValue="pack" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pack" className="gap-1.5">
            <Package className="h-4 w-4" />
            打包上传
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 bg-green-600 text-white">
              推荐
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="git" className="gap-1.5">
            <Terminal className="h-4 w-4" />
            Git克隆
          </TabsTrigger>
          <TabsTrigger value="docker" className="gap-1.5">
            <Monitor className="h-4 w-4" />
            Docker部署
          </TabsTrigger>
        </TabsList>

        {/* ============ Tab 1: 打包上传 ============ */}
        <TabsContent value="pack" className="mt-6 space-y-4">
          <StepCard step={1} title="宝塔安装 PM2 管理器" icon={<Package className="h-5 w-5 text-blue-400" />} variant="info">
            <p>在宝塔面板左侧菜单操作：</p>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>点击「软件商店」</li>
              <li>搜索 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">PM2管理器</code></li>
              <li>点击「安装」，等待安装完成</li>
            </ol>
            <Callout type="info">
              PM2 管理器会自动安装 Node.js 运行环境，无需额外配置。
            </Callout>
          </StepCard>

          <StepCard step={2} title="打包项目" icon={<Package className="h-5 w-5 text-amber-400" />}>
            <p>在本地项目根目录执行：</p>
            <CodeBlock code="bash pack.sh" />
            <p className="mt-2">
              打包完成后会在项目根目录生成{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                stock-t-assistant.tar.gz
              </code>{' '}
              文件。
            </p>
          </StepCard>

          <StepCard step={3} title="上传到宝塔" icon={<Globe className="h-5 w-5 text-blue-400" />}>
            <ol className="ml-4 list-decimal space-y-2">
              <li>
                宝塔面板 → <strong>文件</strong> → 进入{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  /www/wwwroot/
                </code>{' '}
                目录
              </li>
              <li>点击「上传」，选择 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">stock-t-assistant.tar.gz</code></li>
              <li>上传完成后，右键该文件 → 「解压」</li>
            </ol>
            <Callout type="success">
              解压后会得到 <code className="font-mono text-xs">/www/wwwroot/stock-t-assistant/</code> 目录。
            </Callout>
          </StepCard>

          <StepCard step={4} title="一键安装" icon={<Zap className="h-5 w-5 text-green-400" />} variant="success">
            <p>在宝塔终端中执行：</p>
            <CodeBlock
              code={`cd /www/wwwroot/stock-t-assistant && bash bt-install.sh`}
            />
            <p className="mt-3 font-medium text-foreground">自定义密码安装：</p>
            <CodeBlock
              code={`cd /www/wwwroot/stock-t-assistant && bash bt-install.sh 你的密码`}
            />
            <Callout type="warning">
              如不指定密码，默认密码为 <code className="font-mono text-xs">888888</code>，建议设置强密码。
            </Callout>
          </StepCard>

          <StepCard step={5} title="配置访问" icon={<Globe className="h-5 w-5 text-blue-400" />} variant="info">
            <p className="font-medium text-foreground">方式一：绑定域名（推荐）</p>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>宝塔面板 → <strong>网站</strong> → 「添加站点」</li>
              <li>填写域名 → 提交</li>
              <li>站点设置 → <strong>反向代理</strong> → 添加反向代理</li>
              <li>目标URL填写：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">http://127.0.0.1:3000</code></li>
            </ol>

            <div className="my-4 border-t border-border/40" />

            <p className="font-medium text-foreground">方式二：直接IP访问</p>
            <p className="mt-1">
              访问地址：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">http://你的服务器IP:3000</code>
            </p>
            <Callout type="warning">
              需要在宝塔面板 → 安全 → 防火墙中放行 <strong>3000</strong> 端口。
            </Callout>
          </StepCard>
        </TabsContent>

        {/* ============ Tab 2: Git克隆 ============ */}
        <TabsContent value="git" className="mt-6 space-y-4">
          <StepCard step={1} title="安装 PM2 管理器和 Git" icon={<Package className="h-5 w-5 text-blue-400" />} variant="info">
            <ol className="ml-4 list-decimal space-y-1">
              <li>软件商店 → 搜索「PM2管理器」→ 安装</li>
              <li>软件商店 → 搜索「Git」→ 安装</li>
            </ol>
          </StepCard>

          <StepCard step={2} title="克隆项目" icon={<Terminal className="h-5 w-5 text-amber-400" />}>
            <CodeBlock
              code={`cd /www/wwwroot && git clone 你的仓库地址.git stock-t-assistant`}
            />
            <Callout type="info">
              请将「你的仓库地址」替换为实际的 Git 仓库 URL。
            </Callout>
          </StepCard>

          <StepCard step={3} title="一键安装" icon={<Zap className="h-5 w-5 text-green-400" />} variant="success">
            <CodeBlock
              code={`cd /www/wwwroot/stock-t-assistant && bash bt-install.sh`}
            />
            <p className="mt-2">
              自定义密码：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">bash bt-install.sh 你的密码</code>
            </p>
          </StepCard>

          <StepCard step={4} title="配置访问" icon={<Globe className="h-5 w-5 text-blue-400" />}>
            <p>参考「打包上传」中第 5 步的域名 / IP 配置方式。</p>
          </StepCard>
        </TabsContent>

        {/* ============ Tab 3: Docker ============ */}
        <TabsContent value="docker" className="mt-6 space-y-4">
          <StepCard step={1} title="安装 Docker 管理器" icon={<Monitor className="h-5 w-5 text-blue-400" />} variant="info">
            <p>软件商店 → 搜索「Docker管理器」→ 安装</p>
            <Callout type="info">
              Docker 管理器会自动安装 Docker Engine 和 Docker Compose。
            </Callout>
          </StepCard>

          <StepCard step={2} title="上传项目" icon={<Package className="h-5 w-5 text-amber-400" />}>
            <p>
              将项目文件上传到{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                /www/wwwroot/stock-t-assistant/
              </code>{' '}
              目录（可通过打包上传或 Git 克隆）。
            </p>
          </StepCard>

          <StepCard step={3} title="启动服务" icon={<Zap className="h-5 w-5 text-green-400" />} variant="success">
            <CodeBlock
              code={`cd /www/wwwroot/stock-t-assistant && docker-compose up -d`}
            />
            <Callout type="success">
              Docker 模式会自动构建镜像并启动容器，无需手动安装 Node.js。
            </Callout>
          </StepCard>

          <StepCard step={4} title="配置访问" icon={<Globe className="h-5 w-5 text-blue-400" />}>
            <p>参考「打包上传」中第 5 步的域名 / IP 配置方式。</p>
            <Callout type="warning">
              Docker 模式下端口映射在 <code className="font-mono text-xs">docker-compose.yml</code> 中配置，默认为 3000。
            </Callout>
          </StepCard>
        </TabsContent>
      </Tabs>

      {/* ---- Divider ---- */}
      <div className="border-t border-border/40" />

      {/* ---- Advanced accordion ---- */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-5 w-5 text-primary" />
          进阶配置
        </h3>

        <Accordion type="multiple" className="w-full">
          {/* 域名 + HTTPS */}
          <AccordionItem value="https">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" />
                域名 + HTTPS 配置
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <ol className="ml-4 list-decimal space-y-2">
                <li>
                  宝塔面板 → 网站 → 添加站点 → 填写域名
                </li>
                <li>
                  站点设置 → 反向代理 → 目标URL:{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                    http://127.0.0.1:3000
                  </code>
                </li>
                <li>
                  站点设置 → SSL → Let&apos;s Encrypt → 申请免费证书
                </li>
                <li>
                  开启「强制HTTPS」
                </li>
              </ol>
              <Callout type="success">
                配置完成后即可通过 <code className="font-mono text-xs">https://你的域名</code> 安全访问。
              </Callout>
            </AccordionContent>
          </AccordionItem>

          {/* 常用管理命令 */}
          <AccordionItem value="commands">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-green-400" />
                常用管理命令
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-4">
              <div>
                <p className="font-medium text-foreground mb-2">PM2 模式</p>
                <CodeBlock code="pm2 status" lang="bash" />
                <CodeBlock code="pm2 logs stock-t-assistant" lang="bash" />
                <CodeBlock code="pm2 restart stock-t-assistant" lang="bash" />
                <CodeBlock code="pm2 stop stock-t-assistant" lang="bash" />
              </div>
              <div>
                <p className="font-medium text-foreground mb-2">Docker 模式</p>
                <CodeBlock code="docker-compose logs -f" lang="bash" />
                <CodeBlock code="docker-compose restart" lang="bash" />
                <CodeBlock code="docker-compose down" lang="bash" />
                <CodeBlock code="docker-compose up -d --build" lang="bash" />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 数据库备份 */}
          <AccordionItem value="backup">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4 text-amber-400" />
                数据库备份
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>项目使用 SQLite 数据库，数据库文件位于：</p>
              <CodeBlock code="/www/wwwroot/stock-t-assistant/db/custom.db" />
              <p className="mt-2">手动备份命令：</p>
              <CodeBlock code={`cp /www/wwwroot/stock-t-assistant/db/custom.db /www/backup/custom_$(date +%Y%m%d_%H%M%S).db`} />
              <Callout type="info">
                建议在宝塔面板 → 计划任务 中设置定时备份，每天自动备份数据库文件。
              </Callout>
            </AccordionContent>
          </AccordionItem>

          {/* 密码管理 */}
          <AccordionItem value="password">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-400" />
                密码管理
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>
                默认密码：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">888888</code>
              </p>
              <p className="mt-2 font-medium text-foreground">重置密码：</p>
              <CodeBlock code={`cd /www/wwwroot/stock-t-assistant && node -e "const crypto=require('crypto');const p='你的新密码';console.log('New hash:',crypto.createHash('sha256').update(p).digest('hex'))"`} />
              <p className="mt-2">或重新运行安装脚本：</p>
              <CodeBlock code="bash bt-install.sh 新密码" />
              <Callout type="warning">
                修改密码后需重启服务：<code className="font-mono text-xs">pm2 restart stock-t-assistant</code>
              </Callout>
            </AccordionContent>
          </AccordionItem>

          {/* 常见问题 */}
          <AccordionItem value="faq">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-purple-400" />
                常见问题
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-4">
              {/* 内存不足 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  内存不足（OOM）
                </p>
                <p className="mt-1">添加 Swap 分区：</p>
                <CodeBlock
                  code={`# 创建 2GB swap 文件\nsudo fallocate -l 2G /swapfile\nsudo chmod 600 /swapfile\nsudo mkswap /swapfile\nsudo swapon /swapfile\n# 持久化\necho '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab`}
                />
              </div>

              {/* 端口占用 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  端口被占用
                </p>
                <p className="mt-1">查看端口占用：</p>
                <CodeBlock code="lsof -i :3000" />
                <p className="mt-1">释放端口：</p>
                <CodeBlock code="kill -9 $(lsof -t -i:3000)" />
              </div>

              {/* 502 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  反向代理 502 错误
                </p>
                <p className="mt-1">检查服务是否运行：</p>
                <CodeBlock code="pm2 status" />
                <p className="mt-1">若服务未运行则重启：</p>
                <CodeBlock code="pm2 restart stock-t-assistant" />
              </div>

              {/* node 命令找不到 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  node 命令找不到
                </p>
                <p className="mt-1">宝塔的 Node.js 通过 NVM 安装，需先加载环境：</p>
                <CodeBlock code="source /www/server/nvm/nvm.sh" />
                <Callout type="info">
                  建议将此命令添加到 <code className="font-mono text-xs">~/.bashrc</code> 中，每次登录自动加载。
                </Callout>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* ---- Footer note ---- */}
      <div className="rounded-lg border border-border/40 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
        做T助手 · 宝塔部署指南 · 如有问题请参考项目 README 或提交 Issue
      </div>
    </div>
  )
})

export default BaotaDeployGuide
