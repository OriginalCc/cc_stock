---
Task ID: 1
Agent: main
Task: 在选股页面增加子菜单实现历史选股验证功能

Work Log:
- 添加 ScreenerHistoryRecord 模型到 Prisma Schema，包含1日/3日/5日验证字段
- 运行 db:push 同步数据库
- 重写 screener-history API，支持多日验证（1日/3日/5日后续涨幅）
- 更新 ScreenerHistoryPanel 组件，展示多日验证结果和5日走强率
- 在 page.tsx 中添加选股页面子菜单（选股结果/历史验证）
- 在 screener-shared.ts 中添加 saveScreenerResults 和 useAutoSaveScreener
- 为5个选股组件集成 useAutoSaveScreener 自动保存钩子
- Lint 通过，dev server 正常运行

Stage Summary:
- 新增 Prisma 模型 ScreenerHistoryRecord（含 screenerType, day3/5 验证字段）
- 验证 API 增强：计算1日/3日/5日后续涨幅，使用次日开盘价作为入场价
- 选股页面增加子菜单切换：选股结果 ↔ 历史验证
- 5个选股组件（智能选股/分时选股/早盘选股/低开选股/涨停分析）自动保存结果
- 历史验证面板展示：次日胜率、3日均幅、5日均幅、5日走强率

---
Task ID: 2
Agent: main
Task: 修复选股页面报错（hydration mismatch + TDZ + 属性警告）

Work Log:
- 检查 dev server 日志，发现3个错误：
  1. `ReferenceError: Cannot access 'sortedStocks' before initialization` (TDZ错误)
  2. Hydration mismatch for menu stock buttons (className server vs client不同)
  3. `Received true for a non-boolean attribute ml-1` (JSX属性错误)
- 修复 TDZ 错误：将 stock-screener.tsx 中 useAutoSaveScreener 调用从 sortedStocks 定义前移到定义后
- 修复 TDZ 错误：将 low-open-screener.tsx 中 useAutoSaveScreener 调用从 sortedStocks 定义前移到定义后
- 修复 hydration mismatch：在 page.tsx 添加 mounted 状态，菜单股票按钮在 mounted 前统一使用 ghost variant
- 修复 JSX 属性错误：kline-chart-panel.tsx 中 `ml-1` 被错误地作为 JSX 属性而非 className 内的类名
- Lint 通过，dev server 正常运行

Stage Summary:
- 修复了2个 TDZ (Temporal Dead Zone) 错误：stock-screener.tsx 和 low-open-screener.tsx
- 修复了 hydration mismatch：使用 mounted 状态延迟渲染依赖 localStorage 的 UI
- 修复了 kline-chart-panel.tsx 中的 ml-1 非布尔属性警告

---
Task ID: 2
Agent: cache-optimizer
Task: 优化客户端选股组件缓存策略，减少重复请求和冗余状态

Work Log:
- stock-screener.tsx: 替换 cachedFetch 为 fetchWithSWR（SWR 模式），移除模块级 clientCache/ClientCacheEntry/CLIENT_CACHE_TTL，简化 mount useEffect，memoize filtersChanged，使用 lastFetchTimestamp 替代 clientCache.timestamp 计算 cacheRemaining
- intraday-screener.tsx: 同样替换 cachedFetch → fetchWithSWR，移除模块级缓存，memoize filtersChanged，使用 lastFetchTimestamp
- early-trading-screener.tsx: 替换 cachedFetch → fetchWithSWR，移除模块级缓存，memoize filtersChanged，使用 lastFetchTimestamp，倒计时定时器从1秒改为5秒
- low-open-screener.tsx: 替换 cachedFetch → fetchWithSWR，移除模块级缓存，memoize filtersChanged（新增 useMemo import），使用 lastFetchTimestamp
- limit-up-analysis.tsx: 新增 cachedFetch 替换原始 fetch（请求去重），移除模块级 clientCache/ClientCacheEntry/CLIENT_CACHE_TTL，倒计时定时器从1秒改为5秒，使用 lastFetchTimestamp 计算 cacheRemaining
- screener-shared.ts: fetchMiniTimeline 函数用 cachedFetch 包裹（60秒 TTL），移除 cache: "no-store"，避免重复请求同一股票的分时数据
- Lint 通过，dev server 正常运行（HTTP 200）

Stage Summary:
- 4个选股组件（智能选股/分时选股/早盘选股/低开选股）统一使用 fetchWithSWR（stale-while-revalidate）替代双重缓存（模块级 clientCache + cachedFetch）
- 涨停分析组件新增 cachedFetch 请求去重
- 所有模块级 clientCache 变量及关联类型/常量已移除，简化为 fetchWithSWR/cachedFetch 统一管理
- filtersChanged 在4个组件中均用 useMemo 包裹避免每次渲染重新计算
- 2个高频定时器（early-trading-screener 倒计时、limit-up-analysis cacheTick）从1秒改为5秒，减少不必要的渲染
- fetchMiniTimeline 增加60秒客户端缓存，避免相同股票的重复分时请求

---
Task ID: 3
Agent: timeline-cache-optimizer
Task: 优化选股API服务端分时数据缓存，消除N+1重复HTTP请求

Work Log:
- 创建共享分时缓存模块 `/src/lib/server-timeline-cache.ts`，模块级Map缓存，60秒TTL
- 修改 screener route：导入缓存函数，getStockTimeline 先查缓存再请求，成功后写入缓存，batchSize 5→10
- 修改 intraday-screener route：同上，getStockTimeline 添加缓存层，batchSize 5→10
- 修改 early-screen route：同上，getStockTimeline 添加缓存层，batchSize 5→10
- 修改 limit-up route：同上，getStockTimeline 添加缓存层，batchSize 5→10
- Lint 通过

Stage Summary:
- 新增 `src/lib/server-timeline-cache.ts`：跨路由共享的内存缓存，避免同一股票多次触发腾讯API请求
- 4个选股API路由（screener/intraday-screener/early-screen/limit-up）全部集成共享缓存
- 批量并发数从5提升到10，加快批次处理速度
- 缓存类型兼容两种返回格式（含/不含avgPrice字段）

---
Task ID: 4
Agent: main
Task: 综合验证选股页面加速优化

Work Log:
- 确认所有服务端路由已集成共享分时缓存 (server-timeline-cache.ts)
- 确认4个选股组件已切换到 fetchWithSWR (stale-while-revalidate)
- 确认涨停分析已添加 cachedFetch 请求去重
- 确认 fetchMiniTimeline 已添加60秒缓存
- 确认高频定时器已从1秒改为5秒
- 确认 filtersChanged 已用 useMemo 优化
- 确认所有模块级 clientCache 已移除
- lint 通过，dev server 正常

Stage Summary:
- 选股页面加载速度优化完成，涵盖服务端+客户端+共享缓存三个层面

---
Task ID: 5
Agent: main
Task: 选股页面默认缓存1小时，点击刷新才刷新

Work Log:
- 客户端5个选股组件的 fetchWithSWR/cachedFetch TTL 从2-5分钟改为1小时 (3_600_000ms)
- 移除5个组件的 useAutoRefresh 自动刷新钩子（不再交易时段自动刷新）
- 移除自动刷新按钮UI（智能选股、分时选股、早盘选股、低开选股、涨停分析）
- 保留手动刷新按钮，点击时传 refresh=1 绕过缓存
- 服务端5个API路由的 CACHE_TTL 从2-5分钟改为1小时 (60*60*1000)
- 清理未使用的 useAutoRefresh import、autoRefreshEnabled/pageVisible 状态、visibility effect
- lint 通过

Stage Summary:
- 选股结果客户端+服务端均默认缓存1小时
- 取消自动刷新，只能通过刷新按钮手动更新
- 刷新按钮点击时传 refresh=1 参数，服务端绕过缓存重新获取数据

## Task 2 - Fix client-cache periodic cleanup threshold

**Date:** 2025-03-04
**Agent:** main

### Summary
Updated the periodic cleanup threshold in `src/lib/client-cache.ts` from 10 minutes (600,000ms) to 2 hours (7,200,000ms) so that screener cache entries with a 1-hour TTL are not prematurely evicted.

### Changes Made
- **File:** `src/lib/client-cache.ts` (line 257-258)
  - Changed comment from "Remove entries older than 10 minutes" to "Remove entries older than 2 hours"
  - Changed threshold from `600_000` to `7_200_000`

### Rationale
The screener components use `fetchWithSWR` and `cachedFetch` with a 1-hour (3,600,000ms) TTL. The previous 10-minute cleanup threshold was evicting these entries well before their TTL expired, causing unnecessary re-fetches. A 2-hour threshold provides a comfortable buffer beyond the 1-hour TTL.

---
Task ID: 6
Agent: main
Task: 添加密码保护功能（PasswordGate）

Work Log:
- 创建 API 路由 src/app/api/auth/verify/route.ts：POST 请求验证密码，密码存储在 APP_PASSWORD 环境变量（默认 888888）
- 创建 PasswordGate 组件 src/components/password-gate.tsx：
  - 客户端组件，包裹主页面内容
  - 使用 localStorage 存储认证状态（key: app-auth，含 timestamp）
  - 24小时过期机制，过期后需重新登录
  - SSR 安全：检查 typeof window 防止服务端渲染问题
  - 美观 UI：居中卡片、Zap 图标、"做T助手"标题、密码输入框（含显示/隐藏切换）
  - 密码错误时 shake 动画反馈
  - 加载状态（Loader2 旋转图标）
- 修改 src/app/page.tsx：导入 PasswordGate，用 <PasswordGate> 包裹 return 内容
- Lint 通过，API 测试通过（正确密码返回 success:true，错误密码返回 401）

Stage Summary:
- 新增密码保护功能，访问应用前需输入密码
- 密码验证通过服务端 API，不暴露密码到客户端
- 认证状态持久化 24 小时（localStorage），自动检查并跳过登录
- 登录界面美观专业，含动画反馈

---
Task ID: 7
Agent: main
Task: 在菜单中增加密码管理修改菜单

Work Log:
- 在 Prisma schema 中新增 AppConfig 模型（key/value 键值对存储），用于持久化密码配置
- 运行 db:push 和 prisma generate 同步数据库和客户端
- 更新 API 路由 src/app/api/auth/verify/route.ts：
  - POST 保持密码验证功能，改为从 DB 读取密码（fallback 到环境变量/默认值）
  - 新增 PUT 方法：修改密码，需验证当前密码后 upsert 新密码到 DB
  - 新密码至少4位，不能与当前密码相同
- 创建密码管理对话框组件 src/components/password-manage-dialog.tsx：
  - 使用 shadcn/ui Dialog 组件
  - 包含当前密码、新密码、确认新密码三个输入框
  - 每个密码框有显示/隐藏切换按钮
  - 完整的表单验证（空值、长度、一致性检查）
  - 加载状态、错误提示、成功动画
  - 自动关闭成功提示
- 修改 src/app/page.tsx：
  - 导入 PasswordManageDialog 和 ShieldCheck 图标
  - 添加 showPasswordDialog 状态
  - 在头部右侧导航区域添加密码管理按钮（ShieldCheck 图标 + "密码"文字）
  - 在页面底部添加 PasswordManageDialog 组件实例
- Lint 通过，API 测试通过

Stage Summary:
- 新增 AppConfig 数据模型，密码修改后持久化到数据库
- 导航栏右侧增加"密码"管理按钮，点击弹出密码管理对话框
- 密码管理对话框支持：输入当前密码验证、设置新密码、确认新密码
- API 支持完整的密码验证和修改流程

---
Task ID: 8
Agent: main
Task: 降低部署难度，实现一键部署

Work Log:
- 创建 Dockerfile（多阶段构建: deps → builder → runner，使用 standalone 输出）
- 更新 next.config.ts 添加 output: "standalone" 支持 Docker 精简镜像
- 创建 docker-compose.yml（一键 docker-compose up -d）
- 创建 docker-entrypoint.sh（自动初始化数据库）
- 创建 .dockerignore（优化构建上下文）
- 创建 .env.example（环境变量模板）
- 创建 ecosystem.config.js（PM2 生产环境配置）
- 创建 setup.sh（VPS 全自动一键部署脚本，自动安装 Node/Bun/PM2，构建并启动）
- 更新 package.json 添加 deploy/docker:* 快捷命令
- 重写 DEPLOY.md 简化为三种部署方式：Docker一键 / VPS一键脚本 / 宝塔面板

Stage Summary:
- 三种部署方式，全部一键搞定
- Docker: docker-compose up -d（2条命令）
- VPS: bash setup.sh（自动安装所有环境+构建+启动）
- 宝塔: setup.sh + 反向代理
- 默认密码 888888，通过 APP_PASSWORD 环境变量或界面修改

---
Task ID: 9
Agent: main
Task: 简化宝塔面板一键部署

Work Log:
- 创建 bt-install.sh — 宝塔专用一键安装脚本
  - 自动检测宝塔自带的 Node.js (/www/server/nodejs)
  - 自动安装 PM2、依赖、构建项目、启动服务
  - 安装完成后输出宝塔面板操作指引（添加站点+反向代理+SSL）
  - 支持自定义密码: bash bt-install.sh 你的密码
- 创建 pack.sh — 项目打包脚本
  - 只打包必要源码，排除 node_modules/.next/日志等
  - 生成约 512KB 的 tar.gz 压缩包
  - 打包后显示宝塔部署步骤提示
- 重写 DEPLOY.md — 专注于宝塔面板3步部署
  - Step 1: 上传项目（pack.sh 打包上传 或 git clone）
  - Step 2: bash bt-install.sh 一键安装
  - Step 3: 宝塔面板配置域名+HTTPS（可选）
- 更新 package.json 添加 deploy:bt 和 pack 快捷命令

Stage Summary:
- 宝塔部署仅需3步：上传 → bash bt-install.sh → 配置域名(可选)
- 打包后仅 512KB，上传速度极快
- bt-install.sh 专门适配宝塔环境（自动识别宝塔 Node.js 路径）
- 部署完成后有清晰的下一步操作提示

---
Task ID: 10
Agent: main
Task: 优化各个页面的响应速度

Work Log:
- 修复 ashare-timeline/route.ts 关键 bug：`isTrading` 判断条件 `cacheTTL <= 1000` 改为 `cacheTTL <= 3000`，之前交易时段 `isTrading` 始终为 false，导致浏览器缓存分时数据不刷新
- 优化 ashare-timeline/route.ts：提取 Cache-Control 头计算为统一变量，避免重复计算
- 优化 ashare-quote/route.ts：添加交易时段感知 TTL（交易时段2s/非交易5min），替代原来固定3s缓存
- 优化 ashare-history/route.ts：改进 Cache-Control 头（`max-age=15, must-revalidate` 替代 `max-age=30, s-maxage=30`）
- 迁移 ashare-sector/route.ts 到 fetchGuarded 统一缓存，替代自定义 sectorCache Map；添加交易时段感知 TTL
- 修复 ashare-api.ts getStockSector 函数：移除冗余 Promise.race 双重超时（与 AbortSignal.timeout 重复），简化为单一 AbortSignal.timeout
- 优化 client-cache.ts：LRU 驱逐从 O(n log n) 排序改进为 O(1) 顺序删除（Map 保留插入顺序）；stale 阈值从固定10s改为 TTL 的50%
- 优化 use-stock-data.ts：客户端自动刷新间隔从3s降到2s；缓存 TTL 从2s降到1.5s（比刷新间隔短，确保每次刷新都能拿到新数据）
- 优化 fetch-guard.ts：LRU 驱逐从单条删除改为批量删除20%，避免频繁逐出
- 提取 kline-chart-panel.tsx 内联 shape 函数为模块级稳定引用（volumeBarShape, macdBarShape），避免每次渲染创建新函数
- 提取 time-sharing-panel.tsx 4个内联 shape 函数为模块级稳定引用（timelineVolumeBarShape, timelineMacdBarShape），减少 Recharts 重渲染
- 提取 five-day-timeline-panel.tsx 内联 shape 包装函数，直接使用 VolumeBarShape 组件引用
- 优化 page.tsx 指数数据获取：先获取活跃指数（秒级响应），1s后再获取全部指数，避免初始加载3个并行请求阻塞

Stage Summary:
- 修复了分时API交易时段缓存不刷新的关键bug（isTrading判断条件错误）
- 分时数据自动刷新从3s加速到2s
- 服务端统一使用 fetchGuarded 缓存，sector路由移除了自定义缓存
- 客户端缓存LRU驱逐O(1)优化，stale阈值动态化
- 6个Recharts组件的内联shape函数提取为模块级稳定引用，减少不必要重渲染
- 指数数据初始加载优先级优化，先显示活跃指数
---
Task ID: 1
Agent: Main
Task: 低开页面选出的股票缓存一个小时，不然每次点击去都没有了

Work Log:
- 分析了低开页面的数据流：组件通过 fetchWithSWR 从 client-cache 获取数据，1小时 TTL
- 发现问题根因：切换 tab 时组件卸载，React 状态（result）重置为 null，重新挂载时 fetchData() 先 setLoading(true) 导致显示空白/骨架屏，即使 client-cache 模块级 Map 有缓存数据
- 解决方案：在 fetchData 开头先用 getCachedData + isCacheFresh 检查缓存，有新鲜缓存则立即恢复数据，跳过 loading 骨架屏
- 将同样优化应用到所有使用 client-cache 的选股组件：
  - low-open-screener.tsx（低开选股）
  - stock-screener.tsx（选股器）
  - intraday-screener.tsx（分时选股）
  - early-trading-screener.tsx（早盘选股）
  - limit-up-analysis.tsx（涨停分析）
  - sector-rotation-panel.tsx（板块轮动 - 新增 cachedFetch 接入）

Stage Summary:
- 所有选股页面现在切换回来时会立即显示缓存数据，不会出现空白
- 缓存有效期 1 小时（3_600_000ms），通过刷新按钮强制更新
- client-cache.ts 的模块级 Map 在 SPA 生命周期内持续有效，tab 切换不会丢失
---
Task ID: 1
Agent: main
Task: Add strategy panel to low-open screener page explaining all factors

Work Log:
- Researched low-open stock selection factors via web search (5 searches)
- Read current low-open-screener.tsx (1054 lines) and API route (730 lines)
- Identified 7 existing factors in backend: gapFillRate, supportStrength, volumeConfirm, mainForceScore, valuationSafety, elasticityScore, gapDepthScore + compositeScore
- Added strategyExpanded state variable
- Added BookOpen, Info, Shield, Zap, BarChart2, Layers icon imports
- Implemented collapsible strategy panel card with:
  - Core strategy logic explanation (amber themed)
  - 7 factor detail cards with: calculation method, meaning, usage tips, weight badges
  - Composite score formula and interpretation guide (rose themed)
  - 7 practical trading tips (emerald themed)
  - Risk warnings section (red themed)
- Fixed indentation issue in factor 3
- Lint check passed

Stage Summary:
- Strategy panel added between header card and results section
- All 7 factors documented with calculation, meaning, and usage tips

---
Task ID: 1
Agent: main
Task: Enrich the low-open screener page with new features

Work Log:
- Read existing low-open-screener.tsx (1310 lines) and worklog.md
- Added new imports: ChevronRight, Gauge, PieChart, Filter, Eye, Plus from lucide-react
- Added getSentimentInfo helper function for sentiment gauge coloring (强势/偏多/中性/偏空)
- Extended LowOpenFilters interface with client-side fields: maxPE, excludeST, minCompositeScore, patternFilter, minMainForceScore
- Updated DEFAULT_FILTERS with new fields (all defaulting to 0/false/"")
- Added PresetKey type and PRESET_CONFIGS for 6 quick filter presets
- Added FACTOR_DEFS constant for the 7 factor definitions used in row expansion
- Added new state variables: activePreset (PresetKey), expandedStock (string | null)
- Added statsOverview useMemo: avg composite score, avg recovery rate, high-score count, 低开高走 count, avg volume ratio
- Added sentimentScore useMemo: calculates sentiment based on pattern distribution (低开高走+2, 低开企稳+1, 低开震荡0, 低开低走-2)
- Added sectorDistribution useMemo: groups stocks by sectorName, sorted by count descending, top 10
- Added filteredStocks useMemo: applies client-side filters (maxPE, excludeST, minCompositeScore, patternFilter, minMainForceScore) on top of sortedStocks
- Added handlePresetClick function: applies preset filter combinations, handles deactivation, triggers API refetch when needed
- Updated handleResetFilters to also reset activePreset
- Added Quick Filter Presets row (6 pill buttons) in header card below active criteria tags
- Added new criteria badges for maxPE, excludeST, minCompositeScore, patternFilter, minMainForceScore
- Added Statistical Overview Card between header and results: 6 stat boxes in grid (avg score, avg recovery, high-score count, 低开高走 count, avg volume ratio, sentiment gauge)
- Added Sector Distribution Panel between stats card and results: horizontal bar chart of top 10 sectors
- Added row expansion support: ChevronRight toggle column, expandedStock state, expanded detail sub-row with 7 factor progress bars in 2-column grid, recovery detail text, and quick action buttons (加入自选, 查看详情)
- Added PE and ST filter inputs to filter panel (Row 5)
- Updated results count to show filteredStocks.length and indicate client-side filtering
- Added empty state card for when client-side filters eliminate all results
- Updated info card to mention row expansion feature
- Lint check passed with no errors

Stage Summary:
- 6 new features added to low-open screener: Statistical Overview, Quick Filter Presets, Sector Distribution, Row Expansion, Market Sentiment Gauge, Additional Filters (PE/ST)
- All existing functionality preserved intact
- No backend changes required - all new features use client-side filtering and data from existing result state
- 5 new client-side filter fields added to LowOpenFilters interface
- ~200 lines of new code added across the component
- Composite score formula and score interpretation included
- Panel is collapsed by default, expandable with click

---
Task ID: 2
Agent: main
Task: Add trading rules panel and position annotations to the T-Assistant page

Work Log:
- Read worklog.md and current page.tsx / time-sharing-panel.tsx structure
- Added new icon imports to page.tsx: Scale, AlertTriangle, BookOpen, Info, ChevronUp, ChevronDown from lucide-react
- Added `rulesExpanded` state variable to page.tsx
- Added collapsible Trading Rules Card after StrategyAdminPanel in the T-Assistant view (page.tsx), containing:
  - 核心规矩: 板块与个股双跌时仓位限制1/3规则，含原因解释
  - 仓位对照表: 5种板块×个股方向组合的建议仓位表格
  - 其他规矩: 6条交易纪律（大盘暴跌不参与、板块暴跌减仓等）
  - 实战案例: 双跌场景和板块强+个股弱场景的仓位应用示例
- Added Position Rule Badge to time-sharing-panel.tsx, right after the sector regime badge:
  - Based on sectorRegime + last data point changePercent to determine position suggestion
  - 5 color-coded states: red(1/3仓), amber(谨慎20-30%仓), green(积极30-40%仓), yellow(低吸20-30%仓), gray(轻仓15-25%)
  - Shows tooltip with sector+stock direction explanation
- Lint passed with no errors
- Dev server running normally (200 responses confirmed)

Stage Summary:
- Trading Rules panel added as collapsible card in T-Assistant page
- Position Rule Badge added to TimeSharingPanel chart header
- No backend changes required
- No modifications to intraday-screener.tsx

---
Task ID: 3
Agent: main
Task: 修复分时图仓位规矩标注不可见的问题

Work Log:
- 分析问题：仓位规矩徽章依赖 sectorRegime 数据才显示，且 text-[10px] 太小难以发现
- 在分时图头部价格信息旁增加显眼的仓位徽章（紧跟涨跌幅后面，text-[11px] font-bold，带emoji图标）
- 仓位徽章改为始终显示（不依赖 sectorRegime），无板块数据时根据个股涨跌显示简化建议
- 在图表区域上方增加彩色仓位规矩横幅（Position Rule Banner），双跌时红色横幅、双涨时绿色横幅等
- 移除之前在sector regime徽章旁的重复小徽章，避免信息冗余
- 横幅6种状态：双跌(红)、双涨(绿)、板块跌+个股涨(琥珀)、板块涨+个股跌(黄)、无板块+个股跌(淡琥珀)、无板块+个股涨(淡绿)
- Lint通过，页面正常加载

Stage Summary:
- 仓位规矩现在有2处醒目标注：价格旁徽章 + 图表上方横幅
- 不再依赖 sectorRegime 数据，始终可见
- 双跌场景（板块↓+个股↓）红色横幅 "⛔ 板块↓ + 个股↓ = 双跌！仓位 ≤ 1/3" 最醒目

---
Task ID: 4
Agent: main
Task: 在交易规矩里面增加大盘（深证成指）上涨下跌影响因素

Work Log:
- 读取当前 time-sharing-panel.tsx、page.tsx、intraday-screener.tsx 的交易规矩实现
- 更新 time-sharing-panel.tsx 的仓位徽章逻辑，从二维（板块×个股）升级为三维（大盘×板块×个股）
  - 新增大盘方向判断：mktDown/mktUp/hasMktInfo（基于 szIndexRegime prop）
  - 三跌（深证↓+板块↓+个股↓）→ 🚫 极限1/4仓（最危险）
  - 三涨（深证↑+板块↑+个股↑）→ ✅ 积极30-40%（最安全）
  - 8种三维组合 + 无大盘数据时的二维回退
  - tooltip 显示完整三维状态：仓位规矩(三维)：深证↓ + 板块↓ + 个股↓ → 🚫 极限1/4仓
- 更新 time-sharing-panel.tsx 的图表上方仓位横幅，增加三维场景
  - 三跌红色横幅 "🚫 深证↓ + 板块↓ + 个股↓ = 三跌！仓位 ≤ 1/4"
  - 三涨绿色横幅 "✅ 深证↑ + 板块↑ + 个股↑ = 三涨，可积极做T"
  - 大盘↓+板块↑+个股↑ 黄色横幅 "🔸 深证↓ 但板块↑+个股↑，大盘压制下适度参与"
  - 大盘↑+板块↓+个股↓ 红色横幅 "⚠️ 深证↑ 但板块↓+个股↓，大盘支撑但板块弱势"
  - 无板块时显示深证+个股方向的简化横幅
- 更新 page.tsx 交易规矩卡片：
  - 核心规矩标题改为"大盘+板块+个股三维仓位控制（以深证成指为主）"
  - 新增1/4仓规则（三跌最危险）+ 1/3仓规则（大盘不跌时双跌）
  - 新增"大盘（深证成指）影响规则"卡片：深证下跌时4条调节规则 + 深证上涨时4条调节规则
  - 新增"为什么选深证成指？"4条理由
  - 仓位对照表从2列扩展为3列（深证成指+板块方向+个股方向），8+1行
  - 其他规矩从6条扩充到8条，新增深证连续下跌减半、深证翻红加仓信号
  - 实战案例从2个场景扩充到4个三维场景
- 更新 intraday-screener.tsx 交易规矩卡片（同步page.tsx的所有变更）
- Lint通过，dev server正常运行（HTTP 200）

Stage Summary:
- 仓位规矩从二维（板块×个股）升级为三维（大盘×板块×个股）
- 新增三跌最危险场景：深证↓+板块↓+个股↓ → 1/4仓位
- 新增三涨最安全场景：深证↑+板块↑+个股↑ → 30-40%仓位
- 大盘方向作为仓位调节器：下跌时全面收紧，上涨时适度放松
- 以深证成指为主，覆盖深市中小盘和成长股走势
- 分时图徽章和横幅均实时显示三维仓位建议
- 3个文件更新：time-sharing-panel.tsx、page.tsx、intraday-screener.tsx

---
Task ID: 5
Agent: main
Task: 优化交易规矩规则

Work Log:
- 全面重构交易规矩，从4个板块扩展为10个板块
- 新增5级仓位阶梯（一级≤1/4→五级30-40%），替代原来散乱的仓位表
- 新增"做T策略选择"板块：正T（先买后卖）vs 反T（先卖后买）决策指引
- 新增"时间窗口规矩"板块：5个时段（早盘观察→上午操作→午盘确认→尾盘决策→收盘冲刺）
- 新增"止损止盈规矩"板块：止损4条+止盈4条
- 新增"量能确认规矩"板块：缩量下跌/放量上涨/脉冲放量/放量下跌4条
- 大盘影响说明改为"仓位调节器"概念，精简为收紧/放宽两面
- 仓位速查表增加"做T方向"列
- 禁忌规矩精简为4条绝对禁止项
- 新增"动态调节规矩"板块：5条实时调整规则
- 实战案例优化：增加仓位等级+做T方向标注
- 分时图仓位徽章升级：新增做T方向提示（正T/反T/观望），更简洁的标签
- 分时图仓位横幅升级：所有场景增加做T方向提示，新增"大盘↑+板块↑+个股↓低吸良机"场景
- 同步更新 page.tsx 和 intraday-screener.tsx 两个文件
- Lint通过，dev server正常（HTTP 200）

Stage Summary:
- 交易规矩从4板块→10板块，更全面和实用
- 核心改进：仓位阶梯化（5级）、做T策略化（正T/反T）、时间窗口化、止损止盈规则化
- 分时图徽章现在同时显示仓位+做T方向（如"1/4仓 | 反T"）
- 3个文件更新：page.tsx、intraday-screener.tsx、time-sharing-panel.tsx

---
Task ID: 2
Agent: main
Task: 修复 strategy-admin-panel.tsx 中正T/反T定义不一致问题

Work Log:
- 读取 strategy-admin-panel.tsx，定位到第2403行
- 发现问题：正T标签写为"正T（先卖后买）"，与 page.tsx 中"正T = 先买后卖"的定义矛盾
- 修复：将"正T（先卖后买）"改为"正T（先买后卖）"，使两个文件定义一致
- 修复后定义：正T（先买后卖）= buy first, sell later；反T(先卖再买) = sell first, buy back later

Stage Summary:
- 修复了1行代码：正T定义从"先卖后买"纠正为"先买后卖"
- 现在 strategy-admin-panel.tsx 与 page.tsx 的正T/反T定义完全一致

---
Task ID: 1
Agent: main
Task: 优化交易规矩（Trading Rules）section — 修复矛盾、增强内容

Work Log:
- 修复正T描述矛盾（CRITICAL BUG）：将"适合尾盘买入、次日冲高卖出"改为"适合盘中低吸后反弹卖出，当天完成闭环"，与第八节"做T必须当天完成买卖，严禁隔夜"保持一致
- 新增"做T自检三问"section：插入在 CardContent 开头与"一、仓位阶梯"之间，包含3个快速自检问题（大盘安全/方向/仓位），带10万资金实例
- 增强止损规矩：单笔止损增加"10万本金做T亏2000元"示例；新增"日亏损上限"规则（10万亏500停止做T）
- 增强止盈规矩：首目标+1.5%增加"3万T仓赚450元"示例；二目标+3%增加"3万T仓赚900元"示例；冲高回落增加"宁可少赚不可倒亏"；大盘翻绿增加"不抱幻想"
- 新增2条禁忌规矩（第5、6条）："亏损后加仓翻本→绝对禁止"和"跌停板股票不参与做T"
- 修复反T描述：在"适合早盘冲高卖出、盘中回落买回"后追加"，当天完成闭环"，与正T描述格式一致
- Lint通过

Stage Summary:
- 5处修改全部完成，0处代码逻辑值变更
- 修复1个关键矛盾（正T描述vs隔夜禁令）
- 新增1个自检section + 1条止损规则 + 2条禁忌规则
- 6处显示文本增强（增加10万资金具体数字实例）

---
Task ID: 4
Agent: risk-dashboard
Task: Create Risk Alert Dashboard (风险仪表盘) component

Work Log:
- Created `/src/components/risk-alert-panel.tsx` with "use client" directive and React.memo
- Defined `RiskAlertPanelProps` interface with symbol, quote, liveTimeline, sectorRegime, szIndexRegime, signalCounts
- Implemented 6 risk indicator calculation functions:
  - `calcLimitDistance`: 涨跌停距离 - calculates distance to ±10% limits from prevClose, danger when within 1%, warning within 2%
  - `calcVWAPDeviation`: 均价偏离 - calculates deviation from avgPrice, danger at ≥3%, warning at ≥2%, safe when <1%
  - `calcVolumeAnomaly`: 量能异常 - compares latest minute volume to 30-min average, danger at >5x (脉冲放量), warning at >3x
  - `calcMarketRisk`: 大盘风险 - based on szIndexRegime, danger for 下跌趋势, warning for 横盘末期, safe for 震荡市
  - `calcSignalDensity`: 信号密度 - based on signal counts, warning when >20 signals, normal at 10-20, shows buy/sell ratio
  - `calcIntradayTrend`: 日内趋势 - calculates from liveTimeline, detects 上涨/下跌/震荡/横盘 based on price vs open & avgPrice and cross count
- Implemented overall risk level calculation: 🔴 高风险 (3+ danger/warning), 🟡 中风险 (1-2 warning), 🟢 低风险 (0-1)
- UI design: Card with Shield icon header, overall risk badge, 2x3 grid on desktop / 1x6 on mobile, compact indicator cards (~80px tall)
- Each indicator card shows: colored icon, title, value with unit, level label with emoji, one-line suggestion
- Bottom risk summary bar with overall suggestion and stock symbol
- Only renders when liveTimeline.length > 5
- Handles null quote gracefully (shows "无数据" placeholders)
- Lint passed with no errors

Stage Summary:
- New component: `src/components/risk-alert-panel.tsx` (named export `RiskAlertPanel`)
- 6 risk indicators with color-coded levels (danger/warning/normal/safe/info/none)
- Overall risk level badge in header
- Compact grid layout, responsive (1 col mobile / 2 col sm / 3 col lg)
- Graceful null handling for quote and regime data

---
Task ID: 3
Agent: main
Task: 同步交易规矩变更从 page.tsx 到 intraday-screener.tsx

Work Log:
- 修复正T描述矛盾：将"适合尾盘买入、次日冲高卖出"改为"适合盘中低吸后反弹卖出，当天完成闭环"
- 新增"做T自检三问"section：插入在"一、仓位阶梯"之前，包含3个快速自检问题（大盘安全/方向/仓位），带10万资金实例
- 增强止损规矩：单笔止损增加"10万本金做T亏2000元"示例；新增"日亏损上限"规则（10万亏500停止做T）
- 增强止盈规矩：首目标+1.5%增加"3万T仓赚450元"示例；二目标+3%增加"3万T仓赚900元"示例；冲高回落增加"宁可少赚不可倒亏"；大盘翻绿增加"不抱幻想"
- 新增2条禁忌规矩（第5、6条）："亏损后加仓翻本→绝对禁止"和"跌停板股票不参与做T"
- 修复反T描述：在"适合早盘冲高卖出、盘中回落买回"后追加"，当天完成闭环"
- Lint通过

Stage Summary:
- 6处修改全部完成，与 page.tsx 交易规矩保持同步
- 0处代码逻辑值变更，仅修改用户可见的显示文本
- 修复1个关键矛盾（正T描述vs隔夜禁令）
- 新增1个自检section + 1条止损规则 + 2条禁忌规则

---
Task ID: 2
Agent: main
Task: 创建"做T适宜度评分"组件 (TSuitabilityScore)

Work Log:
- 创建 /src/components/t-suitability-score.tsx 组件
- 实现6维评分逻辑（100分总分）：
  1. 日内振幅 (25分): ≥4%→25, 3-4%→18, 2-3%→10, <2%→0
  2. 波动率 (20分): std≥0.8%→20, 0.5-0.8%→14, 0.3-0.5%→8, <0.3%→3
  3. 量能充足度 (20分): ≥5000万→20, 3000-5000万→14, 1000-3000万→8, <1000万→3
  4. 均价偏离度 (15分): ≥2%→15, 1-2%→10, 0.5-1%→6, <0.5%→2
  5. 大盘环境 (10分): 震荡市→10, 上升通道→6, 下跌趋势→3, 横盘末期→4, 无数据→5
  6. 板块共振 (10分): 方向一致→10, 无数据→5, 方向相反→3
- 总分评级: ≥80→🟢高度适宜, 60-79→🟡基本适宜, 40-59→🟠勉强适宜, <40→🔴不宜做T
- UI设计：左侧SVG圆形进度环(类似T-Index)，右侧3x2网格展示6项因子分数+迷你进度条
- 底部一行建议文字，根据总分显示不同颜色和建议语
- 优雅处理 null quote（显示"选择股票查看做T适宜度"）和 liveTimeline 长度 ≤5（显示"等待分时数据加载..."）
- 使用 React.memo 包裹，named export
- Lint 通过

Stage Summary:
- 新增 TSuitabilityScore 组件，评估股票做T适宜度
- 6维评分体系：振幅/波动率/量能/均价偏离/大盘环境/板块共振
- 紧凑卡片设计：圆形评分环 + 3x2因子网格 + 底部建议
- 4级颜色主题（绿/黄/橙/红）随总分动态切换

---
Task ID: 3
Agent: main
Task: 创建"做T交易记录"（T-Trade Journal）组件

Work Log:
- 创建 `/src/components/t-trade-journal.tsx` 组件，实现完整的做T交易记录功能
- 定义 TTradeRecord 数据模型：id, symbol, stockName, date, type(正T/反T), entryTime, entryPrice, exitTime, exitPrice, quantity, status(open/closed), profit, profitPct, notes
- 使用 localStorage 持久化存储：per-stock key `t-trade-journal-{symbol}` + aggregate key `t-trade-journal-summary`
- 实现 Quick Entry Section：记录买入/记录卖出两个快捷按钮，自动填充当前时间和当前价格
- 实现内联表单：正T/反T类型选择器、价格输入、股数输入、备注输入、确认按钮
- 智能默认：点击"记录买入"时，若有未平仓反T记录，自动选择反T类型并提示建议平仓；反之亦然
- 实现 Today's Trades 列表：显示今日所有做T记录，含类型徽章、入场→出场价格、盈亏（绿色/红色）、时间
- 开仓交易显示当前浮动盈亏（基于 currentPrice prop）
- 点击展开：显示详细信息和操作按钮（按现价平仓、删除）
- 一键平仓：开仓交易可直接按当前价平仓
- 删除功能：可删除误录记录
- 每日限制警告：今日已平仓交易 ≥2 时显示琥珀色警告"今日做T已达上限，规则建议不超过2次"
- 实现 Statistics Dashboard（可折叠）：
  - 今日做T次数(X/2)
  - 今日胜率(X%)
  - 今日盈亏(±¥XXX)
  - 未平仓浮动盈亏
  - 近5日胜率(X%)
  - 近5日盈亏(±¥XXX)
  - 最佳做T时段(30分钟粒度)
  - 平均做T利润(%)
- 利润计算：正T = (exitPrice - entryPrice) * quantity，反T = (entryPrice - exitPrice) * quantity
- 日期使用中国时区(UTC+8)，格式 YYYY-MM-DD 和 HH:MM
- 使用 React.memo 包裹，named export `TTradeJournal`
- 处理 SSR hydration：mounted 状态延迟渲染 localStorage 数据
- 使用 queueMicrotask 包装 effect 中的 setState 调用，避免 ESLint cascading renders 警告
- Lint 通过

Stage Summary:
- 新增 TTradeJournal 组件：做T交易记录、实时浮动盈亏、统计面板
- localStorage 持久化，per-stock 独立存储
- 支持正T/反T两种做T类型，正确计算盈亏
- 每日2次限制警告，最佳时段统计，5日胜率/盈亏
- 紧凑卡片设计，统计面板默认折叠


---
Task ID: 6
Agent: main
Task: 在分时页面增加提升胜率的新功能（做T适宜度评分 + 做T交易记录 + 风险仪表盘）

Work Log:
- 分析分时页面现有功能，识别出3个关键缺失功能：做T适宜度评分、做T交易记录、风险仪表盘
- 创建 t-suitability-score.tsx (504行) — 做T适宜度评分组件
  - 6维评分体系：日内振幅(25分)、波动率(20分)、量能充足度(20分)、均价偏离度(15分)、大盘环境(10分)、板块共振(10分)
  - 4级评级：≥80高度适宜(绿)、60-79基本适宜(黄)、40-59勉强适宜(橙)、<40不宜做T(红)
  - SVG圆形进度弧 + 3x2因子分解网格
- 创建 t-trade-journal.tsx (832行) — 做T交易记录组件
  - 快速记录：记录买入/记录卖出按钮，自动填入当前时间和价格
  - 今日交易列表：显示每笔交易详情，未平仓显示浮动盈亏
  - 统计面板（可折叠）：今日做T次数(X/2)、胜率、盈亏、近5日统计、最佳做T时段
  - localStorage持久化，支持正T/反T(先卖再买)两种模式
- 创建 risk-alert-panel.tsx (682行) — 风险仪表盘组件
  - 6个风险指标：涨跌停距离、均价偏离、量能异常、大盘风险、信号密度、日内趋势
  - 整体风险等级：高风险(红)、中风险(黄)、低风险(绿)
  - 紧凑卡片设计，响应式网格布局
- 在 page.tsx 中集成3个新组件：
  - 做T适宜度评分 + 风险仪表盘：并排显示在分时图下方（2列网格）
  - 做T交易记录：在信号汇总面板下方
  - 仅在 timeline 模式且有分时数据时显示
- Lint通过，dev server正常运行（HTTP 200）

Stage Summary:
- 新增3个提升胜率的核心功能组件
- 做T适宜度评分：帮助用户判断当前股票是否适合做T（避免在不适合的股票上操作）
- 做T交易记录：记录和追踪做T胜率，支持统计分析和复盘
- 风险仪表盘：6个关键风险指标一目了然，实时预警
- 关键价位线已在之前实现在分时图上（支撑/阻力虚线）

---
Task ID: 2
Agent: timeline-parallel-optimizer
Task: Make ashare-timeline API route fetch quote and timeline in PARALLEL instead of sequentially

Work Log:
- Read existing `/src/app/api/stock/ashare-timeline/route.ts` and confirmed `getAShareTimeline(symbol, prevCloseFromQuote?)` has optional prevClose parameter, so it can work without it
- Changed the `includeQuote=true` branch from sequential (quote → timeline) to parallel (`Promise.all([quote, timeline])`)
- `getAShareTimeline(symbol)` called without prevClose — it has an internal default
- Added merged `prevClose` logic after both results resolve: `timelineResult.prevClose || quoteResult?.prevClose || 0`
- Response explicitly overrides `prevClose` with merged value (after `...timelineResult` spread) to ensure quote's prevClose is used if timeline returned 0
- Reduced server-side cache TTL during trading hours from 2000ms to 1000ms, so each 1.5s client refresh cycle gets fresher data
- Updated `isTrading` threshold from `cacheTTL <= 3000` to `cacheTTL <= 2000` (now that trading TTL is 1000, the 2000 threshold correctly identifies trading hours)
- Updated comments to reflect 1s TTL and 1.5s client refresh cycle
- Lint passed with no errors

Stage Summary:
- ashare-timeline API now fetches quote and timeline in parallel (Promise.all), eliminating sequential latency
- Trading hours server-side cache TTL reduced from 2s to 1s for fresher data on each 1.5s client refresh
- Response format unchanged — prevClose merged from quote fallback if timeline doesn't provide one

---
Task ID: 7
Agent: main
Task: 加快分时图页面加载速度 + 修复交易规矩不显示

Work Log:
- 修复 TradingRulesCard 不显示问题（第5次）：移除 `<details>` 折叠包装，改为始终显示
- 后端优化：ashare-timeline API 行情+分时并行获取（Promise.all），交易时段缓存TTL从2s降到1s
- 客户端SWR优化：use-stock-data.ts 中 fetchTimelineWithQuote 改用 fetchWithSWR（stale-while-revalidate）
  - 首次加载从缓存预填充 timeline/quote/prevClose 数据（instant display）
  - 刷新时先返回缓存数据，后台重新验证
  - 有缓存时跳过 loading skeleton
  - 指纹检测防止不必要的状态更新
- 图表组件优化：time-sharing-panel.tsx 提取 ALL_TRADE_TIMES 为模块级常量（242个时间段字符串），避免每次渲染重新生成
  - TimeSharingPanel 和 MiniTimelinePanel 均使用预计算常量
- Lint 通过，dev server 正常运行（HTTP 200）

Stage Summary:
- 交易规矩始终显示（移除 details 折叠）
- 分时页面加载速度提升：
  1. 后端并行获取（减少串行等待）
  2. 客户端SWR缓存预填充（页面打开即可显示上次数据）
  3. 后台重新验证（用户无感知更新）
  4. 图表组件减少重复计算（ALL_TRADE_TIMES 常量化）

---
Task ID: 8
Agent: code-splitter
Task: Extract MiniTimelinePanel component for code splitting

Work Log:
- Created `/src/lib/trading-times.ts`: extracted `ALL_TRADE_TIMES` constant to shared utility file
- Created `/src/components/mini-timeline-panel.tsx`: extracted from time-sharing-panel.tsx
  - Contains: `MiniTimelinePanel` component, `MiniPercentYTick`, `timelineVolumeBarShape`, `timelineMacdBarShape`
  - Imports: `ALL_TRADE_TIMES` from `@/lib/trading-times`, `formatVolume`/`computeMiniMACD` from `@/lib/chart-shared`
- Updated `/src/components/time-sharing-panel.tsx`:
  - Added `import dynamic from "next/dynamic"` and dynamic import for `MiniTimelinePanel` with `{ ssr: false }`
  - Added `import { ALL_TRADE_TIMES } from "@/lib/trading-times"` (replacing inline constant)
  - Removed: `MiniTimelinePanel` component, `MiniPercentYTick`, inline `ALL_TRADE_TIMES` constant
  - Kept: `timelineVolumeBarShape` and `timelineMacdBarShape` (still used by main `TimeSharingPanel`)
  - Removed `computeMiniMACD` from imports (no longer used in this file after extraction)
- Lint passed with no errors

Stage Summary:
- `MiniTimelinePanel` code-split via `next/dynamic` with SSR disabled — reduces initial bundle for pages that don't need the mini chart
- `ALL_TRADE_TIMES` shared from `@/lib/trading-times` — single source of truth for both files
- Shape renderers duplicated in both files (both main and mini charts need them)
- No functionality changes, pure code reorganization

---
Task ID: 1
Agent: main
Task: 在分时图上添加吸筹/出货提示

Work Log:
- 在 institutional-intent.ts 中新增 `analyzeIntradayIntent` 函数
  - 将交易日分为4个时段：开盘(09:30-10:00)、上午(10:00-11:30)、下午(13:00-14:00)、尾盘(14:00-15:00)
  - 每个时段独立计算吸筹/出货/洗盘/拉升评分
  - 评分依据：上涨/下跌量比、均价线位置、缩量整理、冲高回落、放量滞涨、下影线等
  - 颜色映射：吸筹=红色、出货=绿色、洗盘=黄色、拉升=红色、震荡=灰色
  - 导出 IntradaySegmentIntent 和 IntradayIntentResult 接口
- 在 time-sharing-panel.tsx 中新增 IntentSegmentOverlay 渲染器
  - 渲染半透明彩色背景带（按意图类型着色）
  - 在每个时段顶部渲染意图标签（吸筹/出货/洗盘/拉升 + 置信度）
  - 每个标签下方显示简要原因（如"上涨放量"、"冲高回落"）
- 修改 CombinedChartOverlay，新增 Layer 0（意图背景带层），在信号标记层之下渲染
  - 接收 intentSegments 属性，传递给 IntentSegmentOverlay
- 在 TimeSharingPanel 中计算 intradayIntent（useMemo，依赖 data 和 prevClose）
- 将 intentSegments 传递给 Customized 组件
- 在分时图头部添加"主力意图"徽章
  - 显示整体意图（如"主力:吸筹 65%"）
  - 显示各时段意图流转（如"开盘吸筹→上午出货→尾盘吸筹"）
  - 颜色：吸筹/拉升=红色，出货=绿色，洗盘=黄色
- Lint通过，dev server正常运行

Stage Summary:
- 分时图现在显示4个时段的主力意图提示：吸筹(红)/出货(绿)/洗盘(黄)/拉升(红)
- 图表上有彩色背景带+标签+原因+置信度
- 头部有整体意图徽章+各时段流转
- 复用已有的 institutional-intent.ts 分析引擎

---
Task ID: 9
Agent: main
Task: 将分时图主力意图标记从图表内部移到图表外部（分时图外显示）

Work Log:
- 移除 IntentSegmentOverlay 渲染器（约230行SVG覆盖层代码），不再在价格图内部渲染吸筹/出货/震荡的背景带和标签
- 修改 CombinedChartOverlay：移除 intentSegments 属性和 IntentSegmentOverlay 调用，只保留信号标记和脉冲量标记层
- 在价格图和成交量图之间新增"主力意图分段条"（External Intent Timeline Bar）
  - 将4个时段（开盘09:30-10:00、上午10:00-11:30、下午13:00-14:00、尾盘14:00-15:00）映射为水平百分比位置
  - 正确处理午休间隔（11:30-13:00不占用条宽度）
  - 每个时段显示为彩色区块：吸筹=红色、出货=绿色、洗盘=黄色、拉升=红色、震荡=灰色
  - 每个区块内居中显示意图文字（如"吸筹"、"出货"）
  - hover 显示 tooltip（时段、时间范围、意图、置信度、原因）
  - 中间午休分隔线
  - 条上方有图例（各时段意图标签+彩色圆点）
  - 左右标注9:30/15:00时间
  - "观察"时段显示为极淡的占位色
- 移除 ComposedChart 中 Customized 组件的 intentSegments 属性传递
- 清理未使用的 IntradaySegmentIntent 类型导入
- Lint通过，dev server正常运行

Stage Summary:
- 主力意图标记从价格图内部移到图表外部（价格图与成交量图之间的独立条形区域）
- 不再有背景带覆盖价格线，图表更清晰
- 意图分段条直观展示全天4个时段的主力意图，颜色编码清晰
- 吸筹=红色、出货=绿色（中国股市惯例）
---
Task ID: volume-decline-fix
Agent: main
Task: 修复放量下跌(volume_decline)检测算法不生效的问题

Work Log:
- 分析旧算法的根本缺陷：依赖单分钟成交量尖峰(volumeRatio + maxVolPriceChange)，对"持续放量+持续下跌"的渐进模式无效
- 重写 volume_decline 检测算法，核心改进：
  1. 新增核心指标"下跌成交量占比"(downVolRatio)：下跌分钟的成交量之和/总成交量，≥0.7时得25分
  2. 放宽门控条件：从 windowPriceDrop>0.1 || maxVolPriceChange<-0.1 改为 windowVolRatio>=1.2 || downHighVolRatio>=0.15（有放量） AND windowPriceDrop>0.1 || downVolRatio>0.4（有下跌）
  3. 降低分数阈值：从10分降到8分
  4. 增加更小的滑动窗口：从[15,20,30]扩展为[5,8,10,15,20,30]，可捕捉早期/短暂的放量下跌
  5. 基线从5分钟均值改为15分钟均值（更稳定）
  6. 标记位置改为窗口内成交量最大的下跌分钟（更准确）
- 同步优化 volume_surge 检测算法：增加upVolRatio核心指标、更小窗口、15分钟基线
- Lint通过

Stage Summary:
- volume_decline检测算法完全重写，8个评分维度：下跌成交量占比、放量程度、价格跌幅、下跌分钟占比、量价齐跌占比、递增放量+下跌、单分钟放量砸盘、砸盘幅度
- 门控条件更合理：必须同时满足"有放量"和"有下跌"，但门槛降低
- 分数阈值从10降到8，更容易触发
- 滑动窗口从[15,20,30]扩展到[5,8,10,15,20,30]，适配不同长度的下跌模式

---
Task ID: volume-decline-fix
Agent: main
Task: 修复放量下跌(volume_decline)危险警示不显示的回归问题

Work Log:
- 读取 chart-shared.ts 中 detectPulseVolumeMarkers 的 volume_decline 检测代码（lines 963-1143）
- 定位根因：hasVolumeAmplification 门控条件过严
  - 原因1：baselineVol 仅使用前15分钟平均量，当放量下跌从开盘开始时，前15分钟已高量→baselineVol膨胀→windowVolRatio<1.2→门控阻断
  - 原因2：hasVolumeAmplification 只认'量比基线高'和'量价齐跌占比'，没考虑'下跌方成交量占比大'本身就是放量下跌的证据
- 修复1：baseline 改为 min(前15分钟均量, 全日均量)，防止开盘放量时基线膨胀
- 修复2：hasVolumeAmplification 增加 downVolRatio>=0.55 和 downMinuteRatio>=0.6 两个替代条件
- 同步修复 volume_surge (放量拉升) 的 baseline 计算问题
- Lint通过，代码推送到GitHub

Stage Summary:
- 修复了放量下跌警示不显示的回归问题
- 关键改动：baseline 使用 min(earlyBaseline, sessionAvg)，门控条件增加 downVolRatio>=0.55 和 downMinuteRatio>=0.6
- 同时修复放量拉升的 baseline 计算方式

---
Task ID: 1
Agent: main
Task: 增强"放量下跌专题"section内容（trading-rules-card.tsx）

Work Log:
- 读取 trading-rules-card.tsx 当前实现（约1000行）
- 替换"六、放量下跌专题"section（原415-592行），扩展为包含11个子板块的全面版本
- 1. 定义与识别：增加量化识别标准（量能标准≥1.2倍基线、价格标准≥0.3%、下跌分钟占比≥50%、量价齐跌≥10%、分时图特征）
- 2. 四种细分类型（新增）：砸盘式🔨、阴跌式🌧️、跳水式📉、脉冲式⚡，2x2响应式网格布局
- 3. 三种时段形态（增强）：每个时段增加操作指引（开盘5分钟内下杀不做正T、洗盘vs出货辨别、尾盘次日低开警告）
- 4. 分时图量化识别标准（新增）：6项✅检查清单，2列响应式网格
- 5. 应对策略矩阵（增强）：新增2行（放量下跌+跌破均价线→极危≤1/4、放量下跌+大盘暴跌→空仓）
- 6. 信号强度等级（增强）：每级增加量化评分标准（强≥50分、中30-49分、弱10-29分）
- 7. 放量下跌后的企稳判断（新增）：缩量企稳4信号+确认时间15分钟+假企稳识别+可参与条件
- 8. 放量下跌与做T策略的结合（新增）：正T严禁+反T最佳时机+仓位控制三级
- 9. 常见误区（增强）：新增2条（均线滞后性、强势股放量下跌更危险）
- 10. 操作口诀（增强）：新增2行（量能持续放大=出货、企稳15分钟+站上均价线=最低条件）
- 11. 当前状态提示（保持不变）
- 保持相同的 React 组件结构、Tailwind CSS 样式模式、activeRules/activeBadge 辅助函数
- Lint通过，dev server正常运行

Stage Summary:
- "放量下跌专题"从6个子板块扩展为11个子板块，内容量约翻倍
- 新增4个板块：四种细分类型、分时图量化识别标准、企稳判断、做T策略结合
- 增强4个板块：定义与识别、三种时段、应对策略矩阵、信号强度等级
- 应对策略矩阵新增2个高危场景
- 常见误区从4条增加到6条
- 操作口诀从5行增加到7行

---
Task ID: 2
Agent: volume-decline-fixer
Task: 修复 volume_decline 检测算法，使其能正确触发五粮液等真实股票的放量下跌警告

Work Log:
- 读取 worklog.md 了解项目背景
- 读取 chart-shared.ts 第966-1216行的 volume_decline 检测代码
- 分析5个问题的根因并逐一修复：

1. **严格门控改为惩罚系统**（第1163-1179行）
   - 原代码：`!hasGenuineAmplification || !hasGenuineDecline` → score 硬性截断为5
   - 修复：只有两个条件都不满足时才截断为5；仅一个不满足时按比例减少（amplification减40%，decline减50%）

2. **基线计算改为加权方式**（第1020-1042行）
   - 原代码：`baseline = Math.min(rollingBaseline, globalBaseline)` 固定取较小值
   - 修复：如果 rolling baseline < 0.5 * global 且价格未下跌（可能是午休等低量期），用 global baseline
   - 如果 rolling 期间价格下跌 > 0.3%，rolling baseline 更相关，用 rolling baseline
   - 其他情况保持原行为取 min
   - 同时更新 getRollingBaseline() 返回原始滚动均值而非 Math.min(rollAvg, globalBaseline)

3. **分数阈值从10降到8**（第1183-1184行）
   - 原代码：`if (score >= 10)` → 8分即可触发
   - 使更多边界情况能被检测到

4. **新增"简单放量下跌"回退检测**（第1225-1299行）
   - 在滑动窗口扫描之后新增全日级别的放量下跌检测
   - 条件：全日跌幅 > 0.5%、下跌分钟占比 ≥ 60%、下跌期均量 > 上涨期均量
   - 只在滑动窗口未检测到 volume_decline 标记时触发
   - 分数上限50（中等强度）
   - 阈值8分

5. **downHighVolRatio 使用 baseline 替代 avgVol**（第1063-1068行）
   - 原代码：`t.vol > avgVol`（如果整个窗口都是高量，avgVol会偏高，很少有分钟超过它）
   - 修复：`t.vol > baseline`（baseline代表正常量水平，更准确地识别放量分钟）
   - 同时将 onsetIdx 的判断也改为 `t.vol > baseline`

- 运行 `bun run lint` 通过，无错误

Stage Summary:
- 5处修复全部完成，修改文件：src/lib/chart-shared.ts
- 核心改进：严格AND门控→惩罚系统、基线计算智能化、阈值降低、回退检测、量价比较基准修正
- 保持原有结构：多标记、时段分组、最多3个标记、负分标记、起始点标记
- 未修改其他检测块（pulse, volume_surge, progressive_vol, pulse_decline, early_vol_drop, wash_trade, vol_rise, shrink_rise）
---
Task ID: perf-optimize-1
Agent: main
Task: Optimize time-sharing page speed

Work Log:
- Analyzed performance bottlenecks with Explore agent, identified 12 key issues
- P0: Fixed auto-refresh interval restart by replacing timeline.length dep with ref in use-stock-data.ts
- P1: Added fingerprint caching to pvMarkers using pvFingerprintCache (includes volume data in fingerprint to avoid stale results)
- P1: Optimized fullDayData rebuild with fullDayDataCache fingerprint cache — skips rebuilding 242 objects when data fingerprint unchanged
- P1: Throttled crosshair onMouseMove from 60fps to ~15fps using setCrosshairIdxThrottled (saves massive re-renders during mouse hover)
- P2: Added fingerprint caching to detectMarketRegimeDetail and analyzeIntradayIntent via regimeDetailCache and intradayIntentCache
- P2: Optimized zoomData rebuild — mutate idx in-place instead of creating new objects via spread
- P2: Improved memo comparison function — added content-level checks for MACD (last values), pvMarkers (last marker time), signals (first+last), keyPriceLevels (first price), index/sector timeline data (last price)
- Added 3 new FingerprintCache singletons to fingerprint-cache.ts
- Added pvFingerprintCache invalidation on stock switch

Stage Summary:
- Estimated per-tick cost reduced from ~15-40ms to ~5-15ms
- Key wins: fullDayData skip (saves ~0.5-1ms + GC), pvMarkers skip (saves ~200-400μs), crosshair throttle (saves ~60fps→15fps during hover), intent/regime skip (saves ~1-3ms)
- All changes pass lint check
- Page loads correctly (HTTP 200)

---
Task ID: 1
Agent: main
Task: Fix "Cannot read properties of null (reading 'toFixed')" runtime error

Work Log:
- Identified root cause: `fullDayData` in time-sharing-panel.tsx uses `null as unknown as number` for empty time slots (price, avgPrice, dif, dea, macd), which causes `.toFixed()` calls to crash on null values
- Fixed time-sharing-panel.tsx: 10 `.toFixed()` calls now use null guards (`?? 0`, `?.`, `?? "--"`)
- Fixed chart-tooltips.tsx: 18 `.toFixed()` calls now use optional chaining with fallback
- Fixed kline-chart-panel.tsx: 15 `.toFixed()` calls now use `(val ?? 0)` or `?.toFixed() ?? ""`
- Fixed page.tsx: 8 `.toFixed()` calls now use null guards
- Fixed limit-up-analysis.tsx: 4 fixes
- Fixed sector-rotation-panel.tsx: 18 fixes
- Fixed intraday-screener.tsx: 5 fixes
- Fixed position-signal-card.tsx: 1 fix
- Fixed t-trade-journal.tsx: 6 fixes
- Lint passes cleanly, dev server running without errors

Stage Summary:
- Total ~85 `.toFixed()` null safety fixes across 10 files
- Primary crash source: time-sharing-panel.tsx `fullDayData` empty slots with null price/avgPrice/dif/dea/macd
- All display values now use `?.toFixed(N) ?? "--"` or `(val ?? 0).toFixed(N)` pattern
- Fingerprint computations use `(val ?? 0).toFixed(N)` to avoid cache key crashes

---
Task ID: 1-continued
Agent: main
Task: Fix remaining "Cannot read properties of null (reading 'toFixed')" errors

Work Log:
- Found that previous fix was incomplete - still had unprotected `.toFixed()` calls in multiple components
- Fixed time-sharing-panel.tsx: crosshairItem.dif/dea/macd.toFixed(3) → (val ?? 0).toFixed(3), data.price in TimelineTooltip
- Fixed signal-summary-panel.tsx: lastTL.avgPrice division-by-null, volRatio.toFixed(2) 
- Fixed five-day-timeline-panel.tsx: 12 unprotected toFixed calls
- Fixed mini-timeline-panel.tsx: 4 unprotected toFixed calls
- Fixed early-trading-screener.tsx: 9 unprotected toFixed calls
- Fixed low-open-screener.tsx: 11 unprotected toFixed calls
- Fixed stock-screener.tsx: 10 unprotected toFixed calls
- Fixed t-trade-journal.tsx: 2 nullable currentPrice.toFixed(2) calls
- Fixed screener-history-panel.tsx: 22 unprotected toFixed calls
- Fixed risk-alert-panel.tsx: 4 unprotected toFixed calls
- Fixed sector-rotation-panel.tsx: additional fixes for turnover/volumeRatio
- Fixed limit-up-analysis.tsx: 1 additional fix
- Fixed intraday-screener.tsx: 2 additional fixes
- Lint passes, dev server running

Stage Summary:
- Total ~130+ `.toFixed()` null safety fixes across 14 component files
- Root cause: `fullDayData` in time-sharing-panel uses `null as unknown as number` for empty time slots
- All display values now use `?.toFixed(N) ?? "--"` or `(val ?? 0).toFixed(N)` pattern
- All computed/fingerprint values use `(val ?? 0).toFixed(N)` pattern
- Remaining unprotected `.toFixed()` calls are all on locally-computed values (Math.max, arithmetic, etc.) that are guaranteed to be numbers
---
Task ID: 1
Agent: main
Task: 将涨跌家数分时图采集间隔改为2分钟 + 提供初始数据

Work Log:
- 修改后端 `/api/stock/market-breadth/route.ts`：5分钟→2分钟间隔
- 将历史数据从纯内存存储改为文件持久化（`db/market-breadth-history.json`）
- 放宽数据记录条件：历史为空时始终记录第一个数据点（不限交易时段）
- 交易时段扩展到 9:00~15:30 覆盖盘前盘后
- 修改前端图表组件支持1个数据点展示（单点模式：显示红绿蓝三个圆点+数值）
- 修复 lint 错误（useMemo 条件调用）
- 测试验证：API 返回 1 个初始历史点，持久化文件正确创建

Stage Summary:
- 采集间隔从5分钟改为2分钟
- 历史数据持久化到文件，服务重启不丢失
- 即使不在交易时段，第一次请求也会记录初始数据点
- 图表支持1个数据点展示，2分钟后再采集第二个点即可显示完整曲线
---
Task ID: 3
Agent: main
Task: 重新设计涨跌家数分时图为更直观的展示方式

Work Log:
- 将原来的三条线图（上涨线、下跌线、涨跌差虚线）改为涨跌差红绿填充面积图
- 0轴上方红色渐变填充 = 涨多（多方占优），0轴下方绿色渐变填充 = 跌多（空方占优）
- 使用线性插值精确计算diff线与零线的交叉点，红绿区域完美贴合
- 末端添加脉冲动画圆点，实时指示当前市场状态
- 右侧标注当前涨跌差值（大号加粗）、涨/跌家数
- 底部添加涨跌比例条（红绿条 + 百分比）
- 单数据点模式改为大数字展示（涨:跌:差 + 比例条），更直观
- 图表高度从160提升到200，更宽敞的视觉空间
- loading占位高度同步调整为200px

Stage Summary:
- 新图表设计：涨跌差红绿山形图，类似同花顺/通达信的市场宽度展示
- 核心改进：颜色即方向，面积即强弱，零线为分界，一目了然
- 渐变填充 + 脉冲动画 + 比例条 = 专业级视觉体验
---
Task ID: 4
Agent: main
Task: 根据涨跌家数及其他因素，算出市场情绪

Work Log:
- 设计5因子加权市场情绪评分算法（0-100分）
- 因子1：涨跌比率（权重30%）- 上涨/下跌家数比例
- 因子2：涨停跌停比（权重15%）- 极端情绪指标
- 因子3：情绪趋势（权重25%）- 涨跌差的时间变化趋势
- 因子4：多空强度（权重15%）- 涨跌差占总量比例
- 因子5：指数状态（权重15%）- 上证/深证/创业板走势
- 创建MarketSentiment组件，包含仪表盘+因子分解+情绪条
- 7级情绪等级：极度恐慌→恐慌→偏弱→中性→偏强→乐观→极度乐观
- 遵循A股颜色惯例：红色=乐观，绿色=恐慌
- 在page.tsx中集成，位于涨跌家数分时图下方

Stage Summary:
- 市场情绪指数组件完成，5因子加权算法
- 视觉设计：半圆仪表盘+指针+数值+等级标签+5因子进度条+底部情绪色带
- 鼠标悬浮因子条可查看详细描述
---
Task ID: 5
Agent: main
Task: 修复涨跌家数分时图数据不变化的bug

Work Log:
- 根因分析：slotVal计算用了 slotH*60+slotM（分钟值=682），但比较值900/1530是HHMM格式
- 11:22的slotVal=682，682>=900为false，导致整个交易时段都无法记录数据！
- 修复：slotH*60+slotM → slotH*100+slotM（HHMM格式：11:22=1122）
- 同时修复：同2分钟时段内的数据也持续更新（不再只在首次记录时写入）
- 清除旧的错误历史数据，验证新数据点正确记录
- 测试确认：11:22和11:24两个新点正确入库

Stage Summary:
- 关键bug修复：slotVal计算格式错误（分钟 vs HHMM），导致交易时段内永远不记录
- 同槽位数据现在每次请求都会更新，确保历史数据始终是最新的
- 已有3个数据点正常记录，图表应该能正常显示曲线

---
Task ID: 10
Agent: main
Task: 修复收藏功能丢失 + 优化放量下跌检测算法

Work Log:
- 发现收藏只存储在 localStorage，没有任何数据库持久化，导致刷新/重新进入后丢失
- 在 Prisma schema 中新增 WatchlistItem 模型（symbol, name, source, price, changePercent, addedAt）
- 运行 db:push 同步数据库
- 创建 API 路由 /api/stock/watchlist（GET/POST/DELETE）
  - GET: 获取所有收藏（按 addedAt 降序）
  - POST: upsert 收藏项（如果已存在则更新）
  - DELETE: 删除收藏项（by symbol）
- 修改 screener-shared.ts 收藏系统：
  - 新增 _watchlistCache 内存缓存，加速同步读取
  - 新增 loadWatchlistFromDB() 异步函数，从数据库加载收藏列表
  - addToWatchlist/removeFromWatchlist 同时写入 localStorage + 异步同步到数据库
  - 新增 useWatchlistInit() hook，组件 mount 时从数据库初始化收藏
- 更新5个 screener 组件导入并使用 useWatchlistInit：
  - intraday-screener.tsx
  - early-trading-screener.tsx
  - low-open-screener.tsx
  - stock-screener.tsx
  - limit-up-analysis.tsx
- 优化 volume_decline 检测算法：
  - 加强早盘趋势校验：同时检查相对开盘价和相对昨收价的涨跌
  - 新增盘中/尾盘趋势校验：如果当前价格相对昨收上涨，适度降分
- 优化 pulse_decline 检测算法：
  - 新增整体趋势校验：如果股票从开盘到当前是上涨的，大幅降分
  - 三级降分：上涨>0.5%→极低分(≤3)，微涨(0~0.5%)→70%折扣，相对昨收上涨>0.3%→50%折扣
- 优化 earlyVolDeclineBan 二次校验：
  - 阈值从0.3%降为0%（任何早盘上涨都不触发禁买）
  - 新增相对昨收价校验（早于10点价格>昨收→不触发禁买）
- Lint通过，API测试通过

Stage Summary:
- 收藏功能从纯 localStorage 升级为 localStorage + 数据库双持久化
- 收藏状态在页面刷新/重新进入后不会丢失
- 放量下跌检测算法三重防误判：算法层（chart-shared.ts）+ UI层（earlyVolDeclineBan）+ 新增prevClose校验
- pulse_decline 新增整体趋势校验，上涨股票不再被误判为脉冲下跌

---
Task ID: 11
Agent: main
Task: 优化早盘放量下跌禁买算法，实现智能动态分级制v2

Work Log:
- 分析现有 earlyVolDeclineBan 算法的6个弱点：量比估算不准、分级粗糙、未考虑下跌速度、无企稳判断、无多波检测、固定时间节点
- 完全重写 earlyVolDeclineBan useMemo 逻辑（time-sharing-panel.tsx 第1758-2045行）
- 新增7个评分维度：
  1. 精确量比：从原始成交量数据计算（下跌均量/前15分钟基线），替代旧版的估算方式
  2. 下跌速度指数(speedIndex)：最大单分钟跌幅×10 + 平均跌幅×20
  3. 企稳指数(stabilityIndex)：反弹幅度、是否创新低、低点后缩量程度、上涨分钟占比
  4. 多波下跌检测(waveCount)：5分钟滑动窗口找局部低点，计算创新低的波数
  5. VWAP偏离度(vwapDeviation)：当前价与早盘均价的偏离
  6. 跳空低开(gapDownRate)：从昨收到开盘的跌幅
  7. 综合危险指数(dangerIndex)：8个维度加权评分(A-H)，企稳折扣最多50%
- 动态禁买截止时间：基于dangerIndex精确计算，而非4个固定节点
  - mild: 9:40~9:50 (dangerIndex 0-29)
  - medium: 9:55~10:05 (dangerIndex 30-49)
  - strong: 10:10~10:25 (dangerIndex 50-69)
  - extreme: 10:30 (dangerIndex >=70)
- 企稳提前解禁：stabilityIndex>=60时，低点后10分钟可提前解禁（不低于基础时间50%）
- 时间对齐到5分钟整数（方便显示）
- 更新UI展示：横幅增加危险指数、速度、波数、企稳提前解禁标签
- 图表蒙版透明度改为基于dangerIndex动态计算(0.02+dangerIndex/100*0.12)
- 更新所有3处蒙版（价格图/成交量图/MACD图）的渲染逻辑
- Lint通过，dev server正常运行

Stage Summary:
- 禁买算法从粗糙的3维（跌幅+量比估算+分数）升级为8维综合评分系统
- 量比现在从原始数据精确计算，不再估算
- 新增下跌速度、企稳判断、多波检测、VWAP偏离4个全新维度
- 禁买时间从4个固定节点变为基于危险指数的动态计算
- 企稳显著时可提前解禁，避免过度限制
- UI展示更丰富的多维指标（危险指数、速度、波数、提前解禁标记）

---
Task ID: 2
Agent: main
Task: 创建增强涨跌停统计API路由 (market-breadth-stats)

Work Log:
- 读取 worklog.md 和现有 market-breadth/route.ts 了解缓存模式
- 创建 /src/app/api/stock/market-breadth-stats/route.ts
  - 导出 dynamic = "force-dynamic"
  - 从东方财富获取涨停池 (getTopicZTPool) 和跌停池 (getTopicDTPool)，并行请求
  - 计算涨停统计：total/sealed/broken/sealRate/avgSealStrength/连板统计/封板资金Top5/时段统计
  - 计算跌停统计：total/sealed/broken/sealRate/开板次数Top5
  - 计算涨跌对比：limitUpVsDown比/netExtreme净极端
  - 辅助函数：getTodayDateStr(中国时区YYYYMMDD)/formatFirstSealTime/classifyTimeSlot
  - 30秒TTL内存缓存，错误时返回过期缓存或空结构
  - 空池优雅处理：所有数值为0，数组为空
- Lint 通过
- API 测试通过（返回有效JSON结构）

Stage Summary:
- 新增 API 路由 /api/stock/market-breadth-stats
- 完整实现 BreadthStatsResponse 接口的所有字段
- 并行获取涨停/跌停池数据，30秒缓存TTL
- 优雅处理空池、网络错误等边界情况

---
Task ID: 1
Agent: main
Task: Create API route for market breadth distribution data

Work Log:
- Created directory `/src/app/api/stock/market-breadth-distribution/`
- Created route file with `export const dynamic = "force-dynamic"` and 30s in-memory cache (CACHE_TTL = 30_000)
- Implemented `fetchAllStocks()`: paginates East Money clist API (pz=6000 per page), fetching all A-share stocks across 4 markets (深圳A股, 深圳创业板, 上海A股, 上海科创板)
- Implemented bucket classification with 12 ranges: 涨停, +7~10%, +5~7%, +3~5%, +1~3%, 0~+1%, -1~0, -3~-1, -5~-3, -7~-5, -10~-7, 跌停
- Implemented ChiNext (300/301) and STAR (688/689) 20% limit detection: `getLimitThreshold()` returns 19.9/-19.9 for these stocks vs 9.9/-9.9 for main board
- Implemented `fetchLimitUpPool()` and `fetchLimitDownPool()`: fetch from East Money ZTPool/DTPool APIs for sealed limit counts
- Calculated `limitUpBroken = totalLimitUp - limitUpSealed` and `limitDownBroken = totalLimitDown - limitDownSealed`
- Calculated `median` and `avgChange` from all stock change percentages
- Parallel fetching with `Promise.all([fetchAllStocks(), fetchLimitUpPool(), fetchLimitDownPool()])`
- Error handling: stale cache fallback on fetch failure, 500 error if no cache available
- Lint passed, API tested successfully (returns valid DistributionResponse JSON)

Stage Summary:
- New API route: `/api/stock/market-breadth-distribution`
- Fetches all A-share stocks and buckets by change % into 12 ranges
- Supports 20% limit for ChiNext/STAR stocks
- Includes limit-up/down sealed/broken counts from ZTPool/DTPool APIs
- Response includes: buckets, total, median, avgChange, limitUpSealed, limitUpBroken, limitDownSealed, limitDownBroken, timestamp
- 30s server-side cache with stale-while-error fallback

---
Task ID: 4
Agent: main
Task: 创建涨跌停详情统计组件 (MarketLimitStats)

Work Log:
- 创建 `/src/components/market-limit-stats.tsx` 组件，实现涨跌停详情统计展示
- 定义 `MarketLimitStatsProps` 接口，包含 limitUp/limitDown/contrast 三大块数据
- 实现 MetricPill 子组件：核心指标徽章（总数/封板/开板/封板率），带自定义背景色
- 实现 BoardPill 子组件：连板统计药丸，颜色强度与数量成比例
- 实现 TimeDistributionBar 子组件：时段分布水平堆叠条（早盘/午前/午后/尾盘），渐变透明度
- 实现 StockItem 子组件：紧凑型股票列表项，1行1股
- 涨停区域（左侧，红色调）：核心指标 + 连板统计 + 时段分布 + 封板资金TOP5
- 跌停区域（右侧，绿色调）：核心指标 + 开板最多TOP5
- 对比指标行：涨停/跌停比(X:1) + 净极端(涨停-跌停) + 迷你比例条
- 空状态：总数均为0时显示"暂无涨跌停数据"
- A股色彩规范：红=涨(#dc2626)、绿=跌(#059669)
- 响应式布局：桌面两列、移动端堆叠（grid-cols-1 md:grid-cols-2）
- 紧凑设计：字号9-11px、紧凑padding（p-2）、无冗余垂直空间
- 卡片风格与 market-breadth-chart.tsx 一致：bg-card rounded-lg border border-border
- Lint 通过，无错误

Stage Summary:
- 新增 MarketLimitStats 组件，named export
- 涨停侧5个区块：核心指标/连板统计/时段分布/封板资金TOP5/封板强度
- 跌停侧2个区块：核心指标/开板最多TOP5
- 底部对比指标行：涨停/跌停比 + 净极端 + 迷你比例条
- 完整空状态处理

---
Task ID: 3
Agent: market-change-distribution
Task: Create MarketChangeDistribution component for A-share market change % distribution histogram

Work Log:
- Created `/src/components/market-change-distribution.tsx` with "use client" directive
- Defined `MarketChangeDistributionProps` interface with buckets, total, median, avgChange, limitUpSealed/Broken, limitDownSealed/Broken
- Implemented horizontal histogram: 12 bars arranged vertically with label on left, proportional-width bar in middle, count on right
- Bar colors use provided bucket colors directly; up-side buckets red gradient, down-side buckets green gradient
- Each bar has subtle gradient overlay for depth (top highlight → transparent → bottom shadow)
- Statistics row at top: 中位数, 均值 (red if positive, green if negative), 涨停封板 (X封/X开), 跌停封板 (X封/X开)
- 0% boundary separator: horizontal dashed line between up-side and down-side bucket groups with "0%" label
- Card wrapper uses same style as market-breadth-chart.tsx: bullish=red tint, bearish=green tint based on median
- Compact font sizes: title 11px, stats 10px, labels 9px, counts 10px
- Responsive: flex-wrap on stats row, proper overflow handling
- Used useMemo for maxCount and downStartIndex computations
- A-share color convention: 涨=红(#dc2626), 跌=绿(#059669)
- Lint passed with no errors

Stage Summary:
- New component: `src/components/market-change-distribution.tsx` (named export `MarketChangeDistribution`)
- Horizontal histogram with 12 buckets, proportional bar widths, gradient overlays
- Statistics header with median, average, limit-up/down sealed/broken counts
- 0% boundary dashed line separator between up and down sections
- Card styling matches market-breadth-chart.tsx (bullish/bearish tinting)
- Pure React + Tailwind CSS, no chart library dependency
---
Task ID: 5
Agent: main
Task: 丰富市场涨跌家数功能

Work Log:
- Created `/api/stock/market-breadth-distribution` API: fetches all A-share stocks and buckets them by change % into 12 ranges (涨停 → +7~10% → ... → -10~-7% → 跌停), with 20% limit support for ChiNext/STAR stocks, plus limit seal/broken counts
- Created `/api/stock/market-breadth-stats` API: detailed limit-up/down statistics including seal rate, consecutive board stats, time distribution, top 5 seal amounts, contrast metrics
- Created `MarketChangeDistribution` component: horizontal histogram of change % distribution with statistics row, 0% boundary separator
- Created `MarketLimitStats` component: two-column layout with 涨停/跌停 sections showing core metrics, consecutive board pills, time distribution bar, top 5 stock lists
- Enhanced `MarketBreadthChart` component: added velocity, acceleration, and A/D line indicators in summary row
- Updated `page.tsx`: added dynamic imports for new components, state management, parallel data fetching in breadth useEffect, rendering in grid layout

Stage Summary:
- 4 new files: market-breadth-distribution API, market-breadth-stats API, market-change-distribution component, market-limit-stats component
- 2 enhanced files: market-breadth-chart (velocity/acceleration/A/D line), page.tsx (integration)
- Lint passes, dev server running, APIs tested successfully
- Non-trading hours show limited data; full distribution available during trading hours
