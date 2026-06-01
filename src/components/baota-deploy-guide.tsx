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
  RefreshCw,
  Clock,
  AlertTriangle,
  FileText,
  Lock,
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
/*  Info / Warning / Success callout                                  */
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

/* ------------------------------------------------------------------ */
/*  Config table row helper                                           */
/* ------------------------------------------------------------------ */
function ConfigTable({ rows }: { rows: { label: string; value: string; note?: string }[] }) {
  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-border/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 bg-muted/30">
            <th className="px-3 py-2 text-left font-medium text-foreground">配置项</th>
            <th className="px-3 py-2 text-left font-medium text-foreground">填写内容</th>
            <th className="px-3 py-2 text-left font-medium text-foreground">说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i < rows.length - 1 ? 'border-b border-border/20' : ''}>
              <td className="px-3 py-2 text-foreground font-medium">{row.label}</td>
              <td className="px-3 py-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{row.value}</code>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */
const BaotaDeployGuide = React.memo(function BaotaDeployGuide() {
  /* Shared Step 4 (一键安装) content, reused across tabs */
  const installStepContent = (
    <>
      <p>点击宝塔左侧「<strong>终端</strong>」，执行以下命令：</p>
      <CodeBlock code={`cd /www/wwwroot/stock-t-assistant && bash bt-install.sh`} />
      <p className="mt-3 font-medium text-foreground">安装脚本会依次执行以下操作：</p>
      <ol className="mt-2 ml-4 list-decimal space-y-1">
        <li>检查并加载 Node.js 运行环境</li>
        <li>安装 PM2 进程管理器（如未安装）</li>
        <li>创建 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">.env</code> 配置文件</li>
        <li>安装项目依赖（<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">npm install</code>）</li>
        <li>初始化数据库（<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">prisma db push</code>）</li>
        <li>构建项目（<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">next build</code>）</li>
        <li>启动服务并配置 PM2 开机自启</li>
      </ol>
      <Callout type="info">
        构建过程约 2-5 分钟，期间会看到进度输出，请耐心等待，不要关闭终端。
      </Callout>
      <p className="mt-3 font-medium text-foreground">安装成功后会显示：</p>
      <CodeBlock code={`✅ 做T助手 安装成功！\n🔐 默认密码: 888888`} lang="text" />

      <div className="my-3 border-t border-border/40" />

      <p className="font-medium text-foreground">自定义密码安装：</p>
      <CodeBlock code={`cd /www/wwwroot/stock-t-assistant && bash bt-install.sh 你的密码`} />
      <Callout type="warning">
        如不指定密码，默认密码为 <code className="font-mono text-xs">888888</code>，建议设置强密码。
      </Callout>

      <div className="my-3 border-t border-border/40" />

      <p className="font-medium text-foreground">安装失败？常见原因：</p>
      <ul className="mt-2 ml-4 list-disc space-y-2">
        <li>
          <strong className="text-foreground">node 命令找不到</strong> → 先执行{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">source /www/server/nvm/nvm.sh</code>
          ，再重新运行安装脚本
        </li>
        <li>
          <strong className="text-foreground">内存不足（OOM）</strong> → 添加 Swap 分区：
          <CodeBlock
            code={`sudo fallocate -l 2G /swapfile\nsudo chmod 600 /swapfile\nsudo mkswap /swapfile\nsudo swapon /swapfile`}
          />
        </li>
        <li>
          <strong className="text-foreground">网络超时</strong> → 重新执行安装脚本即可，已下载的依赖会缓存
        </li>
      </ul>
    </>
  )

  /* Shared Step 5 (配置访问) content, reused across tabs */
  const accessStepContent = (
    <>
      <p className="font-medium text-foreground">方式一：绑定域名（推荐）</p>
      <ol className="mt-2 ml-4 list-decimal space-y-2">
        <li>
          宝塔面板 → <strong>网站</strong> → 「添加站点」
          <ConfigTable rows={[
            { label: '域名', value: '你的域名', note: '如 stock.example.com' },
            { label: 'PHP版本', value: '纯静态', note: '不选任何PHP版本' },
            { label: '数据库', value: '不创建', note: '项目自带SQLite' },
          ]} />
        </li>
        <li>
          站点设置 → <strong>反向代理</strong> → 「添加反向代理」
          <ConfigTable rows={[
            { label: '代理名称', value: 'stock-t', note: '随便起，用于标识' },
            { label: '目标URL', value: 'http://127.0.0.1:3000', note: '本地服务地址' },
            { label: '发送域名', value: '$host', note: '传递原始域名' },
          ]} />
        </li>
        <li>
          站点设置 → <strong>SSL</strong> → 「Let&apos;s Encrypt」
          <ul className="mt-1 ml-4 list-disc space-y-1 text-muted-foreground">
            <li>勾选你的域名</li>
            <li>点击「申请」</li>
            <li>申请成功后，开启「强制HTTPS」</li>
          </ul>
        </li>
        <li>访问 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">https://你的域名</code></li>
      </ol>

      <div className="my-4 border-t border-border/40" />

      <p className="font-medium text-foreground">方式二：直接IP访问</p>
      <p className="mt-2">访问地址：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">http://你的服务器IP:3000</code></p>
      <ol className="mt-2 ml-4 list-decimal space-y-2">
        <li>
          宝塔面板 → 安全 → 防火墙 → 放行 <strong>3000</strong> 端口（备注：做T助手）
        </li>
      </ol>
      <Callout type="warning">
        <strong>重要：</strong>除了宝塔防火墙，还需要在<strong>云服务商安全组</strong>中放行 3000 端口（阿里云 / 腾讯云 / 华为云等均需配置）。
      </Callout>
    </>
  )

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
            <p>登录宝塔面板后，在左侧菜单操作：</p>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>点击左侧「<strong>软件商店</strong>」</li>
              <li>在搜索框中搜索 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">PM2管理器</code></li>
              <li>点击「安装」，等待安装完成（约 1-3 分钟）</li>
            </ol>
            <Callout type="info">
              PM2 管理器会自动安装 Node.js 18+ 运行环境，<strong>无需单独安装 Node.js</strong>。
            </Callout>
            <p className="mt-2">如果软件商店搜不到 PM2 管理器，可以在终端手动安装：</p>
            <CodeBlock code="npm install -g pm2" />
          </StepCard>

          <StepCard step={2} title="打包项目" icon={<Package className="h-5 w-5 text-amber-400" />}>
            <Callout type="info">
              此步骤在<strong>本机（开发机）</strong>上操作，不是在服务器上。
            </Callout>
            <p className="mt-2">确保本机已安装 Node.js 18+ 和 bun 环境，然后在项目根目录执行：</p>
            <CodeBlock code="bash pack.sh" />
            <p className="mt-2">
              打包完成后会在项目根目录生成{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                stock-t-assistant.tar.gz
              </code>{' '}
              文件（约 5-15MB）。
            </p>
            <p className="mt-2">如果没有 bun 环境，可以先安装：</p>
            <CodeBlock code="npm install -g bun" />
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
              <li>等待上传完成（约 1-3 分钟，取决于网络速度）</li>
              <li>上传完成后，右键该文件 → 「解压」</li>
            </ol>
            <Callout type="success">
              解压后会得到 <code className="font-mono text-xs">/www/wwwroot/stock-t-assistant/</code> 目录。
            </Callout>
            <Callout type="warning">
              如果宝塔上传超时，可以使用 SFTP 工具（如 FileZilla）上传文件。
            </Callout>
          </StepCard>

          <StepCard step={4} title="一键安装" icon={<Zap className="h-5 w-5 text-green-400" />} variant="success">
            {installStepContent}
          </StepCard>

          <StepCard step={5} title="配置访问" icon={<Globe className="h-5 w-5 text-blue-400" />} variant="info">
            {accessStepContent}
          </StepCard>
        </TabsContent>

        {/* ============ Tab 2: Git克隆 ============ */}
        <TabsContent value="git" className="mt-6 space-y-4">
          <StepCard step={1} title="安装 PM2 管理器和 Git" icon={<Package className="h-5 w-5 text-blue-400" />} variant="info">
            <ol className="ml-4 list-decimal space-y-2">
              <li>
                宝塔面板 → <strong>软件商店</strong> → 搜索 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">PM2管理器</code> → 点击「安装」
                <p className="mt-1 text-muted-foreground">PM2 管理器会自动安装 Node.js 18+ 运行环境，无需单独安装。</p>
              </li>
              <li>
                软件商店 → 搜索 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">Git</code> → 点击「安装」（如已安装可跳过）
              </li>
            </ol>
          </StepCard>

          <StepCard step={2} title="克隆项目" icon={<Terminal className="h-5 w-5 text-amber-400" />}>
            <p>打开宝塔左侧「<strong>终端</strong>」，执行以下命令：</p>
            <CodeBlock
              code={`cd /www/wwwroot && git clone https://你的仓库地址.git stock-t-assistant`}
            />
            <Callout type="info">
              请将 <code className="font-mono text-xs">https://你的仓库地址.git</code> 替换为实际的 Git 仓库 URL。
            </Callout>
          </StepCard>

          <StepCard step={3} title="一键安装" icon={<Zap className="h-5 w-5 text-green-400" />} variant="success">
            {installStepContent}
          </StepCard>

          <StepCard step={4} title="配置访问" icon={<Globe className="h-5 w-5 text-blue-400" />} variant="info">
            {accessStepContent}
          </StepCard>
        </TabsContent>

        {/* ============ Tab 3: Docker ============ */}
        <TabsContent value="docker" className="mt-6 space-y-4">
          <StepCard step={1} title="安装 Docker 管理器" icon={<Monitor className="h-5 w-5 text-blue-400" />} variant="info">
            <ol className="ml-4 list-decimal space-y-2">
              <li>
                宝塔面板 → <strong>软件商店</strong> → 搜索 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">Docker管理器</code> → 点击「安装」
              </li>
              <li>等待安装完成（约 3-5 分钟），安装过程会自动配置 Docker Engine 和 Docker Compose</li>
            </ol>
            <Callout type="info">
              Docker 管理器会自动安装 Docker Engine 和 Docker Compose，无需手动安装。
            </Callout>
          </StepCard>

          <StepCard step={2} title="上传项目" icon={<Package className="h-5 w-5 text-amber-400" />}>
            <p>
              将项目文件上传到{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                /www/wwwroot/stock-t-assistant/
              </code>{' '}
              目录（可通过打包上传或 Git 克隆，参考上方 Tab 的说明）。
            </p>
          </StepCard>

          <StepCard step={3} title="配置并启动服务" icon={<Zap className="h-5 w-5 text-green-400" />} variant="success">
            <p className="font-medium text-foreground">修改密码（可选）：</p>
            <p className="mt-1">
              编辑项目目录下的 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">docker-compose.yml</code> 文件，
              找到 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">APP_PASSWORD</code> 配置项修改密码：
            </p>
            <CodeBlock
              code={`# docker-compose.yml 中的环境变量配置\nenvironment:\n  - APP_PASSWORD=888888   # 修改为你的密码`}
              lang="yaml"
            />
            <p className="mt-3 font-medium text-foreground">启动服务：</p>
            <CodeBlock code={`cd /www/wwwroot/stock-t-assistant && docker-compose up -d`} />
            <Callout type="success">
              Docker 模式会自动构建镜像并启动容器，无需手动安装 Node.js。
            </Callout>
            <p className="mt-3 font-medium text-foreground">查看运行状态和日志：</p>
            <CodeBlock code={`# 查看容器状态\ndocker-compose ps\n\n# 查看实时日志\ndocker-compose logs -f\n\n# 查看最近50行日志\ndocker-compose logs --tail 50`} />
          </StepCard>

          <StepCard step={4} title="配置访问" icon={<Globe className="h-5 w-5 text-blue-400" />} variant="info">
            {accessStepContent}
            <Callout type="warning">
              Docker 模式下端口映射在 <code className="font-mono text-xs">docker-compose.yml</code> 中配置，默认为 3000。如需修改端口，编辑该文件中的 <code className="font-mono text-xs">ports</code> 配置。
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
            <AccordionContent className="text-sm text-muted-foreground space-y-3">
              <ol className="ml-4 list-decimal space-y-3">
                <li>
                  宝塔面板 → 网站 → 添加站点
                  <ConfigTable rows={[
                    { label: '域名', value: '你的域名', note: '如 stock.example.com' },
                    { label: 'PHP版本', value: '纯静态', note: '不选任何PHP版本' },
                    { label: '数据库', value: '不创建', note: '项目自带SQLite' },
                  ]} />
                </li>
                <li>
                  站点设置 → 反向代理 → 添加反向代理
                  <ConfigTable rows={[
                    { label: '代理名称', value: 'stock-t', note: '随便起，用于标识' },
                    { label: '目标URL', value: 'http://127.0.0.1:3000', note: '本地服务地址' },
                    { label: '发送域名', value: '$host', note: '传递原始域名' },
                  ]} />
                </li>
                <li>
                  站点设置 → SSL → Let&apos;s Encrypt → 勾选域名 → 点击「申请」
                </li>
                <li>
                  申请成功后，开启「强制HTTPS」
                </li>
                <li>
                  访问 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">https://你的域名</code>
                </li>
              </ol>
              <Callout type="success">
                配置完成后即可通过 <code className="font-mono text-xs">https://你的域名</code> 安全访问。
              </Callout>
              <div className="mt-2">
                <p className="font-medium text-foreground">SSL 证书申请失败？</p>
                <ul className="mt-1 ml-4 list-disc space-y-1">
                  <li><strong className="text-foreground">域名未解析到服务器 IP</strong> → 去 DNS 服务商添加 A 记录指向服务器 IP</li>
                  <li><strong className="text-foreground">80 端口未放行</strong> → 宝塔安全 + 云服务商安全组均需放行 80 端口</li>
                  <li><strong className="text-foreground">域名刚解析未生效</strong> → 等待 10 分钟后重试</li>
                </ul>
              </div>
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
                <CodeBlock code="# 查看服务状态\npm2 status" />
                <CodeBlock code="# 查看实时日志\npm2 logs stock-t-assistant" />
                <CodeBlock code="# 只看错误日志\npm2 logs stock-t-assistant --err" />
                <CodeBlock code="# 重启服务\npm2 restart stock-t-assistant" />
                <CodeBlock code="# 停止服务\npm2 stop stock-t-assistant" />
                <CodeBlock code="# 启动服务\npm2 start stock-t-assistant" />
                <CodeBlock code="# 实时监控（CPU/内存）\npm2 monit" />
                <CodeBlock code="# 查看详细信息\npm2 describe stock-t-assistant" />
              </div>
              <div>
                <p className="font-medium text-foreground mb-2">Docker 模式</p>
                <CodeBlock code="# 启动容器\ndocker-compose up -d" />
                <CodeBlock code="# 停止容器\ndocker-compose down" />
                <CodeBlock code="# 重启容器\ndocker-compose restart" />
                <CodeBlock code="# 实时查看日志\ndocker-compose logs -f" />
                <CodeBlock code="# 查看容器状态\ndocker-compose ps" />
                <CodeBlock code="# 更新并重启\ndocker-compose up -d --build" />
                <CodeBlock code="# 进入容器内部\ndocker-compose exec stock-t-assistant sh" />
              </div>
              <div>
                <p className="font-medium text-foreground mb-2">通过宝塔 PM2 管理器操作</p>
                <ol className="ml-4 list-decimal space-y-1">
                  <li>宝塔面板 → 软件商店 → 找到「PM2管理器」→「设置」</li>
                  <li>可以直接在界面上启动 / 停止 / 重启服务</li>
                  <li>也可以查看日志</li>
                </ol>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 更新部署 */}
          <AccordionItem value="update">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-cyan-400" />
                更新部署
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-3">
              <div>
                <p className="font-medium text-foreground">打包上传用户</p>
                <ol className="mt-2 ml-4 list-decimal space-y-1">
                  <li>本机重新打包：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">bash pack.sh</code></li>
                  <li>宝塔面板 → 文件 → 上传新的 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">stock-t-assistant.tar.gz</code> 到 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">/www/wwwroot/</code></li>
                  <li>解压覆盖（<strong className="text-foreground">注意不要删除</strong> <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">/www/wwwroot/stock-t-assistant/db/</code> 目录，那是数据库！）</li>
                  <li>终端执行：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">cd /www/wwwroot/stock-t-assistant && bash bt-install.sh</code></li>
                </ol>
              </div>
              <div>
                <p className="font-medium text-foreground">Git 用户</p>
                <CodeBlock code={`cd /www/wwwroot/stock-t-assistant\ngit pull\nbash bt-install.sh`} />
              </div>
              <div>
                <p className="font-medium text-foreground">Docker 用户</p>
                <CodeBlock code={`cd /www/wwwroot/stock-t-assistant\ndocker-compose up -d --build`} />
              </div>
              <Callout type="info">
                更新后如果页面没有变化，请用 <code className="font-mono text-xs">Ctrl + Shift + R</code> 强制刷新浏览器缓存。
              </Callout>
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
            <AccordionContent className="text-sm text-muted-foreground space-y-3">
              <p>项目使用 SQLite 数据库，数据库文件位于：</p>
              <CodeBlock code="/www/wwwroot/stock-t-assistant/db/custom.db" />

              <div className="mt-3">
                <p className="font-medium text-foreground">手动备份</p>
                <CodeBlock code={`cp /www/wwwroot/stock-t-assistant/db/custom.db /www/backup/custom_$(date +%Y%m%d_%H%M%S).db`} />
              </div>

              <div className="mt-3">
                <p className="font-medium text-foreground">自动备份（推荐）</p>
                <ol className="mt-2 ml-4 list-decimal space-y-2">
                  <li>宝塔面板 → 左侧「计划任务」</li>
                  <li>点击「添加任务」，配置如下：</li>
                </ol>
                <ConfigTable rows={[
                  { label: '任务类型', value: 'Shell 脚本', note: '' },
                  { label: '任务名称', value: '备份做T助手数据库', note: '' },
                  { label: '执行周期', value: '每天', note: '' },
                  { label: '执行时间', value: '03:00', note: '凌晨3点执行' },
                ]} />
                <p className="mt-2 font-medium text-foreground">脚本内容：</p>
                <CodeBlock
                  code={`#!/bin/bash\nBACKUP_DIR="/www/backup/stock-t"\nmkdir -p $BACKUP_DIR\ncp /www/wwwroot/stock-t-assistant/db/custom.db $BACKUP_DIR/custom_$(date +\\%Y\\%m\\%d_\\%H\\%M).db\n# 只保留最近30天的备份\nfind $BACKUP_DIR -name "custom_*.db" -mtime +30 -delete\necho "备份完成: custom_$(date +\\%Y\\%m\\%d_\\%H\\%M).db"`}
                />
                <ol start={3} className="ml-4 list-decimal space-y-1">
                  <li>点击「添加」</li>
                </ol>
              </div>

              <div className="mt-3">
                <p className="font-medium text-foreground">恢复数据库</p>
                <CodeBlock
                  code={`# 先停止服务\npm2 stop stock-t-assistant\n\n# 替换数据库文件（将日期替换为实际备份日期）\ncp /www/backup/stock-t/custom_20250101_0300.db /www/wwwroot/stock-t-assistant/db/custom.db\n\n# 重启服务\npm2 start stock-t-assistant`}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 密码管理 */}
          <AccordionItem value="password">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-red-400" />
                密码管理
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-3">
              <p>
                默认密码：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">888888</code>
              </p>

              <div>
                <p className="font-medium text-foreground">在界面修改密码</p>
                <ol className="mt-2 ml-4 list-decimal space-y-1">
                  <li>用当前密码登录系统</li>
                  <li>点击右上角「🛡️ 密码管理」按钮</li>
                  <li>输入当前密码 → 新密码 → 确认新密码</li>
                  <li>点击确认，密码修改成功</li>
                </ol>
              </div>

              <div>
                <p className="font-medium text-foreground">忘记密码？重置方法</p>
                <p className="mt-1">在宝塔终端执行：</p>
                <CodeBlock
                  code={`cd /www/wwwroot/stock-t-assistant\n\n# 方法1：修改 .env 文件中的密码\nsed -i 's/APP_PASSWORD=.*/APP_PASSWORD=888888/' .env\n\n# 方法2：删除数据库中的密码记录（回退到 .env 或默认值）\nnpx prisma db execute --stdin << 'SQL'\nDELETE FROM AppConfig WHERE key = 'app_password';\nSQL\n\n# 重启服务\npm2 restart stock-t-assistant`}
                />
                <p className="mt-2">然后用 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">888888</code> 登录，再去界面修改为新密码。</p>
              </div>

              <div>
                <p className="font-medium text-foreground">重新运行安装脚本修改密码</p>
                <CodeBlock code="cd /www/wwwroot/stock-t-assistant && bash bt-install.sh 新密码" />
              </div>

              <Callout type="warning">
                修改密码后需重启服务：<code className="font-mono text-xs">pm2 restart stock-t-assistant</code>
              </Callout>
            </AccordionContent>
          </AccordionItem>

          {/* 常见问题 */}
          <AccordionItem value="faq">
            <AccordionTrigger className="text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-purple-400" />
                常见问题
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-4">
              {/* node 命令找不到 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  Q: node 命令找不到
                </p>
                <p className="mt-1">宝塔安装的 Node.js 通过 NVM 管理，需先加载环境：</p>
                <CodeBlock code="source /www/server/nvm/nvm.sh" />
                <p className="mt-1">永久解决：在 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">~/.bashrc</code> 末尾添加：</p>
                <CodeBlock code={`export PATH="/www/server/nodejs/v20*/bin:$PATH"`} />
              </div>

              {/* 构建内存不足 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  Q: 构建内存不足（JavaScript heap out of memory）
                </p>
                <p className="mt-1">添加 Swap 分区：</p>
                <CodeBlock
                  code={`sudo fallocate -l 2G /swapfile\nsudo chmod 600 /swapfile\nsudo mkswap /swapfile\nsudo swapon /swapfile\n# 持久化\necho '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab\n# 重新构建\ncd /www/wwwroot/stock-t-assistant && bash bt-install.sh`}
                />
              </div>

              {/* 端口被占用 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  Q: 端口 3000 被占用
                </p>
                <p className="mt-1">查看端口占用：</p>
                <CodeBlock code="lsof -i :3000" />
                <p className="mt-1">释放端口：</p>
                <CodeBlock code="kill -9 $(lsof -t -i:3000)" />
                <p className="mt-1">或更换端口（编辑 <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">ecosystem.config.js</code>）</p>
              </div>

              {/* Nginx 502 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  Q: Nginx 502 Bad Gateway
                </p>
                <p className="mt-1">Node.js 服务未运行或崩溃，排查步骤：</p>
                <CodeBlock
                  code={`# 1. 检查服务是否运行\npm2 status\n\n# 2. 查看错误日志\npm2 logs stock-t-assistant --err --lines 50\n\n# 3. 重启服务\npm2 restart stock-t-assistant\n\n# 4. 等待5秒后再次检查\nsleep 5 && pm2 status`}
                />
              </div>

              {/* 更新后页面没变化 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  Q: 更新后页面没变化
                </p>
                <p className="mt-1">浏览器缓存导致，强制刷新：</p>
                <ul className="mt-1 ml-4 list-disc space-y-1">
                  <li>Chrome / Edge：<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">Ctrl + Shift + R</code></li>
                  <li>或打开开发者工具 → Network → 勾选「Disable cache」</li>
                </ul>
              </div>

              {/* SSL证书申请失败 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  Q: SSL 证书申请失败
                </p>
                <ul className="mt-1 ml-4 list-disc space-y-1">
                  <li><strong className="text-foreground">域名未解析到服务器 IP</strong> → 去 DNS 服务商添加 A 记录</li>
                  <li><strong className="text-foreground">80 端口未放行</strong> → 宝塔安全 + 云服务商安全组都放行 80 端口</li>
                  <li><strong className="text-foreground">域名刚解析未生效</strong> → 等待 10 分钟后重试</li>
                </ul>
              </div>

              {/* 云服务商安全组 */}
              <div>
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <ChevronRight className="h-4 w-4 text-amber-400" />
                  Q: 云服务商安全组如何配置？
                </p>
                <p className="mt-1">无论用哪家云服务商，需要在安全组中放行以下端口：</p>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border/40">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/30">
                        <th className="px-3 py-2 text-left font-medium text-foreground">端口</th>
                        <th className="px-3 py-2 text-left font-medium text-foreground">用途</th>
                        <th className="px-3 py-2 text-left font-medium text-foreground">是否必须</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/20">
                        <td className="px-3 py-2"><code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">80</code></td>
                        <td className="px-3 py-2">HTTP</td>
                        <td className="px-3 py-2">绑定域名时需要</td>
                      </tr>
                      <tr className="border-b border-border/20">
                        <td className="px-3 py-2"><code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">443</code></td>
                        <td className="px-3 py-2">HTTPS</td>
                        <td className="px-3 py-2">绑定域名 + SSL 时需要</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2"><code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">3000</code></td>
                        <td className="px-3 py-2">直接 IP 访问</td>
                        <td className="px-3 py-2">不绑定域名时需要</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-1">阿里云 / 腾讯云 / 华为云等均需配置安全组。</p>
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
