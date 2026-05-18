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
