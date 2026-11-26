---
Task ID: 1
Agent: main
Task: Restructure trading-rules-card with sidebar submenu navigation + add all missing content

Work Log:
- Analyzed existing trading-rules-card.tsx (1374 lines, 7 horizontal tabs, 12 numbered sections)
- Identified 6 missing content areas: 差价底线, 市场环境识别, 买点信号, 卖点信号, 标的筛选, 技术指标参数
- Redesigned UI from horizontal tabs to sidebar+content panel layout (like strategy admin panel)
- Organized 18 topics into 7 navigation groups with color-coded categories
- Added all 6 missing content sections with detailed trading rules
- Preserved all existing content and pvMarker real-time highlighting
- Mobile responsive: horizontal scrollable tag bar on small screens
- Lint check passed, dev server running without errors

Stage Summary:
- Rewrote trading-rules-card.tsx with 18 topics in 7 groups
- New sections: 标的筛选, 差价底线, 买点信号, 卖点信号, 行情识别, 技术指标
- Layout: Left sidebar (desktop) / horizontal tags (mobile) + right content panel
- All pvMarker-triggered highlights preserved
- Component exports same props: autoExpanded, pvMarkers

---
Task ID: 2
Agent: main
Task: 实现最佳卖点检测算法并在分时图上显示 (v6.0)

Work Log:
- 分析现有信号系统：买点有4个核心因子(factor_41, 41_5, 42, 43)，卖点只有1个(factor_44)，严重不对称
- 设计3个对称核心卖点因子：
  1. factor_45: 放量上涨卖点 — 对称于factor_41(放量下跌买点)，评分制7条件
  2. factor_45_5: 缩量滞涨 — 对称于factor_41_5(缩量止跌)，3条件+2补充条件
  3. factor_44: 次高点放量卖出 — 已存在，对称于factor_43(次低点缩量买入)
- 在t-strategy.ts中实现factor_45（评分制7条件：MACD红柱缩短+放量+近顶+冲高回落+倒V顶+上涨减速+迷你倒V顶）
- 在t-strategy.ts中实现factor_45_5（缩量+涨幅收窄+近顶条件）
- 更新chart-shared.ts：添加6个新条件定义(macd_pos_near_peak, vol_expand_sell, price_near_highest, second_high_point, vol_expand_at_second_high, rising_deceleration, vol_shrink_rise) + 2个BUILT_IN_CUSTOM_FACTORS(factor_45, factor_45_5)
- 更新time-sharing-panel.tsx：isKeySellSignal扩展包含"放量上涨卖点"和"缩量滞涨"
- 更新page.tsx版本号v5.9→v6.0
- Lint检查通过，Agent Browser验证卖点信号正确渲染

Stage Summary:
- 新增factor_45(放量上涨卖点,medium)和factor_45_5(缩量滞涨,medium)两个核心卖点因子
- 卖点信号体系从1个核心因子扩展到3个，与买点对称
- 卖点在分时图上显示为绿色倒三角+"卖"标签，核心卖点获得更大标记和发光效果
- 版本更新至v6.0

## Task 2: Save Custom Strategy Factors to DB

**Date**: 2026-03-04
**Status**: Completed

### Summary
Implemented persistence of custom strategy factors (CUSTOM_COMBINED) to the database instead of localStorage, ensuring that strength/tMode edits persist across page refreshes.

### Changes Made

#### 1. API Route (`/src/app/api/stock/strategy-factors/route.ts`)
- Added 4 built-in custom factors (factor_31-34) to `DEFAULT_FACTOR_SEEDS` with category `CUSTOM_COMBINED`, so they auto-migrate into DB
- Extended PUT handler to support `tMode`, `timeWindow`, `description`, `signalType`, `category`, `name` fields
- Extended POST handler to support `tMode` and `timeWindow` fields
- GET already returns all factors including CUSTOM_COMBINED (no change needed)
- DELETE already works (no change needed)

#### 2. Chart Shared (`/src/lib/chart-shared.ts`)
- Added `_dbId` optional field to `CustomFactorDefinition` interface (stores actual DB record ID, which differs from engine-compatible id for built-in factors like factor_31)
- Added `dbRecordToCustomFactorDefinition()` helper that converts a DB record with `category=CUSTOM_COMBINED` to `CustomFactorDefinition`, parsing `params` JSON for conditions/isBuiltIn/dataSource
- Built-in factors get their engine-compatible ids (factor_31-34) via name-based mapping

#### 3. Strategy Admin Panel (`/src/components/strategy-admin-panel.tsx`)
- `CustomFactorsTab` now loads from DB via `fetch("/api/stock/strategy-factors")` filtering by `category === "CUSTOM_COMBINED"`
- Replaced localStorage-based save with DB API calls (PUT for updates, POST for creates, DELETE for deletes)
- Added inline Select dropdowns for strength (强/中/弱) and tMode (正T/反T) on both built-in and user factor cards
- Built-in factors cannot be deleted, but CAN have strength/tMode edited
- User factors can be fully edited and deleted
- Replaced `custom-factors-changed` event with `onCustomFactorsChanged` callback prop
- localStorage still written as fallback for backward compatibility
- Added `_dbId` field to local `CustomFactorDefinition` interface
- `StrategyAdminPanel` now accepts `onCustomFactorsChanged` prop

#### 4. Page.tsx (`/src/app/page.tsx`)
- Replaced localStorage loading with `loadCustomFactorsFromDB()` that fetches from `/api/stock/strategy-factors` and converts DB records
- Removed `custom-factors-changed` event listener
- Added `onCustomFactorsChanged={loadCustomFactorsFromDB}` prop to `StrategyAdminPanel`
- Falls back to localStorage if DB fetch fails

### API Verification
- GET: Returns 4 CUSTOM_COMBINED factors with conditions in params JSON ✓
- PUT: Updates strength/tMode/enabled fields ✓
- POST: Creates new CUSTOM_COMBINED factors ✓
- DELETE: Deletes user-created factors ✓

### Lint
- `bun run lint` passes cleanly ✓

---
Task ID: 1
Agent: main
Task: 优化做T卖点策略 (v6.1)

Work Log:
- 修正factor 4 "跌破均价线"：原逻辑在价格跌破VWAP时触发卖出=卖低，违反高抛原则。改为价格在VWAP上方但开始回落时触发（均价线引力预警）
- 降级factor 10 "放量下挫"：原逻辑强度为medium/strong，改为默认weak，且增加cur.price > cur.avgPrice条件，均线下方不触发
- 新增factor 46 "均线引力卖点"：v6.1核心卖点，评分制6条件（偏离幅度+回落确认+近5根最高点回落+量能配合+MACD红柱缩短+近80根顶部区域），≥4分触发，极偏离≥3分
- 新增factor 47 "冲高减速见顶"：3连涨+涨幅递减+缩量+均线上方+近顶≤2%，比缩量滞涨更早的顶部信号
- 修正factor 12 "冲高回落"：增加cur.price > cur.avgPrice条件，确保只在均线上方触发
- 新增卖点信号去噪逻辑：3根内只保留最强卖点信号，5根内弱卖点被强/中卖点压制移除
- 更新chart-shared.ts：添加3个新条件key(vwap_deviation_sell, pullback_confirm, rally_deceleration) + 2个BUILT_IN_CUSTOM_FACTORS(factor_46, factor_47)
- 更新page.tsx版本号v6.0→v6.1
- Lint检查通过

Stage Summary:
- 核心修正：3个卖点因子(4,10,12)改为只在VWAP上方触发，符合做T高抛原则
- 新增2个卖点因子(46,47)：均线引力卖点(strong)+冲高减速见顶(medium)
- 新增卖点去噪后处理：减少近距离重复卖点信号
- 版本更新至v6.1

---
Task ID: 3
Agent: main
Task: 修复均线禁买禁卖标注在默认大小分时图中不显示的问题

Work Log:
- 调查VwapBanAnnotations组件不显示的原因：原逻辑依赖formattedGraphicalItems识别VWAP线点
- 原方法1使用yAxis.scale.invert()区分价格线与VWAP线，但价格和均价接近时区分失败
- 原方法2/3也有各种边界情况导致VWAP点提取失败
- 重构vwapAnnotations计算逻辑：不再尝试从formattedGraphicalItems识别哪条线是VWAP线
- 新策略：找到任意一条包含payload（含price和avgPrice）的线，使用yAxis.scale()直接计算VWAP和价格的像素Y坐标
- 过滤只保留hasData=true的有效数据点，降低最少点数阈值从10到5
- 改进pxPerPercent计算：3级回退策略确保色带宽度计算正确
- Agent Browser验证：比亚迪/宁德时代/中国平安三只股票均正确显示禁止买卖/禁买/禁卖标注

Stage Summary:
- 根因：原VWAP点提取逻辑在formattedGraphicalItems中识别VWAP线时失败
- 修复：改用yAxis.scale()从任意线payload直接计算VWAP像素坐标，不再依赖识别线类型
- 所有三种标注(禁止买卖/禁买/禁卖)在默认大小和放大视图中均正常显示

---
Task ID: 4
Agent: main
Task: 加快分时页面加载速度

Work Log:
- 分析页面加载瓶颈：8个主要瓶颈（串行useMemo链、并发API请求、fullDayData重建等）
- 延迟非关键API请求：market-breadth-distribution延迟10s（爬取5000+股票数据），指数数据3s→5s，板块数据2s→5s
- 增大刷新间隔：1.5s→3s（减少50%重渲染频率，对UX影响极小）
- 优化quote-only tick：检测数据长度未变时（仅价格跳动），用useDeferredValue延迟信号计算，图表先渲染价格
- 增加FingerprintCache的hasCachedValue/getCachedValue方法（为earlyVolDeclineBan短路做准备）
- Lint检查通过，Agent Browser验证页面功能正常

Stage Summary:
- 核心优化：延迟重API请求(breadth-distribution 10s)、增大刷新间隔(1.5→3s)、quote-only延迟信号计算
- 非关键请求全部延迟到关键数据加载完成后：指数5s、板块5s、分布数据10s
- 页面首次渲染速度显著提升：减少7+并发请求→关键路径只加载timeline数据

---
Task ID: 5
Agent: main
Task: 恢复市场涨跌家数分时图到历史简单SVG实现方式

Work Log:
- 对比git历史：4834226(原始版本) vs 当前复杂版本
- 原始版本：固定viewBox(600x160)，简单line path，无外部依赖，2个数据点即可渲染
- 当前版本：ResizeObserver+ALL_TRADE_TIMES+Catmull-Rom曲线+渐变填充+脉冲动画+速度/加速度计算，662行
- 当前版本问题：过于复杂，依赖ResizeObserver测量容器宽度、ALL_TRADE_TIMES时间映射、preserveAspectRatio="none"导致变形
- 重写market-breadth-chart.tsx：恢复原始简单SVG方式，保留额外props(limitUp/limitDown/shUp/shDown/szUp/szDown)
- 新实现特点：固定viewBox(640x180)、简单line path、面积填充、涨跌差虚线、比例条、支持单数据点显示
- Lint检查通过
- Agent Browser验证：市场涨跌家数分时图正确渲染，SVG图表区域可见，数据(2447涨/2685跌/144平)正确显示

Stage Summary:
- 从662行复杂实现恢复到250行简单SVG实现
- 移除了ResizeObserver、ALL_TRADE_TIMES依赖、Catmull-Rom曲线、脉冲动画等复杂特性
- 保留了额外props支持(涨停/跌停/沪深分开)和比例条显示
- 图表在浏览器中正确渲染和显示

---
Task ID: 6
Agent: main
Task: 修复选股页面切换时空白问题 - 切换到选股页面时内容为空需要刷新

Work Log:
- 分析问题根因：dynamic import + 条件渲染导致组件每次切换都全新挂载，state初始化为null
- fetchScreenerData虽然会检查缓存，但async函数需要等待resolve，导致短暂空白期
- 更关键的是：初始result=null，即使缓存命中也需要等待useEffect触发fetchScreenerData才能设置数据
- 修复方案：在useState初始化时从client-cache读取缓存数据，确保组件首次渲染就有数据
- 修复StockScreener：useState(() => getCachedData(cacheKey))初始化result
- 修复IntradayScreener：同样添加缓存初始化
- 修复EarlyTradingScreener：同样添加缓存初始化
- 修复LimitUpAnalysis：同样添加缓存初始化
- 修复SectorRotationPanel：同样添加缓存初始化，loading初始值从true改为false
- 移除所有fetchScreenerData/fetchData中多余的setIsFromCache(false)（紧跟在setIsFromCache(true)之后，会覆盖缓存标记）
- Lint检查通过
- Agent Browser验证：所有5个选股页面切换时数据即时显示，不再需要刷新

Stage Summary:
- 根因：组件卸载后重新挂载，useState初始值null导致空白，需要等异步fetchScreenerData完成
- 修复：5个screener组件（StockScreener/IntradayScreener/EarlyTradingScreener/LimitUpAnalysis/SectorRotationPanel）添加缓存初始化
- 效果：切换页面时数据从内存缓存立即渲染，0延迟显示
---
Task ID: 2
Agent: main
Task: Align market breadth chart X-axis with stock time-sharing chart

Work Log:
- Analyzed the current market-breadth-chart.tsx which used proportional X-axis (index-based spacing)
- Analyzed the stock time-sharing chart (time-sharing-panel.tsx) which uses ALL_TRADE_TIMES (242 slots)
- Added timeToSlot() function to map time strings to A-share trading day slots (0-241)
- Changed chart computation to use slot-based X positioning instead of index-based
- Added standard A-share time ticks (09:30, 10:00, ..., 15:00) matching the stock chart
- Added vertical grid lines at key times and lunch break separator
- Simplified accumulation logic (removed sub-minute HH:MM:SS, now uses HH:MM matching server resolution)
- Fixed critical bug: parseInt("00") returns 0 (falsy) causing || 30 fallback to treat "10:00" as "10:30"
- Simplified curve splitting (removed complex morning/afternoon split, just draw through all points)
- Verified via browser: X-axis shows correct 10 A-share time labels at correct positions
- Verified alignment: stock chart and breadth chart use identical time labels

Stage Summary:
- Market breadth chart X-axis now aligns with stock time-sharing chart
- Both charts show identical 10 A-share trading time labels: 09:30-15:00
- Lunch break gap (11:30→13:00) is ~2.4px, consistent with stock chart behavior
- Critical bug fixed: timeToSlot() now uses Number.isNaN() instead of || for parseInt fallback
- Chart renders with smooth curves, gradient fills, glow effects, and pulse animations
---
---
Task ID: 1
Agent: main
Task: Fix market breadth chart to always show time-sharing format

Work Log:
- Identified root cause: chart computation returned null when data.length < 2, causing fallback to static card view
- Changed chart computation to work with data.length >= 1 instead of data.length >= 2
- Removed the single-data-point static card fallback entirely
- When only 1 data point: shows full time-sharing chart with X/Y axes, grid, single data point dot with pill labels, pulse animation
- When ≥2 data points: shows smooth curves, area fills, all labels as before
- Browser verified: chart always shows time-sharing format with correct A-share trading time X-axis
- Browser verified: chart persists after page reload

Stage Summary:
- Market breadth chart now ALWAYS shows time-sharing format when any data is available
- No more static card view for single data points
- Smooth curves only appear when ≥2 points (graceful degradation)
- X-axis always shows standard A-share trading times
---
---
Task ID: 1
Agent: main
Task: 市场涨跌家数分时图开始和结束时间与股票分时图对齐

Work Log:
- 读取了 market-breadth-chart.tsx (自定义SVG实现)、time-sharing-panel.tsx (recharts实现)、trading-times.ts (242格时间框架)
- 分析发现：原自定义SVG使用固定viewBox(640x280)和独立padding(px=46,pr=10)，与recharts分时图的margin({left:2,right:82})+YAxis(width:55)不对齐
- 决定方案：将市场涨跌家数分时图从自定义SVG改写为recharts ComposedChart，使用与股票分时图相同的margin和XAxis配置
- 重写了 market-breadth-chart.tsx：
  - 使用 recharts ComposedChart + ResponsiveContainer 替代自定义SVG
  - margin={{ top: 20, right: 82, left: 2, bottom: 20 }} (left/right与分时图一致)
  - XAxis: dataKey="idx" type="number" domain={[0,241]} 与分时图相同
  - YAxis: width={55} 与分时图左YAxis一致
  - buildFullDayData() 构建242格全日模板数据
  - BreadthChartOverlay (Customized组件) 渲染自定义曲线/填充/标记
  - 保留了Catmull-Rom平滑曲线、涨跌线间渐变填充、发光效果、药丸标签、脉冲动画
  - 保留了客户端数据积累逻辑
- 修复了lint错误(移除了不必要的useRef渲染时赋值)
- 通过agent-browser验证：图表正确渲染，时间轴与分时图对齐，所有视觉特性正常

Stage Summary:
- 市场涨跌家数分时图改用recharts渲染，与股票分时图使用相同的margin和XAxis配置
- 时间轴完美对齐(09:30-15:00)，数据点位置与分时图一致
- 图表始终显示(即使无数据也显示坐标轴和网格)
- 所有视觉效果保留：Catmull-Rom曲线、渐变填充、发光、药丸标签、脉冲动画

---
Task ID: 1
Agent: main
Task: 分时图的功能，除了标签功能外，其他功能倒视图也要有

Work Log:
- 分析主图(time-sharing-panel.tsx line 3676-4407)的所有功能元素
- 识别需要镜像到倒影图(line 3573-3860)的图形元素（不含纯文字标签）：
  1. 均价线 avgPrice Line (黄色虚线 #ca8a04) - 倒影图缺失
  2. 支撑/阻力位 keyPriceLevels (无label ReferenceLine) - 倒影图缺失
  3. 5日最低线 recentDayLows (粗渐变线，无pill标签) - 倒影图缺失
  4. 早盘禁买区蒙版 earlyVolDeclineBan (斜线条纹，无文字) - 倒影图缺失
  5. VWAP三层色带 (红黄绿三色区域，无文字) - 倒影图缺失
  6. 午休竖线 Lunch break divider - 倒影图缺失
  7. 买入最佳时期绿色蒙版 (无badge文字) - 倒影图缺失
  8. 十字光标竖线 Crosshair - 倒影图缺失
- 倒影图已有保留元素：CartesianGrid、XAxis/YAxis、Area price、Line price、ReferenceLine(prevClose/MA5/highest/lowest)、最高/最低pill标签(用户之前要求)
- 用Edit工具替换整个ComposedChart块(line 3577-3861)，按主图渲染顺序添加所有图形元素
- 关键技术点：
  * 倒影图整体被scaleY(-1)翻转，所有图形元素自动上下镜像
  * 5日最低线渐变ID使用inv-recentLowGrad-${i}避免与主图冲突
  * 禁买区蒙版clipPath ID使用inv-ban-clip避免冲突
  * 买入最佳时期蒙版渐变ID使用inv-bestBuyGrad避免冲突
  * pill标签保留scale(1,-1)反翻转保持文字可读
- Lint检查通过
- Agent Browser验证：
  * 登录密码888888，切换到"分时"tab
  * DOM检查确认倒影图包含6个path(Area+priceLine+avgPrice Line+3个VWAP色带)
  * DOM检查确认倒影图包含10个line(网格+昨收+最高最低+5日最低线4层)
  * 对比主图(6 path, 55 line)：核心图形元素完全匹配，主图多出的line都是CombinedChartOverlay信号标记/文字标签背景(用户要求除外的标签功能)
  * VLM视觉分析确认倒影图与主图元素一一对应(黄色虚线均价线、红色水平线、彩色VWAP色带)
  * 浏览器控制台无错误

Stage Summary:
- 倒影图新增8类图形元素：均价线、支撑/阻力位、5日最低线、早盘禁买区蒙版、VWAP三层色带、午休竖线、买入最佳时期蒙版、十字光标
- 倒影图与主图pathCount完全相同(6 vs 6)，核心图形元素100%一一对应
- 倒影图保留最高/最低pill标签(用户之前要求)，其他文字标签按用户要求不镜像
- 条件渲染元素(买入最佳时期需股票下跌、禁买区需触发earlyVolDeclineBan)在满足条件时自动显示

---
Task ID: 2
Agent: main
Task: 第一次进页面，默认显示分时图

Work Log:
- 读取 /home/z/my-project/src/hooks/use-stock-data.ts line 71-142
- 找到 DEFAULT_CHART_MODE 常量定义在 line 80: `const DEFAULT_CHART_MODE: ChartMode = "5d-timeline"`
- 将 DEFAULT_CHART_MODE 从 "5d-timeline" 改为 "timeline"（分时图）
- 发现 line 139 的 localStorage 恢复逻辑只接受 "kline" 和 "5d-timeline"，遗漏了 "timeline"
  原代码: `if (saved === "kline" || saved === "5d-timeline") return saved as ChartMode;`
  修复为: `if (saved === "kline" || saved === "5d-timeline" || saved === "timeline") return saved as ChartMode;`
  （修复前：用户选过"分时"后刷新会回到5d-timeline默认值，无法恢复分时模式）
- Lint检查通过
- Agent Browser验证：
  * 清除 localStorage 的 lastChartMode 键，模拟首次进入
  * reload 页面
  * DOM检查确认"分时"tab selected="true"，"五日"tab selected="false"
  * DOM检查确认页面显示"分时倒影"和"VOL"内容
  * VLM视觉分析确认：当前选中"分时"tab，显示倒影图和VOL成交量图表
  * 浏览器控制台无致命错误（仅recharts容器宽高警告，非阻塞）

Stage Summary:
- DEFAULT_CHART_MODE 从 "5d-timeline" 改为 "timeline"，首次进页面默认显示分时图
- 修复 localStorage 恢复逻辑遗漏 "timeline" 的bug，用户选择分时图后刷新能正确恢复
- 验证通过：清除缓存后reload，默认选中"分时"tab，显示倒影图+VOL
Task ID: 6
Agent: main
Task: 为什么展示的还是老版本呢（重新实现分时倒影tab）

Work Log:
- 问题根因：上一session对 use-stock-data.ts / page.tsx / time-sharing-panel.tsx 的改动没有保存到磁盘，git log确认最新commit 4a1d868不包含mirrored相关代码，工作区只有tool-results文件改动
- 重新实现全部改动：
  1. use-stock-data.ts:
     - LAST_MIRRORED_KEY 常量
     - DEFAULT_CHART_MODE 改回 "timeline"（之前也丢了）
     - localStorage恢复逻辑加 "timeline"（之前也丢了）
     - mirrored state + setMirrored callback + 持久化
     - return 暴露 mirrored, setMirrored
  2. time-sharing-panel.tsx:
     - props解构加 mirrored = false
     - props类型加 mirrored?: boolean
     - timeSharingPropsEqual 浅比较加 prev.mirrored !== next.mirrored
     - 主图 yAxisId="price" YAxis 加 reversed={mirrored}
     - 主图 yAxisId="percent" YAxis 加 reversed={mirrored}
     - 成交量/MACD YAxis 不加reversed（保持正常方向）
  3. page.tsx:
     - import 加 FlipVertical2
     - 解构加 mirrored, setMirrored
     - 图表tab改造：value={mirrored ? "timeline-mirror" : chartMode}
     - onValueChange：点"分时倒影"→setMirrored(true)+确保chartMode=timeline；点其他→setMirrored(false)+changeChartMode
     - 新增 TabsTrigger "分时倒影" 放在"分时"和"K线"之间
     - TimeSharingPanel 传 mirrored={mirrored}
- git commit 保存（防止再次丢失）：commit 19f0dbd "feat: 分时图倒影作为图表tab选项(放在K线前) + 默认分时图"
- Lint检查通过
- Agent Browser验证：
  * 图表tab确认：五日|分时|分时倒影|K线 ✓
  * 正常分时Y轴：1138.29→y=1013(下), 1188.29→y=753(上) [高价在上]
  * 分时倒影Y轴：1138.29→y=549(上), 1188.29→y=809(下) [低价在上，完全翻转] ✓
  * 成交量/MACD轴未翻转（保持正常方向）✓
  * 切到K线后mirrored重置为"0" ✓
  * 刷新页面后"分时倒影"tab持久化选中，localStorage lastMirrored=1 ✓
  * VLM视觉对比确认：两张图价格曲线方向相反，Y轴价格排列顺序相反 ✓
  * 浏览器控制台无错误 ✓

Stage Summary:
- 重新实现了"分时图倒影"作为图表tab第4个选项（放在K线前面）
- 之前丢失的改动已全部恢复并git commit保存
- mirrored作为独立state持久化到localStorage，切换tab时自动联动
- 翻转通过recharts YAxis的reversed属性实现，文字保持正向可读
- 仅翻转价格YAxis(price+percent)，成交量/MACD不受影响

---
Task ID: 7
Agent: main
Task: 第一次进入页面默认进入分时倒影页面

Work Log:
- 修改 use-stock-data.ts 的 mirrored state 初始化逻辑：
  * 原：localStorage.getItem('lastMirrored') === "1"（无记录时返回false）
  * 新：无记录时(null)返回true（默认开启倒影），有记录则尊重用户选择
  * SSR时也返回true保持一致
- git commit 保存：commit 83000d5
- Lint检查通过
- Agent Browser验证：
  * 清除localStorage的lastMirrored，模拟首次进入
  * reload后默认选中"分时倒影"tab ✓
  * Y轴翻转生效：1138.29(低价)→y=549(上), 1188.29(高价)→y=809(下) ✓
  * 切到"分时"后localStorage变为"0"，刷新后仍选中"分时"（用户选择被尊重）✓
  * 浏览器控制台无错误 ✓

Stage Summary:
- 首次进入页面（localStorage无lastMirrored记录）默认显示"分时倒影"
- 用户操作过后（切换tab）选择持久化，刷新后尊重用户选择
- 实现方式：mirrored初始化时检查localStorage是否为null，null则默认true

---
Task ID: 8
Agent: main
Task: 去掉分时页面的分时倒影图

Work Log:
- 查看time-sharing-panel.tsx结构，发现分时页面内嵌了一个独立的倒影图(Panel 0)：
  * line 3576-3873: 用 CSS transform: scaleY(-1) 翻转的 ComposedChart
  * line 3860-3863: "⇅ 分时倒影"标签
  * line 3864-3865: 底部渐变遮罩
- 这是早期实现的嵌入倒影图，现在已有独立的"分时倒影"tab（通过reversed={mirrored}实现），嵌入图多余
- 删除 Panel 0 整块代码（line 3576-3873，约299行），保留 Panel 1（主图）
- 删除后验证：
  * grep确认无 scaleY/分时倒影/Inverted/Panel 0 残留代码
  * ComposedChart数量从4个减为3个（主图+成交量+MACD）
- Lint检查通过
- Agent Browser验证：
  * 正常"分时"tab：页面无"⇅"标签，无嵌入倒影图，只有一个主分时图 ✓
  * "分时倒影"tab功能正常：价格Y轴翻转生效（1138.29低价在上y=549）✓
  * VLM视觉确认：正常分时页面顶部没有小型倒影图，只有一个主分时图 ✓
  * 浏览器控制台无错误 ✓
- git commit + push 完成：commit 028b049

Stage Summary:
- 移除分时页面内嵌的倒影图(Panel 0)，约299行代码
- 独立的"分时倒影"tab功能保留不受影响
- 分时页面现在只有主图+成交量+MACD三个图表区域，更简洁

---
Task ID: 9
Agent: main
Task: 分时倒影图上不要显示因子标签

Work Log:
- 分析因子标签来源：time-sharing-panel.tsx 的 CombinedChartOverlay 组件渲染所有信号标签
  * Layer 0: VWAP禁止买卖标注（禁止买卖/禁买/禁卖）
  * Layer 1: 分时因子signal markers & labels（MACD死叉/跌破均价线/量价背离等）
  * Layer 2: 选股标记pulse/volume markers（强脉冲/放量下跌等）
  * Layer 3: 优先信号（高开卖出/放量下跌买点）
  * Layer 4: 展开气泡
- 修改方案：让 CombinedChartOverlay 接收 mirrored prop，mirrored时只渲染Layer 0(VWAP标注)，跳过Layer 1-4(因子标签和PV标记)
- 修改内容：
  * CombinedChartOverlay props解构加 mirrored
  * 在early return后加mirrored分支：只渲染VwapBanAnnotations
  * <Customized component={CombinedChartOverlay} /> 加 mirrored={mirrored} prop
- Lint检查通过
- Agent Browser验证：
  * 正常分时模式：39个信号文字，包含完整因子标签(MACD死叉/跌破均价线/量价背离/放量下跌买点/高开卖出等) ✓
  * 分时倒影模式：18个信号文字，只剩VWAP标注(禁止买卖/禁买/禁卖)，无因子标签 ✓
  * 对比factorLabels：正常模式38个(含因子)，倒影模式5个(仅MA5/5日最低/均线上方高抛区参考线标签) ✓
  * 浏览器控制台无错误 ✓
- git commit + push 完成：commit aaa2f28

Stage Summary:
- 分时倒影图不再显示因子信号标签（MACD死叉/跌破均价线/量价背离/放量下跌买点等）
- 分时倒影图不再显示PV选股标记（强脉冲/放量下跌等）
- 保留VWAP禁止买卖标注（非因子标签，是均线参考标注）
- 保留参考线标签（MA5/5日最低/均线上方高抛区）
- 正常分时模式不受影响，因子标签完整显示

---
Task ID: 10
Agent: main
Task: 分时倒影需要显示买卖点

Work Log:
- 上一个Task移除了倒影图所有因子标签，用户反馈需要保留买卖点
- 分析CombinedChartOverlay的signalResult结构：
  * signalElements: 常规因子信号（MACD死叉/跌破均价线/量价背离等中等强度因子）
  * prioritySignalElements: 核心买卖点（放量下跌买点/高开卖出/次低点缩量买入/放量上涨卖点/次高点放量卖出/均线引力卖点等strong核心信号）
  * pvPlacedLabels: PV选股标记（强脉冲/放量下跌等）
  * bubbleElements: 展开气泡
- 修改mirrored分支：从"只渲染VWAP标注"改为"渲染VWAP标注 + prioritySignalElements(核心买卖点)"
- 跳过signalElements(常规因子)和pvPlacedLabels(PV选股标记)
- Lint检查通过
- Agent Browser验证（reload后）：
  * 倒影模式显示的买卖点：高开卖出(强)/放量下跌买点×3(强)/放量上涨卖点(强)/次低点缩量买入×3(强)/次高点放量卖出+1(强) ✓
  * "MACD死叉+1(强)"是"放量下跌买点"组合信号的副reason，作为买点显示（正确行为）✓
  * 倒影模式不显示常规因子（跌破均价线/量价背离/J线超买回落等）✓
  * 倒影模式不显示PV选股标记（强脉冲/放量下跌等）✓
  * 浏览器控制台无错误 ✓
- git commit + push 完成：commit 3dba15e

Stage Summary:
- 分时倒影图现在显示核心买卖点信号（prioritySignalElements）
- 不显示常规因子标签（signalElements）和PV选股标记（pvPlacedLabels）
- 保留VWAP禁止买卖标注
- 买卖点包括：放量下跌买点/缩量底部买点/次低点缩量买入/高开卖出/放量上涨卖点/次高点放量卖出/均线引力卖点/冲高减速见顶/缩量滞涨

---
Task ID: 11
Agent: main
Task: 显示的买卖点标签不要把分时图遮挡了，优化一下

Work Log:
- 问题：倒影模式下买点在图表上方（低价在上）、卖点在下方，但标签仍按正常模式方向偏移（买点往下、卖点往上），导致标签都落在图表中部的曲线区域，遮挡曲线
- 修改 computeTimelineSignalElements 函数，添加 mirrored 参数：
  1. 函数签名加 mirrored: boolean = false
  2. labelY 计算翻转：mirrored时买点标签往上放(m.y - offset)，卖点标签往下放(m.y + offset)
  3. 核心买点渲染(isKeyBuySignalR && isBuy)：triOffset 在mirrored时为-20，三角/连接线/文字都往上偏移
  4. 核心卖点渲染(isKeySellSignalR && !isBuy)：triOffset 在mirrored时为-20，三角/连接线/文字都往下偏移
  5. 其他strong信号(高开卖出等)连接线方向：mirrored时翻转y1/y2的isBuy判断
- 调用处传mirrored：computeTimelineSignalElements(..., mirrored)
- Lint检查通过
- Agent Browser验证：
  * 倒影模式：买点"买"标签在y=575(顶部)，卖点"卖"标签在y=898(底部)，标签集中在图表边缘 ✓
  * VLM视觉确认：标签未遮挡价格曲线，位于曲线区域下方/边缘 ✓
  * 正常分时模式不受影响：买点标签在下方、卖点在上方 ✓
  * 浏览器控制台无错误 ✓
- git commit + push 完成：commit ff7e40e

Stage Summary:
- 倒影模式下买卖点标签方向翻转：买点标签往上（图表顶部边缘），卖点标签往下（图表底部边缘）
- 核心买点/卖点的三角标记、连接线、文字都相应翻转方向
- 标签不再遮挡翻转后的价格曲线
- 正常分时模式渲染逻辑不变

---
Task ID: 12
Agent: main
Task: 如果标签与标签重合，标签就往对方反方向显示

Work Log:
- 分析computeTimelineSignalElements的标签放置逻辑：
  * 原有9种放置尝试：默认位置→左右偏移→更大左右偏移→垂直偏移→缩短文本→缩短文本+偏移
  * 默认方向：正常模式买点往下、卖点往上；倒影模式买点往上、卖点往下
  * 缺陷：标签重合时只做左右/垂直偏移，不会翻转到反方向
- 修改LabelPlan接口：新增 labelFlipped: boolean 字段
- 修改labelY计算逻辑：同时计算默认方向labelY和反方向flippedY
  * flippedY = 默认方向的相反侧（买点默认往下→反方向往上，卖点默认往上→反方向往下）
- 新增"尝试2: 反方向"放置策略（紧随默认位置之后）：
  * 默认位置重合时，尝试反方向位置
  * 成功则设置 isFlipped=true，记录翻转状态
- 更新assignedLabels.set和默认赋值，传递labelFlipped字段
- 修改4处渲染分支的连接线逻辑，统一使用"基于标签实际位置"的方式确定y1/y2：
  * y2 = (标签中心y < 锚点y) ? 标签底边 : 标签顶边 — 自动连接到离锚点最近的标签边
  * y1 = 核心买/卖点：翻转时从锚点(m.y)出发，未翻转时从三角出发
  * y1 = 其他strong/medium信号：基于标签位置决定从锚点上边还是下边出发
  * 这种方式同时兼容正常/倒影/翻转三种状态，无需复杂的mirrored×isBuy×flipped组合判断
- Lint检查通过
- Agent Browser验证：
  * 倒影模式：标签无重叠，连接线正确，方向合理 ✓
  * 正常分时模式：VLM确认"部分买卖点标签方向异常（买点在上方、卖点在下方）"——这正是反方向翻转生效的证据 ✓
  * 翻转后的标签连接线仍正确指向标记点 ✓
  * 浏览器控制台无错误 ✓

Stage Summary:
- 标签重合时，自动翻转到反方向显示（买点标签从下方翻到上方，卖点标签从上方翻到下方）
- 翻转优先级仅次于默认位置，优先于左右偏移
- 连接线使用基于实际位置的智能连接，确保翻转后连接线仍正确
- 正常模式和倒影模式均生效
- git commit + push 完成

---
Task ID: 13
Agent: main
Task: 标签又和分时线重合了，优化一下，可以把指向标签的线延长

Work Log:
- 问题诊断：标签放置只检测标签间重叠(overlapsAny)，未检测与分时价格曲线的重叠，导致标签压在曲线上
- 新增曲线重叠检测函数 overlapsCurve(rect)：
  * 遍历所有 x 落在标签横向区间内的 priceLineData 点，精确检测纵向重叠（非采样，避免漏检波动）
  * 额外在标签横向区间内做最多20点插值采样，覆盖曲线点稀疏区间
  * CURVE_PAD=4 安全间距
- 新增综合检测 overlapsAnyOrCurve = overlapsAny || overlapsCurve
- 重写放置策略（17级尝试），所有尝试改用 overlapsAnyOrCurve：
  * 尝试1: 默认位置
  * 尝试2: 反方向(flippedY)
  * 尝试3: 默认方向加大偏移(±labelH+6)
  * 尝试4: 反方向加大偏移
  * 尝试5-6: 左右偏移(默认Y)
  * 尝试7-8: 左右偏移(反方向Y)
  * 尝试9-10: 更大左右偏移(默认Y)
  * 尝试11-12: 更大左右偏移(反方向Y)
  * 尝试13-14: 垂直偏移(±2*labelH+6)
  * 尝试13b-14b: 极端垂直偏移(±4*labelH+12，用于边缘标签逃离曲线)
  * 尝试15-17: 缩短文本(默认Y/左右偏移/反方向Y)
- 修复缓存污染问题：
  * overlayCache是模块级单例，Fast Reload后旧指纹仍命中，返回旧放置结果
  * 在fp中加 OVERLAY_FP_VERSION 版本号，代码变更时bump版本强制重算
  * 在fp中加 mirrored 标记，正常/倒影模式不再共享缓存
- 延长连接线：所有4处渲染分支连接线改为基于标签实际位置的智能连接
  * 核心买/卖点：y1 从锚点圆边缘出发(±dotR)，y2 连到标签离锚点最近的边
  * 其他strong/medium信号：y1 从标记边缘出发，y2 连到标签最近边
  * 反方向(flipped)标签的连接线用 strokeDasharray="3 2" 虚线，视觉区分
- Lint检查通过
- Agent Browser验证（客观eval + VLM双重验证）：
  * 正常模式：14个真实信号标签，标签间重叠0对 ✓，曲线重叠1个(曲线剧烈波动区域的边缘案例)
  * 倒影模式：7个核心买卖点标签，标签间重叠0对 ✓
  * VLM视觉确认：标签未压在曲线上，连接线清晰且足够长 ✓
  * 浏览器控制台无错误 ✓
- git commit + push 完成

Stage Summary:
- 新增曲线重叠检测，标签放置同时避开标签和分时曲线
- 17级放置策略，包含反方向/加大偏移/极端逃离/缩短文本等
- 修复模块级缓存污染问题（版本号+mirrored标记）
- 连接线延长且基于实际位置智能连接，反方向标签用虚线区分
- 标签间重叠完全消除（0对），曲线重叠从3个降到1个（剧烈波动区域）

---
Task ID: 14
Agent: main
Task: 分时倒影页面让5日最低点的标签新增虚线指向他，不要和其他标签重合

Work Log:
- 分析现有5日最低点渲染：recentDayLows Customized组件在line 4088-4202渲染5日最低水平线（渐变红）+ 红色pill标签"▼5日最低 MM/DD 价格"，pill直接贴在线上（y=lineY）
- 问题：pill贴在线上，可能与附近的买卖点信号标签重叠；且用户要求新增虚线指向标签
- 设计方案：将pill渲染从recentDayLows Customized移到CombinedChartOverlay（可访问所有信号标签位置labelRects和分时曲线priceLineData进行重叠避让），pill始终偏离5日最低线，并用虚线连接线指向5日最低线
- 实现步骤：
  1. 修改computeTimelineSignalElements返回值：新增labelRects和priceLineData字段，供外部使用
  2. 新增computeRecentLowPill辅助函数：
     - 接收recentDayLows, offset, yAxisMap, labelRects, priceLineData
     - 始终把pill偏离5日最低线（不再贴在线上）
     - 偏离方向：优先选择空间更大的一侧（lineY到图表顶部/底部的距离），避免越界
     - 5级候选位置：preferred小偏移(±12px) → other side小偏移 → preferred大偏移(±2*PILL_H) → other side大偏移 → 兜底位置
     - 每个候选位置用overlapsAnyOrCurve检测（标签重叠+曲线重叠），还要做边界检查
     - 始终绘制虚线连接线（strokeDasharray="3 2", strokeWidth=1.3, #dc2626）从pill靠线侧边到5日最低线
     - 在5日最低线连接点处绘制红色圆点（r=2.5, #dc2626, white stroke）强调指向位置
  3. 修改CombinedChartOverlay：
     - 接收recentDayLows和offset props
     - 在overlayCache.compute回调内调用computeRecentLowPill（使用sr.labelRects和sr.priceLineData）
     - 若sr为null（无信号），自行从formattedGraphicalItems提取priceLineData
     - 在mirrored分支和normal分支都渲染recentLowPill（Layer 5顶层）
     - 更新early-return条件：!signalResult && pvPlacedLabels.length===0 && !vwapAnnotations && !recentLowPill
  4. 修改buildOverlayFingerprint：在fp末尾加`:rl=${recentLowsKey}`（recentDayLows的date+low），缓存失效
  5. bump OVERLAY_FP_VERSION: "v4-curve-avoid" → "v5-lowpill-dash"
  6. 修改<Customized component={CombinedChartOverlay}>：传recentDayLows={recentDayLows}
  7. 修改recentDayLows Customized：移除pill渲染（rect+text+glow），只保留5日最低水平线渲染
- Lint检查通过
- Agent Browser验证（贵州茅台/比亚迪/中国平安三只股票 + 正常/倒影两种模式）：
  * 贵州茅台（倒影）：5日最低线Y=102，pill在Y=121（线下方），虚线Y=114→102长12px ✓
  * 比亚迪（倒影）：5日最低线Y=97，pill在Y=116（线下方），虚线Y=109→97长12px，12个信号标签0重叠 ✓
  * 中国平安（倒影）：5日最低线Y=91，pill在Y=110（线下方），虚线Y=103→91长12px，14个信号标签0重叠 ✓
  * 中国平安（正常）：5日最低线Y=445（底部），pill在Y=416（线上方），虚线Y=433→445长12px ✓
  * VLM视觉确认：虚线连接线存在，标签不与其他标签重叠，布局清晰 ✓
  * 浏览器控制台无错误 ✓
- git commit + push 完成

Stage Summary:
- 5日最低点标签始终偏离5日最低线显示，新增红色虚线（strokeDasharray="3 2"）从标签指向5日最低线
- 5日最低线上有红色圆点标记连接点位置，强调虚线指向
- 标签避让所有买卖点信号标签（labelRects）和分时曲线（priceLineData），0重叠
- 偏离方向智能选择空间更大的一侧，避免标签越出图表边界
- 5级候选位置 + 兜底位置，保证标签始终可见
- 正常模式和倒影模式均生效
- OVERLAY_FP_VERSION升级到v5-lowpill-dash，缓存正确失效

---
Task ID: 1
Agent: full-stack-developer
Task: 给选股器加记忆功能

Work Log:
- 读取5个选股器组件现状：low-open 已有 result 持久化但缺 filters；其他4个组件只用 initialCache 内存缓存，刷新后丢失
- stock-screener.tsx (智能选股):
  * 新增常量 LAST_FILTERS_KEY = "stock-screener-last-filters" 和 LAST_RESULT_KEY = "stock-screener-last-result"
  * filters state 改为函数初始化从 localStorage 恢复（用 {...DEFAULT_FILTERS, ...parsed} 合并防止字段缺失）
  * result state 改为函数初始化从 localStorage 优先读取，回退到 initialCache
  * 新增 useEffect 在 filters 变化时持久化到 localStorage
  * 在 fetch 成功 setResult(data) 后追加 localStorage 写入 result
  * 修正 sectorInput 初始化从 DEFAULT_FILTERS.sector 改为 filters.sector，保证与恢复后的 filters 同步
- intraday-screener.tsx (分时选股):
  * 新增常量 LAST_FILTERS_KEY/LAST_RESULT_KEY = "intraday-screener-last-filters/result"
  * filters/result state 改为函数初始化从 localStorage 恢复
  * 新增 useEffect 持久化 filters
  * fetch 成功后追加 localStorage 写入 result
- early-trading-screener.tsx (早盘选股):
  * 新增常量 LAST_FILTERS_KEY/LAST_RESULT_KEY = "early-screener-last-filters/result"
  * filters/result state 改为函数初始化从 localStorage 恢复
  * 新增 useEffect 持久化 filters
  * fetch 成功后追加 localStorage 写入 result
- limit-up-analysis.tsx (涨停回踩):
  * 新增常量 LAST_RESULT_KEY = "limit-up-screener-last-result" 和 LAST_FILTER_LEVEL_KEY = "limit-up-screener-last-filter-level"
  * result state 改为函数初始化从 localStorage 恢复，回退到 initialCache
  * filterLevel state 改为函数初始化从 localStorage 读取（Number(saved)），默认30
  * 新增 useEffect 持久化 filterLevel（用 String(filterLevel)）
  * fetch 成功后追加 localStorage 写入 result
- low-open-screener.tsx (低开选股):
  * 已有 LAST_RESULT_KEY 和 result 持久化逻辑保留
  * 新增常量 LAST_FILTERS_KEY = "low-open-last-filters"
  * filters state 改为函数初始化从 localStorage 恢复
  * sectorInput 初始化改为 filters.sector || ""，保证与恢复后的 filters 同步
  * 新增 useEffect 持久化 filters
- 所有 localStorage 读写都用 try/catch 包裹防止 SSR/quota 异常
- 所有 useState 初始化都加 typeof window === "undefined" 检查防止 SSR 报错
- 没有修改任何 UI 布局，只加记忆逻辑
- 没有破坏现有 saveScreenerResults/getCachedData/fetchWithSWR 逻辑
- 运行 `bun run lint` 通过，无错误

Stage Summary:
- 5个选股器组件全部加上 localStorage 记忆功能
- 刷新页面后能恢复上次的筛选条件（filters/filterLevel）和结果（result）
- key 命名统一规范：{component}-last-{filters|result|filter-level}，各组件独立无冲突
- stock-screener 的 sectorInput 和 low-open 的 sectorInput 同步从恢复后的 filters 初始化，避免输入框与实际筛选值不一致
- limit-up-analysis 用 String/Number 适配 number 类型的 filterLevel 持久化
- bun run lint 通过

---
Task ID: 4-5
Agent: full-stack-developer
Task: 新增涨停回踩选股页面 + 记忆功能

Work Log:
- 阅读 worklog.md / page.tsx / limit-up-analysis.tsx / low-open-screener.tsx / limit-up-pullback API / client-cache.ts 理解模式
- 创建 `src/components/limit-up-pullback-screener.tsx`（~1090 行），独立、功能更丰富的多维度筛选器
  - 类型对齐 API 返回的 `PullbackStock` / `PullbackResult`
  - 多维度筛选条件：回踩深度阈值(0-100)、距涨停最大天数(1-15)、最大市值上限(0-10000亿)、最小换手率(0-50)、量比下限(0-10)、排除ST复选框
  - 使用 shadcn/ui: Card, Button, Badge, Table, Input, Skeleton, Separator, Slider, Checkbox, Label, Collapsible, Tooltip
  - lucide-react 图标: Target, TrendingUp/Down, RefreshCw, Loader2, AlertCircle, ArrowDownRight, ArrowUpDown, ChevronUp/Down, BarChart3, Clock, Activity, Filter, SlidersHorizontal, Database, RotateCcw, Zap, PieChart
  - 筛选条件 Collapsible 包裹，默认展开，标题显示当前条件摘要 + 已调整徽章
  - 表格 14 列：代码/名称、涨停日、涨停涨幅、涨停价、起涨点、当前价、今日涨跌、回踩深度(带进度条+颜色标签)、距涨停、最大回撤、换手率、市值、量比、走势(mini SVG)
  - 表头 SortableHead 组件支持升降序切换（12 个数值字段可排序）
  - 行点击调用 onSelectStock(symbol) 跳转
  - 顶部统计卡片：扫描总数、符合筛选数、深度回踩个数(≥70%)、平均回踩深度
  - 刷新按钮强制刷新(?refresh=1)，使用 cachedFetch 10 分钟客户端缓存
  - 加载 Skeleton，错误状态显示错误信息+重试，空结果友好提示
  - 显示数据时间戳 + 服务端缓存徽章 + 客户端缓存徽章
  - 记忆功能：LAST_RESULT_KEY + LAST_FILTERS_KEY 双 localStorage 保存，filters/result 变化时持久化
  - 表格容器 `max-h-[600px] overflow-y-auto` + 自定义滚动条（支持深色模式）
  - 容器 `overflow-x-auto` 移动端横向滚动
  - 添加策略说明卡片（含 4 档回踩深度图例）
- 修改 `src/app/page.tsx`:
  - 第 12 行附近新增 dynamic import: `LimitUpPullbackScreener`，loading skeleton 文案 "加载涨停回踩选股..."
  - 第 59 行 lucide-react 导入列表追加 `Target`
  - 第 69 行 pageMode 联合类型追加 `"limit-up-pullback"`
  - 第 918 行菜单按钮数组追加 `"limit-up-pullback"`
  - 第 927 行菜单标签: `{mode === "limit-up-pullback" && <><Target className="w-3 h-3" />回踩选股</>}`
  - 第 999 行条件渲染链路追加 `pageMode === "limit-up-pullback" ? (<LimitUpPullbackScreener onSelectStock={...} />) : ...`
- 运行 `bun run lint`，exit 0，无错误

Stage Summary:
- 新增独立组件 `limit-up-pullback-screener.tsx`，与已有 `limit-up-analysis.tsx`（单维度回踩深度按钮筛选）并存，提供 6 维度精细筛选 + 表头排序 + 记忆功能
- 后端 API `/api/stock/limit-up-pullback` 未改动，直接复用
- 记忆功能完整：filters + result 都用 localStorage 保存，刷新页面立即恢复筛选条件和结果
- 客户端 10 分钟缓存 + 服务端 10 分钟缓存 + 强制刷新按钮(?refresh=1)
- lint 通过，dev server 编译成功

---
Task ID: 15
Agent: full-stack-developer
Task: 丰富回踩选股页面功能（12 类增强）

Work Log:
- 读取 worklog.md（Task ID 4-5）与现有 limit-up-pullback-screener.tsx（1092 行）了解结构与 API 字段
- 重写 /home/z/my-project/src/components/limit-up-pullback-screener.tsx，最终 2514 行，保留所有现有功能 + 新增 12 类增强
- 12 类增强功能实现：
  1. 搜索框：Input + Search 图标 + X 清空按钮，placeholder "搜索代码或名称..."，按 symbol/name 二级过滤，localStorage(last-search)
  2. 5 个快捷预设：激进(red)/稳健(purple)/保守(emerald)/深度回踩(orange)/快速反弹(cyan)，Badge 不同色系，激活时 ring-2 描边高亮，Tooltip 显示条件，JSON.stringify 比较，再次点击恢复默认
  3. 三类新筛选维度：
     - 价格区间（minPrice/maxPrice 双 Input）
     - 今日涨跌幅区间（双滑块 -10~10，附"今日反弹"/"今日下跌"快捷按钮）
     - 涨停板类型（3 Checkbox: 主板10%/创业板20%/北交所30%，按 symbol 前缀判断）
  4. 10 个快速标签 chips：今日反弹/今日下跌/今日放量/极度逼近/近3日涨停/小盘/中盘/大盘/低换手/高换手，多选 AND 过滤，激活高亮+ring，"已选 N 项 / 清空"按钮，横向滚动，localStorage(last-tags)
  5. 收藏功能：Star/StarOff 图标按钮（e.stopPropagation 防误触行点击），localStorage(favorites) 存 symbol[]，顶部"⭐ 我的收藏 (N)"切换按钮，收藏模式空状态友好提示
  6. 行展开详情：ChevronRight/ChevronDown 图标（仅图标 stopPropagation），expandedRows: Set<string> 不持久化，展开行 colSpan=17 grid 布局：左 LargeKlineChart 240×120 蜡烛图（标注涨停日/起涨点线/当前价线）+ 中 11 项详细数据表 + 右 风险评分卡（含 4 项贡献值分解）
  7. CSV 导出：Download 图标按钮（在刷新旁），BOM \uFEFF 防 Excel 乱码，14 字段，文件名 涨停回踩筛选_YYYYMMDD_HHmm.csv，Blob+createObjectURL 下载，空结果禁用
  8. 6 个统计卡：扫描总数/符合筛选/深度回踩/平均回踩（保留）+ 今日上涨 N/总数（绿色 TrendingUp）+ 平均最大回撤（红色 ArrowDownRight），grid 2/3/6 响应式
  9. 风险评分：calcRiskScore 公式 approachPct*0.35 + maxPullbackPct*0.25 + min(daysSinceLimitUp*3,30)*0.15 + max(0,-currentChangePct)*0.25，0-100，4 档 badge（低/中/高/极高），表格新增"风险"列可排序，展开详情显示各分项贡献值
  10. 回踩深度分布直方图：5 柱 [30-50%]/[50-70%]/[70-90%]/[90-100%]/[≥100%回到起涨点]，归一化高度，颜色对应 getApproachStyle，纯 div+height 实现，暗色模式兼容
  11. 视图切换：SegmentedControl 风格 [表格|卡片]，卡片视图 grid 1/2/3 列，每卡含代码+名称+收藏按钮+mini K线+数据网格+风险 badge，localStorage(last-view)，默认表格
  12. 分页：上一页/下一页/当前页/总页数，每页 20/50/100 切换（默认 50），切换筛选/搜索/排序/标签/收藏模式自动回第 1 页，localStorage(last-page-size)
- 新增 localStorage key 共 5 个：last-search / last-tags / favorites / last-view / last-page-size（原有 last-result / last-filters 保留）
- 新增 lucide 图标：Search, Star, Download, ChevronRight, LayoutGrid, Table as TableIcon, AlertTriangle, X, Layers, type LucideIcon
- 新增辅助函数：getBoardType (按 symbol 前缀判断板块), calcRiskScore (风险评分), getRiskStyle (4 档样式), csvEscape (CSV 转义)
- 新增子组件：LargeKlineChart (240×120 蜡烛图), Histogram (5 柱直方图), PresetButtons (5 预设), QuickTagChips (10 标签), RiskBadge (风险徽章), ExpandedRowDetail (展开详情), Pagination (分页), StockCardViewItem (卡片视图项)
- 表格列从 14 列扩展到 17 列：新增"展开图标"(列首)/"风险"(最大回撤后)/"收藏"(走势后)
- SortField 类型新增 "riskScore"，排序逻辑中 calcRiskScore 兼容处理
- 拉踩 stopPropagation：展开图标、收藏按钮的 TableCell onClick 都加 e.stopPropagation() 防误触行点击跳转
- 所有 localStorage 读写用 try/catch + typeof window==="undefined" 检查防 SSR 报错
- 颜色合规：避免 indigo/blue，预设稳健型用 purple（用户指定"蓝紫"），板块类型用 violet 替代 indigo
- 暗色模式：所有新增样式都加 dark: 变体
- 响应式：mobile-first，grid 2/3/6 列，控件横向滚动
- 运行 `bun run lint` 通过 exit 0
- dev server 日志确认编译成功（✓ Compiled in 346ms），无组件相关错误
- 未修改 page.tsx / API / 其他组件

Stage Summary:
- 完整重写 limit-up-pullback-screener.tsx，从 1092 行扩展到 2514 行（+1422 行）
- 12 类增强功能全部实现：搜索框/5预设/3类新筛选/10标签/收藏/行展开/CSV导出/6统计卡/风险评分/直方图/视图切换/分页
- 5 个新 localStorage key，所有控件状态记忆
- 表格 14→17 列（新增展开/风险/收藏），新增卡片视图
- 风险评分公式 + 4 档等级 + 展开详情显示分项贡献
- 行点击跳转保留，所有图标按钮 stopPropagation
- bun run lint 通过 exit 0，编译成功无错

---
Task ID: 16
Agent: full-stack-developer
Task: 优化回踩选股页面体验（9 项优化）

Work Log:
- 读取 worklog.md（Task ID 1, 4-5, 15）了解之前 agent 工作 + 当前组件 2514 行结构
- 完整重写 /home/z/my-project/src/components/limit-up-pullback-screener.tsx，最终 2929 行（+415 行），保留全部 12 类增强功能
- 9 项优化实现：

  **优化 1：表格数值右对齐（P0）**
  - 所有数值列 TableCell 添加 `text-right` class（涨停涨幅/涨停价/起涨点/当前价/今日涨跌/回踩深度/距涨停/最大回撤/风险/换手率/市值/量比）
  - 文本列保持 left/center（代码/名称 left、涨停日 left、走势 left、收藏 center、展开图标 center）
  - SortableHead 新增 `align?: "left" | "right"` 参数，所有数值列表头传 `align="right"`，内部 div 用 `justify-end` 配合
  - 距涨停/最大回撤带图标的列改为 `flex items-center justify-end gap-0.5` 让图标+数值整体右对齐
  - 今日涨跌带显式 `+/-` 前缀（正数 `+` 前缀，负数自动 `-`），右对齐后符号位置统一
  - 回踩深度 ApproachBar 整体右对齐，进度条内部布局不变

  **优化 2：表格首列冻结（P1）**
  - 第一列（展开图标）TableHead/TableCell 添加 `sticky left-0 z-20/z-[5] bg-background`
  - 第二列（代码/名称）添加 `sticky z-20/z-[5] bg-background` 配合 `style={{ left: "36px" }}`（首列宽度）
  - 两列右侧均加 `border-r border-border/40` 增强视觉边界
  - z-index 层级：表头 sticky 列 z-20（高于行 z-10），body sticky 列 z-[5]
  - hover 背景：sticky 列用 `bg-background group-hover:bg-muted/50`（配合行 `group` class）
  - 选中行高亮：`selectedRowSymbol === stock.symbol` 时行用 `bg-primary/10`，sticky 列同步 `bg-primary/10`（无 hover 切换，更稳定）

  **优化 3：筛选滑块防抖（P0）**
  - 使用 setTimeout(300ms) 自定义防抖（比 useDeferredValue 更可控）
  - 新增 `debouncedFilters` state，初始化与 filters 相同值（从 localStorage 恢复）
  - useEffect 监听 filters 变化（用 isFirstRender ref 跳过首次），300ms 后同步到 debouncedFilters
  - `filteredStocks` useMemo 依赖 debouncedFilters 而非 filters（实际过滤数据）
  - `isDefaultFilters` / `activePreset` / FilterPanel 显示用 `filters`（draft），用户拖动时立即看到数值变化（Badge/Slider/分组计数）
  - localStorage 持久化用 debouncedFilters（避免存中间态）
  - 重置 page-1 effect 也用 debouncedFilters
  - Checkbox/Input（价格区间）虽然 spec 说不需要防抖，但实现上同样走 300ms 防抖（避免与 slider 行为不一致），用户感知差异不大

  **优化 4：筛选条件分组折叠（P2）**
  - 新增 `FilterGroup` 子组件（Collapsible + 图标 + 标题 + count Badge + 内容）
  - FilterPanel 内 6 类筛选条件分成 3 个 Collapsible：
    1. **核心筛选**（默认展开）：回踩深度阈值、距涨停最大天数
    2. **基本面筛选**（默认折叠）：最大市值上限、最小换手率、量比下限、排除ST
    3. **价格与板块**（默认折叠）：价格区间、今日涨跌幅、涨停板类型
  - 每组标题旁显示该组非默认值数量 Badge（如 "基本面 (2)"）
  - 分组之间用 Separator 分隔
  - 图标：核心=Target、基本面=PieChart、价格与板块=SlidersHorizontal
  - 原外层 Collapsible（筛选条件总开关）保留

  **优化 5：KPI 卡片视觉降噪（P1）**
  - 数字字号 `text-lg` → `text-xl`，字重 `font-bold` 保持
  - 副标题字号 `text-[10px]` → `text-[11px]`
  - 图标 `w-3 h-3` → `w-3.5 h-3.5`
  - padding `px-3 py-2.5` → `px-4 py-3`
  - 背景透明度统一调更低：`bg-red-500/5` → `bg-red-500/[0.04]`，border 同步 `/10` → `/15`
  - grid 保持 `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`

  **优化 6：键盘快捷键支持（P2）**
  - 监听 window keydown 事件，handler 内判断 target 是否 input/textarea/select/contentEditable
  - `j`/`ArrowDown`：选中下一行（基于 pagedStocks 查找）
  - `k`/`ArrowUp`：选中上一行
  - `Enter`：切换选中行展开状态（用 setExpandedRows callback form 避免闭包问题）
  - `f`：切换选中行收藏（调用 handleToggleFavorite）
  - `Esc`：清除选中 + 关闭所有展开 + blur input（即使在 input 中也生效）
  - `/`：聚焦搜索框（searchInputRef.current.focus()）
  - 单字母快捷键在 input 中不生效（isInput 早 return），只有 Esc 全局生效
  - 选中行高亮：`bg-primary/10`，sticky 列同步高亮
  - 新增 `selectedRowSymbol: string | null` state
  - 新增 `KeyboardHints` 子组件 + `KbdHint` 子组件（用 `<kbd>` 标签），显示在表格底部
  - 快捷键提示：`j/k 上下 · Enter 展开 · f 收藏 · / 搜索 · Esc 清除`

  **优化 7：策略保存与加载（P2）**
  - 新增 `STRATEGIES_KEY` localStorage key 和 `SavedStrategy` interface（id/name/filters/tags/createdAt）
  - 新增 `savedStrategies` state（从 localStorage 恢复）+ 持久化 effect
  - 预设按钮旁新增 "保存策略" 按钮（Save 图标，桌面端显示文字，移动端只图标）
  - 点击展开内联输入框（不用 dialog），输入策略名后回车或点"保存"提交，Esc 取消
  - 策略保存内容：filters + quickTags（不含搜索词和收藏）
  - 最多保存 10 个，超过自动删除最早的
  - 已保存策略横向滚动列表（Bookmark 图标 + 策略名 + X 删除按钮），点击策略名一键应用
  - 应用策略后自动关闭输入框
  - 删除策略用 X 图标

  **优化 8：移动端默认卡片视图 + 视图自动切换（P1）**
  - view state 初始化：若 localStorage 无偏好且 `window.innerWidth < 640`，默认 "card"，否则 "table"
  - 只在首次挂载时应用默认值，不监听 resize（尊重用户显式选择）
  - 卡片视图 grid 改为 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`（移动端单列）
  - 卡片内 MiniKlineChart 用 width=180 height=50（比表格 110×36 更大，更易读）
  - MiniKlineChart 新增 width/height 可选参数（默认 110×36 保持表格兼容）

  **优化 9：顶部工具栏移动端优化（P1）**
  - Header Card 顶部按钮（导出CSV/视图切换/刷新）改为 `hidden sm:inline-flex`（桌面端显示）
  - Filter Card 顶部搜索栏：新增移动端按钮（`sm:hidden`）：
    - 视图切换（renderViewToggle 复用）
    - 刷新按钮（仅图标）
    - 导出CSV（仅图标）
  - 搜索框 `flex-1 min-w-[160px]` 移动端弹性宽度
  - "我的收藏" 按钮在移动端隐藏文字只显示图标（`hidden sm:inline` 文字）
  - placeholder 改为 "搜索代码或名称... (按 / 聚焦)" 提示快捷键

- 新增 localStorage key：`STRATEGIES_KEY`（原有 7 个保留）
- 新增 lucide 图标：Save、Keyboard、Bookmark（移除 Trash2，用 X 替代删除按钮）
- 新增子组件：FilterGroup（3 段折叠分组）、KeyboardHints + KbdHint（快捷键提示）
- 新增 useState：debouncedFilters、selectedRowSymbol、savedStrategies、showStrategyForm、strategyName、coreOpen/basicOpen/priceBoardOpen（FilterPanel 内）
- 新增 useRef：searchInputRef、isFirstRender
- 保留所有现有功能：12 类增强功能（搜索/5预设/3类新筛选/10标签/收藏/行展开/CSV导出/6统计卡/风险评分/直方图/视图切换/分页）+ 记忆功能 + onSelectStock 行点击跳转 + stopPropagation + 暗色模式 + 响应式
- 未修改 page.tsx / API / 其他组件
- 运行 `bun run lint` exit 0，无错误
- TypeScript 检查（npx tsc --noEmit）本文件无错误（其他文件的预存错误与本任务无关）
- dev.log 不存在（dev server 日志路径可能不同，主 agent 会做浏览器验证）

Stage Summary:
- 完整重写 limit-up-pullback-screener.tsx，从 2514 行扩展到 2929 行（+415 行）
- 9 项优化全部实现：表格数值右对齐 / 首列冻结 / 滑块防抖(300ms) / 筛选3组折叠 / KPI降噪 / 6键盘快捷键 / 策略保存加载 / 移动端默认卡片 / 移动端工具栏重排
- 关键技术决策：
  * 防抖用 setTimeout(300ms) 而非 useDeferredValue（更可控的固定延迟，spec 指定 300ms）
  * Sticky 列用 `bg-background`（与现有 header row 一致），配合 `group-hover:bg-muted/50` 实现 hover 同步行背景
  * Sticky 列 z-index 分层：表头 z-20（高于行 z-10），body z-[5]（低于行 z-10）
  * 选中行高亮：行 + sticky 列同步用 `bg-primary/10`（选中态不切 hover，避免视觉抖动）
  * 键盘 handler 用 useEffect + window.addEventListener，dep 包含 pagedStocks/handleToggleFavorite 保证闭包新鲜
  * 策略保存用 Date.now().toString() 作为 id（避免引入 crypto.randomUUID 依赖）
  * MiniKlineChart 加 width/height 可选参数，表格用 110×36，卡片用 180×50
  * 视图切换组件抽成 renderViewToggle 函数，桌面端在 Header Card、移动端在 Filter Card 复用同一逻辑
- bun run lint exit 0，无错误
- onSelectStock 行点击跳转保留，所有图标按钮 stopPropagation
- 暗色模式：所有新增样式都加 dark: 变体
- 响应式：mobile-first，所有优化在 mobile 和 desktop 都可用

---
Task ID: 17
Agent: main
Task: 让回踩深度分布直方图可以点击筛选

Work Log:
- 分析现有 Histogram 组件：纯展示组件，5 个柱子（30-50%/50-70%/70-90%/90-100%/回到起涨点），无交互
- 设计方案：柱子变成可点击 button，支持多选 OR 筛选，与现有 filters/quickTags 解耦，独立 localStorage 记忆
- 抽取 HISTOGRAM_BINS 模块级常量（min/max/color/activeColor），供 Histogram 组件和 filteredStocks 过滤逻辑共享
- 新增 isApproachInBin 辅助函数判断 approachPct 是否落在指定 bin 区间
- 修改 Histogram 组件：
  * 加 props: selectedBins: number[], onToggleBin: (min) => void, onClear: () => void
  * 每个柱子改为 <button>，cursor-pointer + hover:bg-muted/40 + title 提示"筛选 X 区间（共 N 只）"
  * 选中的柱子：ring-2 ring-primary/50 bg-primary/5 + 用 activeColor（更深色）+ 文字变 primary
  * 未选中的柱子（当有选中时）：opacity-50 变暗 + 柱子填充 opacity-40
  * 顶部标题加"（点击柱子筛选该区间）"提示文字
  * 右侧显示"✕ 清空选中 (N)"按钮（仅当 selectedBins.length > 0 时）
- 主组件新增：
  * histogramBins: number[] state（从 localStorage 恢复，过滤无效值）
  * localStorage 持久化（key: limit-up-pullback-screener-last-histogram-bins）
  * handleToggleBin / handleClearBins 回调
  * displayedStocks useMemo：在 filteredStocks 基础上追加 histogramBins 过滤（OR 逻辑，多选）
  * filteredStocks（不含 histogramBins）传给 Histogram 保持柱子数量稳定
  * 表格/卡片/分页/统计卡/CSV导出/空状态 全部改用 displayedStocks
  * 空状态区分两种情况：筛选条件无结果 vs 直方图选中区间无股票（显示不同提示+不同按钮）
  * 分页重置 useEffect 依赖加 histogramBins
  * handleResetFilters 加 setHistogramBins([])（重置时清空直方图）
  * handleApplyStrategy 加 setHistogramBins([])（应用策略时清空直方图）
- 新增 localStorage key：LAST_HISTOGRAM_BINS_KEY
- Agent Browser 验证（注入 mock 数据因 API 上游限流）：
  * 12 只股票分布在 5 个区间（3/2/3/2/2）
  * 点击"70-90%"柱子 → 表格 12→3 只 ✓，"清空选中 (1)" 按钮出现 ✓
  * 多选"90-100%" → 表格 3→5 只 ✓，"清空选中 (2)" ✓
  * 再次点击"90-100%"取消 → 表格 5→3 只 ✓，"清空选中 (1)" ✓
  * 点击"清空选中" → 表格恢复 12 只 ✓，按钮消失 ✓
  * 记忆功能：选中"70-90%"后刷新页面 → histogramBins 从 localStorage 恢复 [70] ✓，自动只显示 3 只 ✓
  * VLM 视觉验证：选中柱子有 ring 边框+橙红色高亮 ✓，未选中柱子 opacity 降低 ✓，清空按钮显示 ✓，表格只显示 3 只 ✓，评分 9/10
  * 浏览器控制台无错误 ✓

Stage Summary:
- 回踩深度分布直方图支持点击筛选，多选 OR 逻辑
- Histogram 组件从纯展示升级为交互组件，柱子可点击切换选中
- 选中柱子高亮（ring+activeColor），未选中柱子变暗（opacity-50）
- 独立 localStorage 记忆，刷新页面恢复选中区间
- 与 filters/quickTags 解耦，作为"三级过滤"叠加在 filteredStocks 之上
- 空状态智能区分："直方图选中区间无股票" vs "筛选条件无结果"，提供不同提示和操作按钮
- handleResetFilters / handleApplyStrategy 都会清空 histogramBins
- 文件从 2929 行 → 3037 行（+108 行）
- bun run lint 通过，dev server 编译成功，浏览器控制台无错误

---
Task ID: 18
Agent: main
Task: 删除回踩页面，保留回踩选股页面

Work Log:
- 分析 page.tsx 菜单配置：两个回踩相关菜单项
  * "回踩" (mode="limit-up") → LimitUpAnalysis 组件（单维度回踩深度按钮筛选，旧版）
  * "回踩选股" (mode="limit-up-pullback") → LimitUpPullbackScreener 组件（12类增强功能+9项优化+直方图点击筛选，新版）
- 用户要求删除"回踩"（旧版），保留"回踩选股"（新版）
- 修改 src/app/page.tsx（6 处）：
  1. 删除 LimitUpAnalysis 的 dynamic import（line 11）
  2. 从 lucide-react import 移除 TrendingUp 图标（仅 limit-up 菜单使用，删除后变未使用）
  3. 从 pageMode 联合类型移除 "limit-up"
  4. 从菜单 mode 数组移除 "limit-up"
  5. 删除菜单标签 `{mode === "limit-up" && <><TrendingUp />回踩</>}`
  6. 删除条件渲染分支 `pageMode === "limit-up" ? (<LimitUpAnalysis .../>) :`
- 删除组件文件：src/components/limit-up-analysis.tsx（33KB，旧版回踩分析组件）
- 删除 API 目录：src/app/api/stock/limit-up/（旧版回踩分析 API，不再被引用）
  * 保留 src/app/api/stock/limit-up-pullback/（新版回踩选股 API）
- 验证：
  * grep 确认 LimitUpAnalysis / "limit-up" / TrendingUp 在 page.tsx 中无残留
  * grep 确认 /api/stock/limit-up 不再被任何代码引用
  * bun run lint 通过 exit 0
  * Agent Browser 验证：菜单从 9 项变 8 项（做T/选股/低开/分时选股/轮动/早盘选股/回踩选股/部署），"回踩"已消失，"回踩选股"保留且可正常进入
  * 浏览器控制台无错误

Stage Summary:
- 删除旧版"回踩"页面（LimitUpAnalysis 组件 + /api/stock/limit-up API）
- 保留新版"回踩选股"页面（LimitUpPullbackScreener 组件 + /api/stock/limit-up-pullback API）
- 菜单从 9 项缩减为 8 项
- page.tsx 移除 TrendingUp 图标导入（避免未使用变量 lint 错误）
- bun run lint 通过，页面正常加载无错误

---
Task ID: 19
Agent: main
Task: 修复回踩选股页面非交易时段无数据问题

Work Log:
- 问题诊断：API 返回 {success:true, stocks:[], totalScanned:0}
- 根因分析：东方财富 push2delay 接口的 f2(现价)/f3(涨跌幅)/f4(前收) 在非交易时段返回 "-"
  * parseFloat("-") = NaN → || 0 → 0
  * fetchAllStocks() 末尾 allStocks.filter(s => s.price > 0) 把所有股票过滤掉
  * 候选股为空 → 无 K线分析 → 返回空结果
- 发现 f18(昨收) 在非交易时段有值（f9 量比也有值，但 f2/f3/f4/f10/f15/f16/f17 都是 "-"）
- 修改 src/app/api/stock/limit-up-pullback/route.ts：
  1. fetchAllStocks():
     * 请求字段加 f18（昨收）：fields = "f2,f3,f4,f12,f14,f18"
     * price 改为 parseFloat(f2) || parseFloat(f18) || 0（f2 为空时 fallback 到昨收）
     * prevClose 改为 parseFloat(f4) || parseFloat(f18) || 0（同理）
     * 末尾过滤改为 /^\d{6}$/.test(code) && prevClose >= 2（用昨收做价格下限，不用 price）
     * 不再过滤 changePct（非交易时段全是 0，过滤无意义）
  2. Step 2 候选股筛选：
     * 移除 s.price < 2 过滤（price 在非交易时段可能为 0）
     * 移除 s.changePct > 5 过滤（非交易时段全是 0，会把所有股票都保留反而正确）
     * 只保留 ST 过滤和代码格式校验
  3. Step 3 K线批次分析：
     * BATCH_SIZE 从 10 提到 25（非交易时段候选股从几百变 5000+，提高并发加速）
     * 新增 TOTAL_BUDGET_MS = 55000 总时间预算（55秒），超时则 break 返回已获取结果
     * startTime = Date.now()，每批次开头检查 Date.now() - startTime > TOTAL_BUDGET_MS
- 验证结果：
  * curl /api/stock/limit-up-pullback?refresh=1 返回真实数据：totalScanned=1154, totalPullback=82, stocks=82只
    （1154 是因为 55 秒预算内只扫了部分候选股，非交易时段本来有 5000+）
  * 页面显示 58 只（默认筛选 approachPct>=30%, daysSinceLimitUp<=10, excludeST）
  * 直方图分布正常：30-50%(7) / 50-70%(6) / 70-90%(13) / 90-100%(2) / 回到起涨点(30) = 58
  * 点击直方图"回到起涨点"柱子 → 筛选到 30 只 ✓
  * 换手率/市值/量比显示为 "--"（非交易时段实时字段为空，符合预期）
  * 浏览器控制台无错误
  * bun run lint 通过

Stage Summary:
- 根因：东方财富实时行情字段(f2/f3/f4)非交易时段返回"-"，parse 后为 0，被 price>0 过滤掉
- 修复：用 f18(昨收) 作为 price/prevClose 的 fallback，过滤改用 prevClose>=2
- 候选股不再依赖实时涨跌幅过滤，K线分析独立判断涨停+回踩
- 非交易时段候选股增多(5000+)，BATCH_SIZE 10→25 + 55秒总预算保护响应时间
- API 恢复返回 82 只真实回踩股票，页面正常显示 58 只（默认筛选后）
- bun run lint 通过，浏览器无错误

---
Task ID: 20
Agent: main
Task: 修复回踩选股页面再次无数据问题（彻底修复）

Work Log:
- 问题诊断：API 返回 totalScanned=55, totalPullback=0
- 根因 1：服务端缓存忽略了 ?refresh=1 参数
  * GET handler 只检查自己的 cache Map，不检查 request query param
  * 客户端点"刷新"按钮传 ?refresh=1，但服务端 10 分钟内一直返回旧缓存
  * 修复：GET handler 检查 request.nextUrl.searchParams.get("refresh") === "1"，若为 true 则 cache.delete(cacheKey)
- 根因 2：push2delay 每页限制 100 条，但代码请求 pz=500
  * totalPages = ceil(5553/500) = 12，但每页实际只返回 100 条
  * 12 页只能拿到 1200 条而非 5553 只
  * 修复：pageSize 从 500 改为 100，totalPages = ceil(5553/100) = 56 页
- 根因 3：f4 字段被误用为"前收盘价"
  * 东方财富字段：f4 = 涨跌额（元），不是前收盘价！f18 = 昨收价
  * 代码：prevClose = parseFloat(item.f4) || parseFloat(item.f18) || 0
  * 因为 f4 大部分有值（涨跌额），|| 运算符不会 fallback 到 f18
  * 导致 prevClose = 涨跌额（如 1.42 元），而非昨收价（如 11.75 元）
  * 过滤 prevClose >= 2 时，5000+ 只股票只剩 257 只（大部分涨跌额 < 2 元）
  * 修复：直接用 f18 作为 prevClose，不用 f4
- 根因 4：sina K线接口 IP 被封
  * sina 返回"拒绝访问"HTML 页面（IP 存在异常访问）
  * 所有 fetchDailyKline 调用失败，totalPullback=0
  * 修复：换用东方财富 push2his.eastmoney.com K线接口
    - URL: push2his.eastmoney.com/api/qt/stock/kline/get?secid={1|0}.{code}&klt=101&fqt=0&beg={YYYYMMDD}&end=20500101&fields1=f1&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61
    - secid: 6开头=1.{code}（沪市），其他=0.{code}（深市/北交所）
    - beg = 当前日期往前推 35 天（确保覆盖 15 个交易日）
    - 返回格式：逗号分隔 "日期,开,收,高,低,量,额,振幅,涨跌幅,涨跌额,换手率"
    - f59 = 涨跌幅（直接用，不需手算）
- 根因 5：分页去重
  * push2delay 分页边界可能有重叠股票
  * 修复：fetchAllStocks 末尾用 Set 去重 by code
- 并发优化：
  * CONCURRENCY=3 + 150ms 批次间延迟，避免 push2delay 限流
  * fetchPage 加 retry 一次逻辑（失败后等 200ms 重试）
  * K线分析 BATCH_SIZE=25 + 55 秒总预算
  * 移除 next: { revalidate: 0 }，加 cache: "no-store"
- 移除 toSinaSymbol import（不再用 sina）
- 移除 _debug 调试字段和 fetchAllStocksDebug 计数器
- 验证结果：
  * curl API: totalScanned=4833, totalPullback=45, duplicates=0
  * 页面显示 30 只（默认筛选 approachPct>=30%, daysSinceLimitUp<=10, excludeST 后）
  * 数据完整：换手率/市值/量比都有值（交易时段实时数据可用）
  * 直方图正常：30-50%(14)/50-70%(8)/70-90%(12)/90-100%(3)/回到起涨点(44)
  * 浏览器控制台无错误
  * bun run lint 通过

Stage Summary:
- 彻底修复回踩选股无数据问题，共修复 5 个根因：
  1. 服务端缓存忽略 ?refresh=1 → 现在检查并跳过缓存
  2. pageSize=500 与 push2delay 实际限制 100 不符 → 改为 100
  3. f4(涨跌额) 被误用为前收 → 改用 f18(昨收)
  4. sina K线接口 IP 被封 → 换用东方财富 push2his
  5. 分页边界重复股票 → 加 Set 去重
- 数据源从 sina 切换到东方财富 push2his（更可靠）
- API 恢复返回真实回踩股票数据（45 只无重复）
- bun run lint 通过，浏览器控制台无错误

---
Task ID: 21
Agent: main
Task: 优化回踩深度分布直方图样式

Work Log:
- VLM 分析优化前的直方图：评分 5/10，问题包括柱子高度比例失真、颜色过于跳跃、选中态不够清晰、排版拥挤
- 修改 Histogram 组件样式（src/components/limit-up-pullback-screener.tsx）：
  1. 柱子高度比例：h-16→h-20（增高容器），添加最小高度 6px（counts>0 时至少可见）
  2. 数字排版：text-xs→text-base font-bold（数字加大加粗），新增百分比显示（text-[9px] 灰色）
  3. 选中态强化：ring-primary/50→ring-primary/60（描边加深），新增柱顶指示点（w-1 h-1 bg-primary 圆点）
  4. 选中柱子颜色：用 activeColor（更深色）替代 color
  5. 未选中变暗：opacity-50→opacity-40（更明显的对比）
  6. 间距优化：gap-2→gap-2 sm:gap-3（桌面端间距加大），p-1→p-1.5（卡片内边距加大）
  7. 圆角统一：rounded-sm→rounded-md（柱子容器），rounded-md→rounded-lg（按钮）
  8. hover 效果：group-hover:brightness-110（柱子变亮），group-hover:bg-muted/50（容器背景加深）
  9. title 提示优化：显示区间+数量+百分比+操作提示（点击筛选/点击取消）
  10. "清空选中"按钮优化：加背景和边框（bg-primary/5 border-primary/20），更醒目
  11. 顶部说明文字：移动端隐藏"（点击柱子筛选该区间）"节省空间
  12. tabular-nums：数字用等宽数字字体，对齐更整齐
- 验证结果：
  * VLM 评分从 5/10 → 8.5/10（整体美观度）
  * 选中态评分 9/10（边框清晰、指示点明显、未选中变暗、清空按钮出现）
  * 柱子高度比例准确（8/10/11/6/31 → 12%/15%/17%/9%/47%）
  * 数字+百分比层级分明，对齐优秀
  * 浏览器控制台无错误
  * bun run lint 通过

Stage Summary:
- 直方图样式全面优化，VLM 评分 5/10 → 8.5/10
- 柱子高度比例准确还原数据，最小高度 6px 保证小值可见
- 选中态多重反馈：ring 边框 + activeColor 深色 + 柱顶指示点 + 未选中 opacity-40 变暗
- 数字加大加粗 + 百分比辅助显示，tabular-nums 等宽对齐
- 间距和圆角统一，hover 效果增强交互反馈
- title 提示信息丰富（区间+数量+百分比+操作）
- bun run lint 通过，浏览器无错误

---
Task ID: 22
Agent: full-stack-developer
Task: 优化回踩选股页面功能（4 项功能优化）

Work Log:
- 读取 worklog.md 了解 Task 15-21 演进历史；读取 limit-up-pullback-screener.tsx 全文（3051 行）了解现有架构
- 优化 1（智能宽松建议）：
  * 新增 computeSmartSuggestions(stocks, filters) 纯函数：计算 4 种放宽方案各自能新增多少只股票
    - 放宽回踩深度阈值（min -10，统计 approachPct 落在新旧区间内的数量）
    - 延长距涨停天数（max +3 上限 15，统计 daysSinceLimitUp 落在新旧区间内的数量）
    - 放宽市值上限（×2 上限 10000，统计 marketCap 落在新旧区间内的数量）
    - 取消排除 ST（统计 ST 股票数量）
  * 新增 SmartSuggestions 组件：useMemo 缓存建议列表，按 added 降序取 top 4，按钮带 Lightbulb 图标 + emerald 色徽章显示 "+N"
  * 若所有建议 added=0（原始数据少），显示 amber 警示框"原始数据仅 N 只，建议刷新或等待交易日"
  * 在空状态卡片"重置筛选"分支下方渲染（仅当 result.stocks.length > 0 时）
- 优化 2（回踩质量评分）：
  * 新增 calcQualityScore(s)：0-100 评分，4 维加权（位置优势 35 + 量能配合 25 + 回踩天数 20 + 今日表现 20）
    - 位置优势：approachPct <= 100 直接用，> 100 破位时扣 2 倍
    - 量能配合：volumeRatio 越低越好；volumeRatio=0（无数据）取中点 12.5（避免误判为满分）
    - 回踩天数：3-7 天最佳，偏离 5 天基准按 |差| × 3 扣分
    - 今日表现：0-3% 微涨最佳（止跌企稳），大跌按 |跌| × 2 扣分，大涨按 (涨-3) × 3 扣分
  * 新增 getQualityStyle(score)：≥70 emerald 优秀 / ≥50 yellow 良好 / ≥30 orange 一般 / <30 red 较差
  * 新增 getQualityScoreBreakdown(s)：返回 4 项分项贡献（用于详情卡显示）
  * 新增 QualityBadge 组件（Award 图标 + 评分 + 等级）
  * 表格新增"质量"列（在"风险"之后，78px，可排序）
  * 行展开详情右侧新增"回踩质量"评分卡（在风险评分卡下方），显示 4 项贡献分解
  * 卡片视图新增 QualityBadge
- 优化 3（迷你K线标注增强）：
  * MiniKlineChart：新增 limitUpClose / currentPrice 两个可选 prop
    - 新增涨停价水平线（红色 strokeDasharray="1,1" strokeWidth="0.5" opacity="0.5"）
    - 新增当前价水平线（蓝色实线 strokeWidth="0.5" opacity="0.6"）
    - 起涨点线保持灰色虚线
    - 3 条线 + 走势线 + 涨停红点在 36px 高度内用不同颜色+透明度区分
    - 价格范围计算扩展为 kline.high/low + 3 条参考线，确保所有线可见
  * LargeKlineChart（不新增 prop，从 kline[limitUpIdx].close 推导涨停价）：
    - 新增涨停价水平线（红色虚线 strokeDasharray="2,2" opacity="0.7"）
    - 当前价线改为蓝色实线（之前是虚线）
    - 右侧 52px 区域标注 3 条线的价格数值（小字号 7px，textAnchor="end"）
    - 涨停日 K 线上方保留"涨停"小标签
    - 起涨点线保持灰色虚线
    - 图例新增"涨停价"红色虚线项
  * 更新调用处：表格走势列 + 卡片视图都传 limitUpClose + currentPrice 给 MiniKlineChart
- 优化 4（涨停板强度标签）：
  * 新增 calcLimitUpStreak(kline, limitUpDate)：从 limitUpDate 往前数连续涨停天数
    - 涨停阈值从 limitUpDate 当天 changePct 推断：≥29.5 用 29.5 / ≥19.5 用 19.5 / 否则 9.5（适配主板/创业板/北交所）
    - 返回连板数（1=首板，2=二连板...）
  * 新增 getLimitUpStreakStyle(streak)：1B slate灰 / 2B orange橙 / 3B red红 / ≥4 rose-700深红 / 0 muted"--"
  * 新增 LimitUpStreakBadge 组件（Flame 图标 + 等级标签 + Tooltip 说明）
  * 表格新增"连板"列（在"涨停日"之后，52px，可排序）
  * 行展开详情数据表新增"涨停连板"行（streak ≥3 rose红 / 2 orange橙 / 其他 muted）
  * 卡片视图新增 LimitUpStreakBadge（紧贴涨停日期）
- 排序逻辑：filteredStocks useMemo 扩展 sortField === "qualityScore" / "limitUpStreak" 分支，分别调用 calcQualityScore / calcLimitUpStreak
- SortField 类型扩展："qualityScore" | "limitUpStreak"
- CSV 导出：新增 3 列（涨停连板 / 风险评分 / 质量评分），header 14 → 17 项
- 表格 colSpan 17 → 19（新增 2 列：连板 + 质量）
- 策略说明卡：新增质量评分 + 连板标签的图例说明
- 新增 lucide-react 导入：Lightbulb / Award / Flame
- 验证：bun run lint exit 0；curl localhost:3000/ 返回 200 无错误

Stage Summary:
- 文件行数：3051 → 3434（+383 行）
- 4 项优化全部实现：
  1. 智能宽松建议（SmartSuggestions 组件，4 条建议 top-N，amber 风格按钮，点击直接 setFilters）
  2. 回踩质量评分（calcQualityScore 0-100，4 维加权，新增质量列 + 详情卡 + 卡片视图 badge）
  3. 迷你K线标注增强（MiniKlineChart 3 条水平线，LargeKlineChart 涨停价线 + 右侧价格标注）
  4. 涨停板强度标签（calcLimitUpStreak，LimitUpStreakBadge 1B/2B/3B/4B+，新增连板列 + 详情行 + 卡片视图 badge）
- 新增 5 个组件：QualityBadge、LimitUpStreakBadge、SmartSuggestions（+ 内部 computeSmartSuggestions、getQualityScoreBreakdown 辅助函数）
- 新增 4 个 helper：calcQualityScore、getQualityStyle、calcLimitUpStreak、getLimitUpStreakStyle
- 排序扩展：qualityScore / limitUpStreak 两个新 SortField，均可在表头点击排序
- CSV 导出扩展：新增 3 列（涨停连板、风险评分、质量评分）
- 表格列从 17 列扩展到 19 列，colSpan 同步更新
- 兼容 dark mode（所有新增样式都带 dark: 变体）
- 响应式：mobile-first，所有新增在 mobile 和 desktop 都可用
- bun run lint 通过 exit 0，dev server 正常运行无错误

### 主 Agent 验证结果（Task 22）
- bun run lint 通过 exit 0
- Agent Browser 验证（注入 mock 数据因 API 上游 K线接口限流返回空）：
  * 表格新增"质量"列：显示评分+等级badge（71优秀/62良好等）✓
  * 表格新增"连板"列：显示 1B/2B 等标签 ✓
  * 迷你K线标注：涨停价红线+起涨点灰虚线+当前价蓝线 ✓
  * 行展开详情：风险评分卡 + 质量评分卡（含4项分解）+ 大K线图标注 ✓
  * 智能宽松建议：空结果时显示"放宽回踩深度到60%(+3只)"等按钮，可点击应用 ✓
  * VLM 评分：功能完整性 9/10，智能建议 9/10
  * 浏览器控制台无错误

---
Task ID: 23
Agent: main
Task: 修复分时页面"一闪一闪"问题（数据获取已是ajax，修复渲染层抖动）

Work Log:
- 问题诊断：用户反馈分时页面总是一闪一闪的，希望改成 ajax 刷新
- 排查发现：数据获取早已是 ajax（use-stock-data.ts 每 1.5s setInterval + fetch API），不是页面刷新
- 真正的闪烁来源是渲染层：
  1. Y 轴 domain 抖动（主因）：yMin/yMax 基于"可见数据"的 min/max 每 1.5s 重算，
     新 tick 价格变化 → Y 轴缩放微调 → 整个图表坐标系跳动 → 视觉"一闪一闪"
  2. 重绘频率过高：1.5s 一次全量 SVG 重绘（价格图+成交量+MACD+信号层）
  3. 重绘扩散：recharts-wrapper 无合成层隔离，重绘失效扩散到整页 stacking context
- 修复 1（time-sharing-panel.tsx）：Y 轴 domain 改为基于"全天数据"范围而非"可见切片"
  * 标准分时图行为（东方财富/同花顺风格）：Y 轴在交易日内稳定，只在创新高/新低时扩展
  * 纯函数计算（全天 min/max），无缓存副作用，兼容 React Compiler lint 规则
  * fallback：fullDayData 为空时回退到 data（与原逻辑一致）
- 修复 2（five-day-timeline-panel.tsx）：同样改用"全 5 日数据"范围计算 Y 轴
  * priceSource = items.length > visibleItems.length ? items : visibleItems
- 中途尝试过"模块级 Map 缓存粘性 domain"方案，因 react-hooks/preserve-manual-memoization
  lint 错误（React Compiler 无法编译 useMemo 内的 Map 副作用）而放弃，改为上述纯函数方案
- 修复 3（use-stock-data.ts）：轮询频率 TIMELINE_REFRESH_INTERVAL 1.5s → 2.5s
  * 平衡实时性（做T需要）与重绘成本（频率降低 40%）
- 修复 4（page.tsx）："实时刷新 1.5s" 文案同步改为 "实时刷新 2.5s"
- 修复 5（globals.css）：.recharts-wrapper 加 transform: translateZ(0) + backface-visibility: hidden
  * 提升为独立合成层，重绘失效不再扩散到整页
- 验证：
  * bun run lint 通过 exit 0
  * 登录后分时/分时倒影 tab 正常渲染（信号标签/5日最低pill/MA5/参考线都在）
  * 浏览器控制台无错误
  * 对比验证：stash 修改后原代码图表同样存在"价格线被5日最低线压缩到顶部"现象（Y轴含1322-1452大范围），
    说明该现象是原有设计（5日最低线纳入Y轴）而非本次修改引入
- 注：闪烁需在交易时段才能复现验证，本次修复基于代码分析定位根因（Y轴抖动+重绘频率+重绘扩散）

Stage Summary:
- 分时页面闪烁根因是渲染层（Y轴domain每tick重算+1.5s全量重绘+重绘扩散），数据获取早已是ajax
- Y 轴 domain 改为全天数据范围（主分时+5日分时），交易日内坐标系稳定，只在创新高/低时扩展
- 轮询频率 1.5s → 2.5s（重绘频率 -40%），文案同步更新
- recharts-wrapper 提升合成层（translateZ(0)），重绘不再扩散
- bun run lint 通过，浏览器无错误

---

Task ID: 23
Agent: Z.ai Code (main)
Task: 修复分时选股页面闪烁问题，改为 AJAX 增量刷新

Work Log:
- 用户反馈：分时页面总是一闪一闪的，希望改成 ajax 刷新
- 根因分析（三层轮询 × memo 失效）：
  1. useStockData() 的 timeline/quote 轮询（TIMELINE_REFRESH_INTERVAL=2.5s，交易时段）在 page 顶层运行，
     无 pageMode 感知 → 每 2.5 秒 setTimeline/setQuote → page 全量重渲染
  2. 板块数据轮询（page.tsx sector useEffect，每 5 秒）无 pageMode 守卫 → setSectorLoading(true/false)
     每轮 2 次必然触发全页渲染（数据只被 T 助手图表面板使用）
  3. 指数数据轮询（page.tsx index useEffect，每 15 秒）同样无 pageMode 守卫
  4. page 重渲染时面板组件的 onSelectStock 是内联箭头函数（每次新引用）→ React.memo 完全失效 →
     intraday-screener（1473 行，50 行 × 每行 7 个 Tooltip/TooltipProvider ≈ 数千组件实例）跟着全量 diff
  5. 综合效果：交易时段每 2.5-5 秒一次全页重渲染风暴 → 主线程阻塞 → hover 效果丢失、Tooltip 闪关、
     表格视觉"一闪一闪"
- 修复 1（use-stock-data.ts）：useStockData 加 options.autoRefresh 开关（默认 true 向后兼容），
  autoRefresh=false 时跳过 2.5s 轮询 effect；依赖数组加 autoRefreshEnabled（切回页面自动恢复轮询）
- 修复 2（page.tsx）：
  * pageMode useState 移到 useStockData 之前，传入 { autoRefresh: pageMode === "t-assistant" }
  * 指数轮询 useEffect 加 pageMode !== "t-assistant" 守卫（依赖 +pageMode）
  * 板块轮询 useEffect 加同样守卫（依赖 +pageMode）
  * recentDayLows 拉取 useEffect 加同样守卫（依赖 +pageMode）
  * 新增 handlePanelSelectStock = useCallback（selectStock + setPageMode("t-assistant")），替换 7 处
    面板内联 onSelectStock（ScreenerHistoryPanel/StockScreener/IntradayScreener/SectorRotationPanel/
    EarlyTradingScreener/LowOpenScreener/LimitUpPullbackScreener），保持各面板 React.memo 生效；
    header 搜索/菜单栏沿用原有 handleSelectStock（含指纹缓存失效，语义不同故分开命名）
- 修复 3（intraday-screener.tsx）行级增量渲染：
  * 表格行抽成模块级 StockRow = React.memo(..., areStockRowsEqual)
  * areStockRowsEqual：比较 idx/inWatchlist/isPreviewActive/3 个回调引用 + stock 对象全字段浅比较
    （所有字段均为原始值，浅比较安全）
  * handleToggleWatchlist/handlePreview 改为 useCallback([])；previewStock 镜像到 ref 避免回调依赖
  * watchlist.some 每行调用改为 watchlistSymbols: Set（useMemo）
  * 效果：数据刷新时只有字段真正变化的行重渲染；组件内部 state 变化（预览/自选）不再波及全部行
- 踩坑：page.tsx 原有 handleSelectStock（fingerprint 缓存失效版）与新加的重名导致 turbopack 编译 500，
  改名 handlePanelSelectStock 后恢复
- 验证：
  * bun run lint 通过
  * Agent Browser 登录（密码 888888，AppConfig 表为空回落默认值）→ 分时选股页表格 18 行正常渲染
  * 点刷新按钮：/api/stock/intraday-screener?...&refresh=1 返回 200，表格数据平滑更新、无骨架屏闪现
  * 行 hover + 眼睛按钮：分时预览弹层正常弹出，迷你走势图渲染正常
  * 分时页面静置 12 秒 network 请求数 124 → 124（零轮询；修复前每 2.5-15 秒会有多次 sector/index/timeline 请求）
  * 切回 T 助手页面：分时倒影图、信号标注、买卖点提示全部正常，无 console 错误
- 注：本次修复的是"面板模式下后台轮询引发的全页重渲染"；此前 Task 已修复过 T 助手分时图本身的
  Y 轴抖动 + 重绘扩散问题，两者互补

Stage Summary:
- 分时页面闪烁根因 = 面板模式下 3 组后台轮询（2.5s/5s/15s）仍在跑 + 面板 onSelectStock 内联函数使 memo 失效
- 数据获取本来就是 AJAX（fetch + setState），无需改造；问题是每次 setState 都重渲染整个 page
- 面板模式下暂停全部行情轮询（autoRefresh 开关 + pageMode 守卫），T 助手模式自动恢复
- 表格行 memo 化实现真正的增量渲染：数据无变化的行完全跳过重渲染
- bun run lint 通过；浏览器验证分时页面 12 秒零轮询、刷新/预览/hover/页面切换全部正常

---
Task ID: 24
Agent: Main Claude (Z.ai Code)
Task: 分时图标签降噪 — 简洁/详细双模式 + 同类型标记聚合

Work Log:
- 问题分析：分时图 6 层标注叠加（VWAP禁止买卖/因子信号/选股PV标记/优先信号/展开气泡/5日最低），
  其中选股 PV 标记为最大噪音源：9 类标记每个都渲染「圆点+图标+光晕环+虚线连接线+白底文字胶囊+金额」，
  活跃行情下 10~20 个胶囊直接盖住曲线；因子信号 medium 级别也带文字标签
- 改造 1（同类型相邻聚合）：extractPulseVolumePoints 末尾新增 aggregatePvMarkerPoints，
  同类型标记横向距离 ≤24px 合并为一个（AGG_MERGE_PX=24），保留 score 最高者的位置，
  mergedCount/mergedTimes 记录合并信息；标签追加 ×N；新增 AggregatedPvMarker 类型贯穿
  computePvLabelLayout / resolvePvLabelOverlaps / renderPulseVolumeMarker / PlacedLabel
- 改造 2（简洁模式渲染）：renderPulseVolumeMarker 新增 compact 参数，
  按 score 分级：≥60 → 圆点+短胶囊（不含金额）；30~59 → 仅圆点(r3.5)；<30 → 微型半透明点(r2.2, opacity0.55)；
  去掉光晕环/连接线/白底 glow；放量下跌 danger halo 仅 score≥50 保留一个淡环
- 改造 3（因子信号降噪）：computeTimelineSignalElements 新增 labelMode 参数，
  compact 下 labeledIndices 仅保留 strong（medium/weak 只渲染圆点无文字）
- 改造 4（悬停提示）：两种模式下每个 PV 标记 g 内加 SVG <title>（时间+类型+×N+成交额+强度+合并明细），
  鼠标悬停圆点即可看完整信息，弥补简洁模式隐藏的文字
- 改造 5（模式切换 UI）：TimeSharingPanel 头部缩放控件左侧新增「简洁|详细」分段按钮
  （role=group aria-label=标注显示密度，aria-pressed 状态）；
  labelMode state 默认 compact，localStorage key=timesharing-label-mode 持久化（SSR 安全初始化）
- 改造 6（缓存失效）：CombinedChartOverlay 接收 labelMode prop，overlay 指纹追加 :lm={labelMode}，
  OVERLAY_FP_VERSION 升级 v13-label-density；切换模式时 overlay 缓存正确重算
- 验证：
  * 聚合函数单测（bun）：相邻合并/异类型不合并/链式合并+远端保留 全部通过
  * bun run lint 通过
  * Agent Browser 实测（茅台 600519，11 个 PV 标记）：
    - 详细模式：11 个完整胶囊（含金额）+ 29 circle（含光晕）+ medium 信号标签
    - 简洁模式：仅 3 个短胶囊（score≥60：强递增69/强放量拉升85/量增价涨70）+ 12 circle，
      8 个低分标记变纯圆点，medium 信号标签（微脉冲拉升(中)等）全部隐藏，
      6 个 strong 因子信号标签保留，11 个悬停提示完整
  * 分时倒影模式行为不变（无 PV 标记/保留 VWAP 标注+优先信号+5日最低，原有设计）
  * localStorage 刷新后记忆模式选择；程序化 click 不触发 Radix Tabs（用原生 click 验证）

Stage Summary:
- 分时图标签噪音根治：简洁模式（默认）= 强信号分级显示 + 弱信号纯圆点 + 悬停看详情；
  详细模式 = 原有完整标签；两种模式均受益于同类型相邻标记聚合（×N）
- 核心信息不丢失：strong 因子信号、优先买卖点、VWAP 标注、5日最低在两种模式下均完整显示；
  PV 标记细节通过原生 SVG <title> 悬停可查
- 默认简洁模式对新用户生效，老用户可通过「简洁|详细」切换并自动记忆

---

Task ID: 25
Agent: Main Claude (Z.ai Code)
Task: 分时图刷新后标签延迟出现 + 闪顿（闪烁）修复

Work Log:
- 用户反馈：分时图刷新之后，标签好像后出来，然后有一个闪顿的效果
- 根因分析（三个问题叠加）：
  1. page.tsx 两阶段渲染：自动刷新多为「纯报价 tick」（无新分钟slot，2.5s/次），
     signals 经 useDeferredValue(liveTimeline) 延迟 → 价格曲线当帧更新、
     标签在第二帧才重算位移 → 肉眼可见的「标签后出来 + 跳动」
  2. time-sharing-panel.tsx overlay 缓存指纹缺陷：buildOverlayFingerprint 只含
     点数/末点像素/信号数量，不含信号内容 → deferred 的 signals 提交时
     （几何不变、数量不变）指纹不变 → 缓存命中返回旧标签，
     直到下一次价格 tick 才重算 → 标签永远慢一个刷新周期（"后出来"的直接原因）
  3. pvMarkers（脉冲/量能标记）指纹含末5个价格 → 每个报价 tick 都重算，
     右端标记频繁出现/消失 → 闪烁
- 修复 1（page.tsx）：删除 useDeferredValue 两阶段机制，改为「冻结信号级 timeline」：
  signalTimelineRef 按 symbol 记录最近一次参与信号计算的 timeline，
  纯报价 tick 复用旧值（deps 不变 → signals/MACD memo 完全不重算），
  新分钟 slot 到达时与 data 同帧更新 → 标签与曲线原子性同步，永不滞后
  （同时消除切换股票时同 slot 数撞车导致的旧股标签串场问题）
- 修复 2（page.tsx）：pvMarkers 改用冻结的 liveTimelineForSignals，
  标记标签与因子信号同节奏（按分钟）更新，报价 tick 期间完全静止
- 修复 3（time-sharing-panel.tsx）：buildOverlayFingerprint 追加信号内容哈希
  （type/strength/reason/description + pv标记 type/time）→ 几何不变但内容变化时
  （如 regime 变化引发信号文案更新）缓存必定失效，杜绝陈旧标签
- 验证（Agent Browser + fetch mock 注入模拟实时报价 tick，茅台 600519）：
  * 交易时段真实数据：10 秒（4 个刷新周期）两次采样，44 个标签位置像素级完全一致
  * mock 报价 tick（4 次纯价格 tick + 1 次新 slot，共 5 个刷新周期）：
    price 变化 1442.81→1441.48、曲线末点位移（实时性保持 ✓），
    既有 48 个标签文字与坐标零漂移，新 slot 的 3 个新标签原子性出现
  * 简洁/详细模式切换正常（labelMode 仍在 overlay 指纹中，缓存正确失效）
  * 控制台无错误；bun run lint 通过

Stage Summary:
- 分时图标签层更新模型从「每 tick 延迟两帧」改为「按分钟 slot 原子更新」：
  报价 tick 只动曲线不动标签（零闪顿），新分钟到达时曲线+标签同帧刷新（零滞后）
- 附带收益：每 2.5s 省去一次 ~7000 次条件评估的 generateTimelineSignals 重算
  （纯报价 tick 下 deps 恒等，memo 直接跳过），行情活跃时 CPU 占用同步下降
- 涉及文件：src/app/page.tsx、src/components/time-sharing-panel.tsx

---

Task ID: 26
Agent: Main Claude (Z.ai Code)
Task: 分时图不显示修复 — 数据源降级（腾讯WAF+新浪5分钟退化）+ Y域拉伸压缩曲线

Work Log:
- 用户反馈：分时图还是有 bug，现在分时图不显示了
- 排查过程（Agent Browser 截图 + DOM + API 三层定位）：
  1. 图表 DOM 中价格 Line 路径存在但全是「M x,y Z」孤立点（0 个连续 C 段），
     相邻点 X 间隔 ≈22.9px = 5 分钟/点 → 分时数据退化为 5 分钟级
  2. curl 验证 /api/stock/ashare-timeline 返回 22 个 5 分钟间隔点（09:35-11:20）
  3. 根因链：腾讯分时 API（原主源）被 WAF 拦截（501 页面）→ 走新浪 5 分钟 K 线回退
     → 5 分钟稀疏点 + connectNulls=false → 曲线退化为散点 → "图不显示"
- 修复 1（新模块 src/lib/em-timeline-server.ts，server-only）：
  主数据源切换为东财 trends2/get（http://push2.eastmoney.com，1 分钟级、自带真实 VWAP，
  与板块面板同款路径；注意不带 /get 的 /trends2 在所有 EM 主机 404）
  * 原生 node:http 客户端（绕过 Next 补丁过的 global fetch——dev server 内
    push2 系统性 "other side closed" 而独立 node 正常）
  * 容忍"响应后立即 RST"：body 累积后在 close 事件校验 JSON，避免 undici 丢弃已收到的 body
  * 多 IP 重试：dns.resolve4 解析 A 记录逐个尝试（轮询后端好坏不一）
  * 午休衔接点 ensureLunchContinuity（13:00 补 morning close，腾讯路径共用）
  * lastGood 降级守卫：EM+腾讯都失败时返回最近一次 1 分钟级数据（≤15min），
    杜绝退化为新浪 5 分钟散点；新浪仅作冷启动兜底
  * isOneMinuteGrade 校验相邻间隔 ≥60% 为 1 分钟才入库 lastGood
- 修复 2（Y 轴域拉伸钳制，time-sharing-panel.tsx）：
  5日最低价（茅台 1322 vs 今日 1452-1480）曾把 Y 域拉到 175 点跨度，
  价格线被压到底部 ~16% 区域，默认滚动位置看不到曲线（次要根因）
  → 域扩展设上限（≤60% 日内跨度），越界的 5日最低 pill 改为边缘钳制渲染
  （连接线/圆点 clamp 到绘图区边缘，候选锚点用钳制后位置，fallback 双向 clamp）
  → 价格线占面板比例 16% → ~70%
- 修复 3（EM 限流再平衡）：
  该端点族按 IP 突发限流（timeline 24/min + sector 12/min + 指数 12/min ≈ 48/min 触发多分钟重置窗口）
  → ashare-timeline 路由交易时段 TTL 1s→8s（盘中实时性由 quote 每 2.5s 合并尾点保证，
  quote 补尾 slot 的 avgPrice 改继承上一 slot 的 VWAP，避免均线尾尖跳到现价）
  → ashare-sector 路由 4s→15s（板块趋势为慢参考层）
- 验证（茅台 600519，午休时段完整上午数据）：
  * API 连续 3 次探测：122 items、120 个 1 分钟间隔、09:30→13:00 ✓
  * 浏览器 DOM：价格 Line 121 个连续 C 段、0 散点；线宽 555px 高 331px ✓
  * 分时倒影 + 分时两种模式截图：曲线/均线/VWAP带/信号标签/十字光标 tooltip 完整 ✓
  * VOL 量能柱、MACD 双线柱完整 ✓；5日最低 pill 边缘钳制显示 ✓
  * 控制台无图表相关错误（SectorTopBottom 500 为 EM clist 端点坏窗口的
    既有独立问题，EM 恢复后自愈，未纳入本次范围）
  * bun run lint 通过

Stage Summary:
- 分时图"不显示"的真正根因是数据源层：腾讯 WAF → 新浪 5 分钟降级 → 散点化，
  叠加 Y 域被远低参考价拉伸导致的"空白图表"视觉；两者都已修复
- 数据链路新秩序：EM trends2/get（1分钟主源，raw http 客户端）→ 腾讯 →
  lastGood(≤15min) → 新浪 5 分钟；EM 请求预算 ~20/min 避免再触发限流
- 已知残留：东财端点坏窗口期内 sector-top-bottom 卡片（clist 端点）可能 500，
  属既有独立问题，如持续可复用 raw http 客户端治理
- 涉及文件：src/lib/em-timeline-server.ts（新）、src/lib/ashare-api.ts、
  src/app/api/stock/ashare-timeline/route.ts、src/app/api/stock/ashare-sector/route.ts、
  src/components/time-sharing-panel.tsx、src/app/page.tsx

---

Task ID: 27
Agent: Main Claude (Z.ai Code)
Task: 回踩选股无数据修复 — 涨停股池精准候选 + 新浪K线主源 + 空结果短缓存

Work Log:
- 用户反馈：回踩选股 tab 没有数据（扫描总数 0、符合筛选 0、日期显示 2026-11-24）
- 排查过程（浏览器截图 + API 直调 + 数据源逐层探测）：
  1. /api/stock/limit-up-pullback 返回 cached:true、totalScanned:0 —— 空结果被
     无差别缓存 10 分钟（旧逻辑 emptyResult 也 set 到 10min TTL）
  2. curl 直连探测 EM 三端点：https://push2delay 全灭（TLS 层 unexpected eof，
     服务器收完请求即 RST，与 Task 26 push2 同源）；push2his（K线）http/https
     全灭且单 IP（101.42.128.173）坏死；腾讯 fqkline WAF 501
  3. 幸存通道：http://push2delay clist（列表）、http://push2ex（涨停股池）、
     新浪 CN_MarketData 日K（money.finance.sina.com.cn，dev server 内全局 fetch 可用）
- 修复 1（共享原生客户端 src/lib/em-raw-client.ts）：
  从 em-timeline-server.ts 抽出 raw node:http(s) 客户端（多 IP 重试 + 容忍
  "响应后 RST" 的 body 累积校验），新增 emRawJson(urls[], attempts) 便捷封装；
  em-timeline-server.ts 改为 import 复用（删除本地副本）
- 修复 2（路由重写 limit-up-pullback/route.ts）——扫描模型从「盲扫 5000 只」
  改为「涨停股池精准候选」：
  1. 交易日历：新浪上证指数日K（sh000001 直接 URL，注意 toSinaSymbol 会把
     sh000001 错映射成 sz000001 平安银行，故不走 getAShareKLine）取最近 11 个交易日
  2. 候选：push2ex getTopicZTPool 按日查询最近 10 个交易日（不含今日——
     今日封板股必然 daysSinceLimitUp=0 被过滤），most-recent-first 去重，
     候选从 ~5000 降到 ~330（过滤北交所/ST）
  3. K线：新浪 getAShareKLine(scale=240) 主源 + EM push2his raw 客户端兜底；
     changePct 由相邻 close 重算（新浪日K无该字段）
  4. 涨停日定位由「10日窗口扫描」改为「股池日期精确匹配」（kline.findIndex
     date===poolDate），阈值校验保留（主板9.5/创业科创19.5）
  5. 实时行情 ulist 走 emRawJson（3 次重试，接口间歇性丢包）
  6. 缓存分级：有结果 10min / 空&失败 60s；数据源全灭时返回
     success:false + error 文案（不再静默返回空成功）
  7. 失败可观测：klineOk===0 && klineFailed>0 判定为数据源故障
- 验证（2026-11-24 盘中）：
  * API 首扫 3.8s（旧设计预算 55s）：331 候选 → 250 只回踩达标，
    首条亚玛顿 002623（11-11 涨停 23.33 → 18.94，approachPct 100%，8 天）
  * 二次调用 20ms 命中缓存（cached:true）
  * 浏览器：回踩选股 tab 刷新后 扫描 331 / 符合 153 / 深度回踩 143 /
    平均回踩 96%，回踩深度分布直方图正常，表格 153 只 4 页分页、
    连板数/风险评分/迷你K线/快捷标签完整
  * 控制台无错误；bun run lint 通过
- 已知残留：screener/market-breadth-distribution/sector-top-bottom 路由仍在用
  https://push2delay|push2his（EM 坏窗口期会退化），如出问题可复用
  em-raw-client.ts + http:// 方案治理

Stage Summary:
- 回踩选股"没有数据"的根因是数据源层：EM push2delay/push2his HTTPS 全被 RST，
  旧路由又把空结果缓存 10 分钟，双重叠加成"永久空"
- 扫描模型升级：5000 只盲扫 → 涨停股池按日精准候选，单次扫描 55s 预算 →
  3.8s 实测，上游请求量降 ~20 倍，K线依赖从单一 EM 变为 新浪主+EM兜底
- 涉及文件：src/lib/em-raw-client.ts（新）、src/lib/em-timeline-server.ts（复用重构）、
  src/app/api/stock/limit-up-pullback/route.ts（重写）

---

Task ID: 28
Agent: Main Claude (Z.ai Code)
Task: 回踩选股页面全量按钮记忆 — UI 状态 JSON 持久化

Work Log:
- 用户需求：回踩选股页面所有按钮加记忆，存 JSON，刷新不回初始值
- 现状盘点（组件 9 项已有持久化）：结果/筛选/搜索/标签/收藏/直方图区间/
  视图(表格卡片)/每页数/已存策略 均已走 localStorage JSON
- 缺口补齐（新增 UI_STATE_KEY = "limit-up-pullback-screener-ui-state"
  单一 JSON blob，readUiState/writeUiState merge 读写防互相覆盖）：
  1. FilterPanel 三个折叠组：核心筛选/基本面筛选/价格与板块 (coreOpen/basicOpen/priceBoardOpen)
  2. 筛选条件面板整体折叠 filtersExpanded
  3. 排序 sortField/sortOrder（恢复值经 SORT_FIELDS 白名单校验，防脏数据）
  4. 只看收藏 showFavoritesOnly
  5. page.tsx 选股结果/历史验证子 tab screenerSubView
     （key: limit-up-pullback-screener-subview；菜单点击仍重置为结果视图，属显式操作）
- 实测（agent-browser）：折叠筛选面板→刷新→保持折叠 ✓；切历史验证→刷新→
  选中保持（bg-primary 校验通过）✓；点"最大回撤"列头→JSON 更新为
  sortField:maxPullbackPct 且其他键保留→刷新→箭头在该列、数据按 -43.3%→-42.0% 降序 ✓
- bun run lint 通过

Stage Summary:
- 回踩选股页所有状态型控件（折叠组、面板折叠、排序、收藏过滤、子 tab）全部
  持久化到 localStorage JSON；加上原有 9 项，页面 14 类状态刷新后全部恢复
- 涉及文件：src/components/limit-up-pullback-screener.tsx、src/app/page.tsx

---

Task ID: 29
Agent: Main Claude (Z.ai Code)
Task: 回踩深度分布直方图配色微调 — "回到起涨点"桶去黑化

Work Log:
- 用户反馈：直方图用黑色当背景色不好看
- 根因：最后一个桶（回到起涨点，占比常达 ~88%）用 bg-rose-700（#be123c
  深绯红），整根柱子填满后视觉接近黑色；其余桶均为 -500 亮色系
- 修复：bg-rose-700/800 → bg-rose-500/600，与其余四桶配色规范一致
- 验证：DOM class 确认为 bg-rose-500，截图柱子呈明亮玫瑰红；lint 通过
- 涉及文件：src/components/limit-up-pullback-screener.tsx（1 行）

---

Task ID: 30
Agent: Main Claude (Z.ai Code)
Task: 回踩选股页尾新增「共性归纳」板块 — 归纳涨停后回踩又上涨股票的共性

Work Log:
- 用户需求：归纳涨停后回踩又上涨股票的共性，总结到页尾
- 新建 src/components/pullback-commonality.tsx：全部指标从当前扫描样本动态计算
  （非写死文案），随每轮扫描自动更新；样本 <5 只不渲染
- 分析口径（每只股票由 klineSummary 派生）：
  1. 反弹幅度 = 现价相对涨停后最低收盘价的涨幅
  2. 低点窗口 = 回踩低点距涨停日的交易日数；反弹启动 = 低点距最新交易日数
  3. 连板数 = 涨停日向前连续涨停天数（19.5%/9.5% 阈值按涨停日涨幅推断板块）
- 内容结构：6 统计芯片（样本/自低点反弹/今日收涨/中位反弹/首板占比/低点窗口）
  + 分组洞察（反弹动能/回踩结构/时间窗口/涨停质量/资金画像/风险甄别）
  + 「一句话共性」高亮框 + 口径说明
- 实测共性（255 样本）：69% 自低点反弹≥3%（中位+5.0%）、89% 今日收涨、
  83% 完全回吐涨幅（最大回撤中位 23.1%）、低点距涨停中位 6 天且 88% 落在 3-8 天、
  低点后中位 1 天即反抽、首板占 85%
- 优雅降级：行情富化（换手/量比/市值）缺失时（ulist.np 间歇不可用），
  有效样本 <30% 则资金画像条目自动隐藏，其余洞察不受影响
- 顺带修复 API 字段映射 bug：fetchRealtimeQuotes 误用 f9（市盈率）当量比、
  f10（量比）当市值 → 改为 f10=量比、f20（元）/1e8=市值（亿）；
  该 bug 同时污染表格市值列、量比列与回踩质量评分
- 验证（agent-browser）：页尾渲染 ✓；富化缺失时资金画像隐藏 ✓；
  移动端 390px 芯片自动 2 列、卡片 356px 无溢出（页面级横向滚动为原表格
  overflow-x-auto 设计）✓；控制台无错误 ✓
- bun run lint 通过
- 涉及文件：src/components/pullback-commonality.tsx（新建）、
  src/components/limit-up-pullback-screener.tsx（导入 + 页尾挂载）、
  src/app/api/stock/limit-up-pullback/route.ts（字段映射修复）

---

Task ID: 31
Agent: Main Claude (Z.ai Code)
Task: 表格智能信号标注 — 机会/观察/风险（依据共性归纳结论）

Work Log:
- 用户需求：根据共性归纳的结论，在选出股票表格中标明哪些是机会、哪些是风险
- 新建 src/lib/pullback-metrics.ts（共享计算库）：buildExt（自低点反弹/低点窗口/
  反弹启动耗时/连板数）+ calcStockSignal（机会/风险信号评分）+ SIGNAL_META
- 信号评分构成（0-100，规则逐条对应 Task 30 共性结论）：
  反弹确认 40（≥3% 为确认线）+ 今日动向 20 + 回踩位置 20（深回踩守起涨点最佳）
  + 时间窗口 10（3-8 天高发期）+ 板型弹性 10（首板为主力）+ 量能确认 10
- 判定门槛：score≥65 且反弹已确认 → 机会；score≤38 → 风险；其余 → 观察；
  硬性否决：未脱离低点区域 + 今日续跌 → 封顶 30 分（风险）；
  龙回头形态（深回踩+低点反弹+今日企稳+守住起涨点）在依据中置顶标注
- 展示位：表格新增可排序「信号」列（代码/名称后第一数据列，徽章悬浮显示
  全部判定依据）；卡片视图头部徽章；展开详情新增信号卡（含 6 项依据）；
  统计卡新增「机会股 N / 风险股 N」；CSV 导出新增信号/信号评分两列
- 筛选：快捷标签新增「机会股」「风险股」（置前，选择状态持久化沿用原机制）；
  页尾共性归纳新增信号分布行（口径与表格一致，同源 pullback-metrics）
- 校准（255 只真实样本）：机会 191（75%）/ 观察 47（18%）/ 风险 17（7%），
  与共性归纳"69% 反弹≥3%"吻合；风险组全部命中否决规则（未脱离低点+续跌）
- 重构：pullback-commonality.tsx 去重，改用共享库（消除 buildExt/median/share
  重复定义）
- 验证（agent-browser）：信号列渲染+悬浮依据 ✓；点击列头降序（前 4 行全 100 分）
  ✓；机会股标签筛选后 50 行全为机会 ✓；统计卡 169/17 ✓；页尾分布
  191/47/17（全样本）✓；展开详情信号卡 ✓；卡片视图徽章 ✓；移动端 390px 正常 ✓；
  控制台无错误 ✓
- bun run lint 通过
- 涉及文件：src/lib/pullback-metrics.ts（新建）、
  src/components/pullback-commonality.tsx（重构+信号分布行）、
  src/components/limit-up-pullback-screener.tsx（信号列/徽章/筛选/导出/统计卡/图例）

---

Task ID: 32
Agent: Main Claude (Z.ai Code)
Task: 机会信号改为鲜艳实底红标注（用户要求红色高亮）

Work Log:
- 用户需求：信号为"机会"时用更鲜艳的颜色（如红色）标注
- 修改 src/lib/pullback-metrics.ts SIGNAL_META：
  1. opportunity.badge: 浅绿底 → 实底红（bg-red-500 text-white shadow-red-500/40
     光晕），表格中最醒目，符合 A 股"红=涨/机会"语义
  2. 新增 card 字段与 badge 分离：展开详情信号卡容器改用低饱和红底
     （bg-red-500/[0.07]），避免整卡变实红色块；观察/风险卡样式同步迁移
- 同步配色：统计卡"机会股"emerald → red；策略说明图例注明"机会(实底红)"
- 页尾共性归纳的信号分布徽章复用 SIGNAL_META.badge，自动跟随变实底红
- 验证（agent-browser）：表格机会徽章 computed bg=red-500/白字 ✓；
  与琥珀色"观察"对比鲜明 ✓；展开详情卡为浅红底非实底 ✓；
  页尾"机会 191 只（75%）"实底红 ✓；lint 通过
- 涉及文件：src/lib/pullback-metrics.ts、src/components/limit-up-pullback-screener.tsx

---

Task ID: 33
Agent: Main Claude (Z.ai Code)
Task: 机会/风险改为「盘前研判」— 每天盘前预计算，剔除当日盘中数据（不盘中看谁涨就标机会）

Work Log:
- 用户需求：机会和风险要每天盘前就算出来，而不是盘中看谁涨了就是机会（消除事后诸葛口径）
- 口径重构（src/lib/pullback-metrics.ts）：新增 calcPremarketSignal（T-1 收盘口径评分）
  + deriveT1Stock（把 klineSummary 截断到基准日、现价/涨跌幅/回踩深度全部改按 T-1 收盘价重算，
  换手/量比清零防盘中数据泄漏）+ chinaDateStr（中国时区日期）
  - "今日动向 20 分"→"昨日动向 20 分"（T-1 涨跌幅），"量能确认 10 分"→"昨日K线形态 10 分"
    （阳线加分），其余因子（反弹确认/回踩位置/时间窗口/板型弹性）同分值；机会/风险门槛不变（≥65/≤38）
- 共享管道抽取（src/lib/pullback-pipeline.ts 新建）：fetchTradeDates/fetchZTPool/fetchDailyKline/
  fetchRealtimeQuotes + getChinaNow/computeBasisDate/stripFormingBar/getTradeDatesCached（日历缓存 10 分钟）；
  原 limit-up-pullback/route.ts 改为从共享库导入（删本地重复定义，行为不变）
- 服务端快照（src/app/api/stock/premarket-signals/route.ts 新建）：
  - 基准日规则：盘中/盘前 = 上一交易日（剔除当日形成中K线）；收盘后（>=15:05）= 当日（为次日盘前备好）
  - GET 智能读取：basisDate === 当前 T-1 基准日即新鲜（全天只算一次、盘中不漂移）；过期自动重算，
    重算失败降级返回旧快照（stale 标记）；POST 强制重算（inflight 防并发重复计算）
  - Prisma 新模型 PremarketSignalSnapshot（basisDate 唯一键，payload JSON，保留历史快照）
  - 实测：POST 全量计算 255 只（~40s），GET 命中缓存 21ms；stats 机会 175/观察 63/风险 17
- 前端（limit-up-pullback-screener.tsx）：
  - 新增 PremarketBanner：盘前研判快照横幅（基准日/计算时间/覆盖数 + 机会/观察/风险徽章 + 重算按钮）
  - resolveSignal 解析器：优先命中服务端快照，未入快照的股票本地 calcPremarketSignal 同口径兜底；
    信号列/排序/CSV（表头改"盘前信号/盘前评分"）/快捷标签/统计卡/展开详情/卡片视图全部切换
  - 快捷标签改名"盘前机会/盘前风险"（id 不变，localStorage 已存策略兼容）；SignalBadge 悬浮注明
    "盘前口径：仅用 {basisDate} 收盘前数据判定，与今日盘中涨跌无关"；SummaryCard"机会股"→"盘前机会"（含观察数）
- 页尾共性归纳（pullback-commonality.tsx）：接收 resolveSignal/basisDate，信号分布行标注
  "盘前口径（基于 T-1 收盘数据）"，与表格口径保持一致
- 定时任务：cron 工具新建"盘前研判自动计算（每日 08:35 Asia/Shanghai，周末跳过）"，
  触发 POST /api/stock/premarket-signals，失败自动查 dev.log 重试
- 验证（agent-browser）：横幅渲染（T-1 收盘口径徽章 + 175/63/17）✓；表格信号列 100 机会置顶（排序持久化）✓；
  悬浮 tooltip 完整 T-1 依据 ✓；展开详情信号卡（截至昨收/昨日大涨/昨日收阳）✓；
  "盘前机会"标签筛选 50 行全机会 ✓；统计卡"盘前机会 157/风险 17/观察 59" ✓；
  页尾分布标注盘前口径 ✓；移动端 390px 横幅 358px 无溢出 ✓；控制台无错误 ✓
- bun run lint 通过
- 涉及文件：src/lib/pullback-metrics.ts（盘前引擎）、src/lib/pullback-pipeline.ts（新建共享管道）、
  src/app/api/stock/premarket-signals/route.ts（新建）、prisma/schema.prisma（PremarketSignalSnapshot）、
  src/components/limit-up-pullback-screener.tsx、src/components/pullback-commonality.tsx、
  src/app/api/stock/limit-up-pullback/route.ts（改用共享管道）

---

Task ID: 34
Agent: Main Claude (Z.ai Code)
Task: 盘前研判「每日 08:35 自动计算」机制在页面上可视化（自动计算标识 + 历史留痕弹层）

Work Log:
- 用户需求：把盘前研判自动计算（每日 08:35）的功能也在页面上体现出来（此前定时任务只在后台跑，页面无感知）
- 新增历史快照 API（src/app/api/stock/premarket-signals/history/route.ts）：
  GET 返回最近 12 个基准交易日的快照（basisDate/computedAt/stockCount/stats），
  PremarketSignalSnapshot 按 basisDate 唯一键天然去重，一行 = 一天的自动计算留痕
- 前端（limit-up-pullback-screener.tsx）：
  - 新增 PremarketHistoryItem 接口 + premarketHistory 状态 + fetchPremarketHistory
    （挂载时与主快照并行拉取；手动重算完成后自动刷新留痕）
  - PremarketBanner 新增绿色徽章「每日 08:35 自动计算」（Clock 图标，悬浮说明定时任务三要点：
    每交易日 08:35 触发/周末跳过、按基准日入库留痕、全天复用同一快照不漂移）；
    说明行追加「下一交易日 08:35 自动更新」
  - 新增「历史 N 天」按钮 + PremarketHistoryPopover 弹层（w-360，max-h-72 滚动）：
    每行显示基准日｜计算时间｜机会/观察/风险迷你徽章｜覆盖数；
    09:15 前生成的行带日出图标（= 08:35 定时任务产物），底部注明判定口径
  - 时区修正：formatTimestamp/formatShortTimestamp/isPreMarketCompute 统一固定
    Asia/Shanghai（此前依赖浏览器时区，UTC 环境会显示 04:16 并误判盘前标记）
- 验证（agent-browser）：绿色徽章渲染+悬浮说明 ✓；历史弹层渲染（11-23｜11/24 12:16
  北京时间｜机会175/观察63/风险17｜255只）✓；中午手动计算的快照正确不带日出图标 ✓；
  390px 移动端横幅换行正常、弹层无溢出 ✓；控制台无错误 ✓；lint 通过
- 说明：定时任务本体（每日 08:35 POST /api/stock/premarket-signals，周末跳过）已于 Task 33
  创建；当前库中已有 1 条留痕（11-23 基准日），首个定时产物将于下一交易日 08:35 生成
- 涉及文件：src/app/api/stock/premarket-signals/history/route.ts（新建）、
  src/components/limit-up-pullback-screener.tsx

---

Task ID: 35
Agent: Main Claude (Z.ai Code)
Task: 回踩选股移到菜单栏第一位

Work Log:
- 用户需求：把回踩选股放到菜单栏的第一位
- 修改 src/app/page.tsx 顶部导航 tab 数组顺序：「limit-up-pullback」从第 7 位提前到第 1 位
  （新顺序：回踩选股 → 做T → 选股 → 低开 → 分时选股 → 轮动 → 早盘选股 → 部署）
- 默认落地图已是回踩选股（pageMode 初始值即为 limit-up-pullback），此次仅调整视觉顺序，
  其余逻辑（setPageMode / 子视图重置）不受影响
- 验证（agent-browser，重新登录 888888）：菜单栏顺序 ✓；回踩选股首位且默认高亮 ✓；
  页面正常渲染（盘前研判横幅/统计卡）✓；lint 通过
- 涉及文件：src/app/page.tsx

---

Task ID: 36
Agent: Main Claude (Z.ai Code)
Task: 表格列顺序调整 — 涨停涨幅移到走势列前、今日涨跌移到连板列后

Work Log:
- 用户需求：回踩选股列表中 1) 涨停涨幅放到走势列前面 2) 今日涨跌放到连板列后面
- 修改 src/components/limit-up-pullback-screener.tsx 表格视图（表头+表体同步移动，共 6 处编辑）：
  新列序：展开 | 代码/名称 | 信号 | 涨停日 | 连板 | 今日涨跌 | 涨停价 | 起涨点 | 当前价 |
  回踩深度 | 距涨停 | 最大回撤 | 风险 | 质量 | 换手率 | 市值 | 量比 | 涨停涨幅 | 走势 | 收藏
- 排序字段不变（currentChangePct / limitUpPct），SortableHead 排序、CSV 导出、卡片视图、
  展开详情均不受影响（CSV 保持数据逻辑顺序，未随视觉列序变动）
- 验证（agent-browser，重新登录 888888）：表头顺序 ✓；首行单元格逐列对齐
  （连板 2B → +1.45% 今日涨跌 → 13.96 涨停价 …；量比 0.98 → +10.01% 涨停涨幅 → 走势）✓；
  今日涨跌列点击排序（升序箭头生效）✓；lint 通过
- 涉及文件：src/components/limit-up-pullback-screener.tsx

---

Task ID: 37
Agent: Main Claude (Z.ai Code)
Task: 距涨停列移动到涨停日列前面

Work Log:
- 用户需求：把距涨停这一列移动到涨停日前面
- 修改 src/components/limit-up-pullback-screener.tsx 表格视图（表头+表体同步，4 处编辑）：
  新列序：展开 | 代码/名称 | 信号 | 距涨停 | 涨停日 | 连板 | 今日涨跌 | 涨停价 | 起涨点 |
  当前价 | 回踩深度 | 最大回撤 | 风险 | 质量 | 换手率 | 市值 | 量比 | 涨停涨幅 | 走势 | 收藏
- 排序字段不变（daysSinceLimitUp 可排序），其余视图/导出不受影响
- 验证（agent-browser，重新登录 888888）：表头顺序（信号→距涨停→涨停日）✓；
  首行单元格对齐（83机会 → 8天 → 11-11 → 2B → +1.45% …）✓；视觉截图核对 ✓；lint 通过
- 涉及文件：src/components/limit-up-pullback-screener.tsx

---

Task ID: 38
Agent: Main Claude (Z.ai Code)
Task: 表格新增「板块」列（涨停价前面，东财 f100 行业板块）

Work Log:
- 用户需求：在涨停价这一列前面新增股票所属板块
- 数据管道（src/lib/pullback-pipeline.ts）：fetchRealtimeQuotes 字段加 f100（东财所属行业，
  ulist.np 原接口实测可用：白酒Ⅱ/专用设备/光伏设备/乘用车），返回 Map 增加 sector
- 类型（src/lib/pullback-metrics.ts）：PullbackStock 增加 sector?: string（可选，
  盘前快照路由的对象字面量无需改动，行情富化失败时列显示 --）
- API（limit-up-pullback/route.ts）：Step 4 行情富化时 stock.sector = q.sector
- 前端（limit-up-pullback-screener.tsx）：
  - 表头/表体新增「板块」列（今日涨跌与涨停价之间，w-90，超长截断+悬浮完整名，
    注明"东财行业板块"；未富化时显示 --）
  - CSV 导出同步新增「板块」列（涨停连板之后、涨停价之前，与表格位置一致）
  - 新列序：展开 | 代码/名称 | 信号 | 距涨停 | 涨停日 | 连板 | 今日涨跌 | 板块 | 涨停价 |
    起涨点 | 当前价 | 回踩深度 | 最大回撤 | 风险 | 质量 | 换手率 | 市值 | 量比 | 涨停涨幅 | 走势 | 收藏
- 验证：API 实测 254 只全部带 sector（专用设备/光伏设备/消费电子/照明设备Ⅱ/工业金属…）✓；
  agent-browser 表头顺序+首行对齐（+2.09% → 专用设备 → 13.96）✓；视觉截图 ✓；
  控制台无错误 ✓；lint 通过
- 涉及文件：src/lib/pullback-pipeline.ts、src/lib/pullback-metrics.ts、
  src/app/api/stock/limit-up-pullback/route.ts、src/components/limit-up-pullback-screener.tsx

---

Task ID: 39
Agent: Main Claude (Z.ai Code)
Task: 表格板块列后新增「概念」列（股票最贴切概念）

Work Log:
- 用户需求：在板块这一列后面新增概念，列出股票最贴切的概念
- 数据方案：东财 slist 单股接口（qt/slist/get spt=3，返回个股全部所属板块含 BK 代码+当日板块涨幅）；
  概念全集 t:3（554 个）用于精确归类，t:2 行业全集（86 个）作降级排除
- "最贴切"定义：剔除风格/资金标签（STYLE_TAG_RE：昨日涨停/融资融券/机构重仓/连续亏损/多板/新高
  /茅指数…共 60+ 关键词）后，取该股所属概念中「今日板块涨幅最高」者（题材动量最强，
  涨停回踩语境下大概率就是涨停驱动题材）
- 三级降级（保证概念列尽量有值）：
  1) 精确模式：t:3 全集可用 → 只认集合内板块（行业/地区/风格天然排除）
  2) 降级模式：t:3 失败但 t:2 行业全集可用（体小抗限流）→ 排除行业+地区（「板块」后缀）+[ABHN]股
  3) 兜底模式：两者都失败 → 名称启发式（行业链总在 slist 最前：跳过 sector 及其之前；再剔风格）
- 工程细节（EM push2 突发限流应对）：
  - clist 分页抓取走 emRawFetch（多 IP+容忍 RST）+ 退避重试 + 截止时间（t:3 12s / t:2 8s），
    被限流时快速退出降级，不拖慢请求
  - 概念结果模块级缓存 30 分钟（盘中板块归属不变；首次扫描 ~10s，二次 refresh 5.6s）
  - slist 低并发 12 + 批间隔 150ms + 总预算 30s（此前 25 并发会触发 EM 限流全失败）
  - 空结果不缓存，下次请求自动重试
- 数据链：pipeline 新增 getConceptBoardCodes/getIndustryBoardCodes/fetchStockBoards/
  pickBestConcept/resolveStockConcept；route Step 4.5 并行取两全集后批量解析 concept；
  PullbackStock 增加 concept?: string（盘前快照路由不受影响）
- 前端：板块列后新增「概念」列（w-110，截断+悬浮说明选取规则；无数据显示 --）；
  CSV 导出同步加「概念」列（板块之后）
- 新列序：展开 | 代码/名称 | 信号 | 距涨停 | 涨停日 | 连板 | 今日涨跌 | 板块 | 概念 | 涨停价 |
  起涨点 | 当前价 | 回踩深度 | 最大回撤 | 风险 | 质量 | 换手率 | 市值 | 量比 | 涨停涨幅 | 走势 | 收藏
- 验证：API 实测 255/255 全覆盖（达意隆=机器人概念、亚玛顿=特斯拉概念、瀛通通讯=智能音箱、
  常铝股份=汽车热管理、惠发食品=预制菜概念…），风格标签误判已修复；
  二次请求 5.6s（概念缓存生效）；agent-browser 表头+首行对齐（专用设备→机器人概念）✓；
  视觉截图 ✓；控制台无错误 ✓；lint 通过
- 涉及文件：src/lib/pullback-pipeline.ts、src/lib/pullback-metrics.ts、
  src/app/api/stock/limit-up-pullback/route.ts、src/components/limit-up-pullback-screener.tsx

## Task 39: 修复板块列不显示（行情富化降级被长缓存）
- 现象：板块列全部显示 --；接口实测 sector=None 且换手率/市值/量比全 0（行情 ulist 整体失败），概念列正常。
- 根因：fetchRealtimeQuotes 仅单 URL 变体、紧跟 K 线批量抓取后易被 EM 限流 RST；失败结果按完整 TTL 缓存 10 分钟，降级数据持续占据。
- 修复：
  1. pullback-pipeline.ts fetchRealtimeQuotes：push2delay/push2 × http/https 四变体；批间 250ms 退避；整批失败 600ms 后重试一次；f100="-" 归一化为空串。
  2. limit-up-pullback/route.ts：PullbackStock 补 sector?/concept? 类型；行情整体失败退避 1.2s 重试一次；quotesEnriched=0 时结果只短缓存 60s（storeAndReturn 支持 ttlOverride）。
- 验证：refresh=1 重算后 255/255 全部有板块（工业金属/光伏设备/消费电子等），换手/量比/市值同步恢复；浏览器登录 888888 后表格板块列渲染正常；lint 通过。

## Task 40: 回踩选股算法智能化升级（量能结构+涨停前趋势+破位度）
- 数据层：KLineDay 增加 volume（新浪原生返回但原先被丢弃；东财 f56 解析）；主管道/盘前管道 K 线 15→40 天（涨停前 MA20 需要）；EM 回看窗 35→60 自然日。
- 新指标（buildExt 扩展，旧缓存/旧快照缺数据时取中性分平滑兼容）：
  - volShrinkPct 回踩段均量较涨停日量萎缩度（缩量回踩=抛压枯竭，放量回踩=出逃迹象）
  - recentVolRatio 近3日均量/回踩段均量；stabilized 企稳（低点已过≥1天且末根非大阴）
  - brokenPct 起涨点失守度（不封顶，与 approachPct 100 封顶互补）；recent3DayDrop 近3日阴跌动能
- 信号评分升级为 7 因子 100 分制（盘中/盘前同构）：
  反弹确认35 + 当日/昨日动向15 + 回踩位置20 + 时间窗口8 + 板型弹性7 + 量能结构10 + 涨停前趋势5
  - 量能结构：缩量≥50%满分、≥30%高分、放量回踩 0 分；盘中量比≥1.5 降级为标注
  - 涨停前趋势 preTrend（route/premarket 用涨停日前完整K线算 MA5/MA10/MA20）：多头排列=5 分趋势首板，超跌反抽=1 分
- 风险分重构：主因子从"回踩深度"改为"起涨点失守度"（修正与共性归纳 Task 30 "深回踩是主流机会形态"的矛盾），构成 破位40+近3日阴跌20+最大回撤15+今日续跌15+时间损耗10；详情卡 breakdown UI 同步。
- 质量分量能项：改为"缩量结构60% + 量比适中40%"混合。
- 默认排序 approachPct→signalScore（最值得关注排最前，而非跌最深排最前）；CSV 增列：量能萎缩%/起涨点失守%/涨停前趋势。
- 附带修复：pullback-metrics 重复 SignalResolver 导出；前端本地 PullbackStock 补 sector/concept/preTrend 类型；盘前路由管道同步 40 天+volume+preTrend（原 15 天丢量）。
- 行情富化韧性（Task 39 后续）：首批前退避 400ms、整批失败重试退避 600→1200ms；route 定向补抓缺失批次（最多2轮）；降级判定从"完全失败"改为"富化率<70%"→短缓存 60s（修复部分批次失败被完整缓存 10 分钟的问题）。
- 验证：255/255 有量能、254/255 有 preTrend（86 多头/31 中期/137 超跌反抽）；盘前重算 133机会/103观察/17风险；板块列 0 缺失；默认信号分排序生效；详情卡显示"涨停前均线多头排列（趋势首板）"与新风险构成；lint 通过无 console 错误。

## Task 41: 回踩选股算法继续优化——结构精细刻画（ATR 波动归一化 + 低点量能分歧 + 反弹结构确认）
- 用户需求：继续优化涨停回踩选股的算法。Task 40 解决了"有没有量能维度"，本轮解决"阈值是否智能"：
  同一 5% 回踩在高波动股只是噪声、在低波动股已是深度修正，固定百分位阈值无法区分。
- 指标层（buildExt 扩展，旧缓存/快照缺 high/low/量数据 → 对应项 undefined 取中性，平滑兼容）：
  - atrPct 近10日平均真实波幅/现价（TR=max(H-L,|H-PC|,|L-PC|)，high/low 缺失退化为收盘差近似）
  - pullbackAtr 回踩深度(涨停收盘→低点收盘)折算的 ATR 单位数——衡量修正是否"跌透"
  - lowDayVolShrinkPct 低点当日量较涨停日量的萎缩度（低位抛压是否真正枯竭的精确刻度，与回踩段均量口径互补）
  - recentVolShrinkSeq 回踩近3日量能单调递减（抛压逐级衰减）
  - ma5Reclaimed 最新收盘 vs 近5日均价（反弹结构确认）；retestHeld 双底承接（低点后反弹≥2%→回落至低点区但收盘未破前低→仍在低点区，W底右侧入场时机）
- 评分层（盘中 calcStockSignal / 盘前 calcPremarketSignal 同构升级）：
  - 回踩位置(20) ATR 感知：「守住起涨点」容忍度放宽到 ≤0.5 ATR（保底 0.5%）——高波动股 1-2% 的下影不再算失守；
    深回踩但深度<1.2 ATR → 修正或不充分（防再探底），封顶 14；浅回踩但深度≥2.5 ATR（高波动股快速修正到位）→ +4
  - 量能结构(10) 精细化：低点当日极缩量(≥50%) +1 / 低点当日放量(<0) -1（低位分歧需防二次探底）/ 近端逐日萎缩 +1（封顶10）
  - 新增第 8 维度"结构调整"（-2~+6，叠加后 clamp 0-100，≥65/≤38 门槛不变）：
    MA5 收复 +2；反弹已确认但未收复 MA5 -2（纯反抽无结构）；双底承接 +4
  - 龙回头标注的破位容忍同步 ATR 归一化（brokenLu ≤ 0.5 ATR）；reasons 上限 9→10
- 前端：详情卡数据区新增 3 行（回踩深度(ATR)个 / 低点量能 缩量+X%绿·放量X%橙 / 反弹结构 双底承接·MA5上方红·下方绿）；
  质量分量能项改为"回踩段均量萎缩 80% + 低点量能枯竭 20%"混合（calcShrinkPart 共享函数，口径一致）；
  CSV 新增「回踩ATR」「低点量能%」两列（并顺手把每行 3 次重复 buildExt 调用合并为 1 次）
- 验证（bun 直跑共享库 + API 重算 + 浏览器）：
  - 盘中 235 只：123机会/93观察/19风险；ATR 覆盖 230/235、MA5 230/235、低点量能 235/235；
    新标注分布：ATR容忍破位 38、深度不足1.2ATR 10、浅回踩ATR达标 3、双底 28、逐日萎缩 59；top1 黑牡丹 96 分（破位3.0%在日内波动容忍内 + 收复MA5）
  - 盘前重算 229 只：119机会/69观察/41风险，快照落盘；标注分布：MA5收复147、低点量能121（极缩量62）、ATR容忍32、双底26
  - 典型样本：300528 盘前 100 分（极度缩量+低点当日极缩量69%+多头排列+MA5收复+ATR容忍）；600293 双底承接但深破位20.2%仍列观察（+4 不改判，符合设计）
  - 浏览器：登录后展开详情卡（瑞迪智驱 100 分：ATR 3.2 个/缩量71%/MA5上方 全部渲染）；搜索 600293 验证"双底承接"标签渲染；
    移动端 390px 表格区横向滚动为容器预期行为（20+ 列宽表，历史状态）；控制台无错误；lint 通过
- 涉及文件：src/lib/pullback-metrics.ts、src/components/limit-up-pullback-screener.tsx

## Task 42: 算法哲学转向——「底部是机会，反弹过高是风险」
- 用户洞察：股票在底部才是机会，反弹涨起来了反而是风险。原算法系统性偏向右侧追高：
  反弹确认 35 分"反弹越多分越高"、机会判定硬性要求反弹 ≥3%（底部好股永远是"观察"）、风险分完全没有位置过高因子。
- 量化本质：涨停回踩的赢利逻辑是低吸等二次启动，反弹高度=持仓成本上升=赔率下降；剩余空间（roomToHigh=
  距涨停价%）才是「再涨停」赔率的直接度量。同时防守边界：不是所有低位都是机会，阴跌创新低是陷阱（接飞刀）。
- 指标层：buildExt 新增 roomToHigh 距涨停价剩余空间(%，负=已越过涨停价)。
- 评分层因子 1 重构为「位置评估」(positionQualityScore 共享，0-35，盘中/盘前同构)：
  - A. 未反弹确认(r<3%)按「底部质量」评分：深回踩12 + 缩量8(≥50%满档/≥30%六成) + 双底承接8 + 企稳4 + 守住起涨点3；
    创新低(r<0)封顶 12（防接飞刀）——反弹不再是机会的必要条件
  - B. 已反弹按确认曲线但随高度衰减：[3,5):28 赔率较优 / [5,10):30 空间尚存 / [10,15):24 空间压缩 / ≥15:15 位置偏高；
    roomToHigh<5% 位置项封顶 15
- 判定层新增「底部潜伏型机会」：score≥65 且（反弹确认≥3% 或 底部潜伏：深回踩≥70%+缩量≥30%(或低点极缩量≥50%)
  +企稳/双底+未创新低）→ 机会；命中时标注「深回踩 + 缩量 + 企稳/双底，底部潜伏形态（左侧低吸，赔率优先）」。
  SIGNAL_META 机会 desc 改为「底部潜伏 / 反弹确认 + 企稳共振」。
- 总分级「追高/收复压制」（两函数同构）：roomToHigh<5% 或 收复比例≥75%（reboundFromLow/(reboundFromLow+roomToHigh)，
  低点→涨停价修复进度）→ 总分 min(score,60) 压到机会线下——修复"追高保护只压位置项、其他因子仍推上 65+"的漏洞
  （实测修复前：距涨停价仅剩 1.0% 的宁波东力 75 分机会、已越过涨停价 6% 的德龙汇能 67 分机会；修复后均被压制）。
- 风险分重构（前端 calcRiskScore+breakdown UI）：新增「追高空间压缩 ×0.15」主因子（room<3% 满格/<5% 10分/<8% 4分），
  权重重分：破位 40→35、阴跌 20→15、最大回撤 15→10，新增后总和仍 100。
- 前端：详情卡数据区新增「距涨停空间」行（<5% 橙色警示/≥15% 绿色）；SIGNAL badge 描述更新；CSV 新增「距涨停空间%」列。
- reasons 上限 10→12（底部质量分支 reasons 较多）。
- 验证（bun 直跑共享库 + API 重算 + 浏览器）：
  - 盘中 235 只：115机会/106观察/14风险（改前 123/93/19）；底部潜伏型机会 7 只解锁（示例：日上集团 79 分，
    r=2.7% 深回踩100%+极度缩量+双底+企稳）；高反弹机会 12→8 只（剔除的 4 只收复≥75% 或 room<5%）；
  - 盘前重算 235 只：114机会/84观察/37风险，快照落盘；标注分布：底部质量-回踩到位 69、追高赔率差压制 20、
    位置偏高 31、底部潜伏形态 8、反弹过半压制 4；top1 从高反弹股变为"反弹 9.1% 空间尚存"的中段股
  - 浏览器：华阳新材(600281) 76 分底部潜伏形态完整渲染（距涨停空间 38.8% 绿/深回踩100%/低点缩量65%/双底承接）；
    首行展示追高场景（距涨停空间 3.6% 橙色 + 追高空间压缩×0.15 构成行）；控制台无错误；lint 通过
- 涉及文件：src/lib/pullback-metrics.ts、src/components/limit-up-pullback-screener.tsx

## Task 43: 机会分级 A/B/C——胜率优先（「让胜率更高」）
- 用户诉求：继续优化算法，让胜率更高。Task 42 已把方向转向「底部低吸」，但 100+ 只机会对用户仍是均匀列表——
  同为「机会」，置信度差异很大。本轮引入**机会分级**：按证据强度分三档，引导用户优先关注胜率最高的组合、
  避免在 C 级票上下重仓（提高的不是命中率本身，而是「用户实际下单的期望收益」）。
- 分级规则（gradeOf 共享函数，盘中/盘前同口径，仅 opportunity 有 grade）：
  - A 级核心：score≥75 且 抛压枯竭证据（回踩段极度缩量≥50% / 低点当日极缩量≥50% / 双底承接）且 MA5 未失守
    （ma5Reclaimed !== false，左侧潜伏票允许未收复但不能破位）——高分 + 量能证据 + 结构不破的最可靠组合；
    命中时 reasons.unshift「机会分级 A 级（核心）：…，胜率优先组合」
  - B 级标准：score≥70（条件齐全）
  - C 级观察：其余（65-69，条件有瑕疵，轻仓试探）
- 数据结构：StockSignal 加 grade?: "A"|"B"|"C"；GRADE_META 导出（label/desc）；盘前快照 SignalEntry 持久化 grade。
- 前端：
  - SignalBadge 徽章显示「机会·A/B/C」；tooltip 增加分级标题（机会 · A 级（核心机会））+ 分级标准行 + 底部说明
    「机会按胜率分级 A/B/C」
  - 详情卡信号徽章「机会 · A 级」；SummaryCard 盘前机会副标题改「A 级 N · 风险 N · 观察 N」
  - 快捷筛选新增「A 级机会」一键标签（首位）；CSV 新增「机会分级」列
  - resolveSignal：快照命中但 grade 缺失（Task 42 前落盘的旧快照）→ 本地按同一 T-1 口径补算分级，避免整页降级
- 验证（bun 直跑共享库 + 快照重算 + 浏览器）：
  - 盘前快照（POST 重算落盘，basisDate 2026-11-24）235 只：114机会/84观察/37风险；分级 A 25 / B 57 / C 32；
    A 级样本 top：002124 天邦食品 94、300528 幸福蓝海 89、001226 89、002048 87；机会股 0 只含追高标注、
    全样本 17 只被追高/收复压制（Task 42 防线持续生效）
  - 盘中口径本地重算 234 只：106机会/108观察/20风险；分级 A 11 / B 56 / C 39；底部潜伏型机会 6 只（002593 79B、
    002021 79B 等）；机会股创新低 0 只（脚本初查 6 只为「未创新低」企稳文案误匹配，复查确认算法正确）
  - 浏览器（登录 888888）：「A 级机会」筛选命中并高亮；002124 徽章「94 机会·A」；详情卡距涨停空间 5.5%/ATR/低点量能/
    反弹结构齐全；tooltip 分级标题+标准行完整；移动端 390px 正常；dev log 全 200 无错误；lint 通过
- 涉及文件：src/lib/pullback-metrics.ts、src/app/api/stock/premarket-signals/route.ts、src/components/limit-up-pullback-screener.tsx

## Task 44: 页面底部「共性归纳」更新为新算法原理（底部低吸哲学 + 机会分级）
- 用户要求：把你的原理在页面底部更新。原底部卡片仍停留在 Task 30 旧原理（「机会 = 评分≥65 且反弹已确认」、
  反弹越多越好），与 Task 42/43 的「底部是机会、反弹过高是风险 + A/B/C 分级」哲学不一致。
- pullback-commonality.tsx 改造：
  - 统计层新增 chasedShare（距涨停价<5% 或收复≥75% 占比，位置赔率数据支撑）+ gradeN（机会分级 A/B/C 分布）；
    信号分布行新增「A 级核心 N」（红底白字）/「B 级 N」/「C 级 N」徽章
  - 洞察行重构（8 行）：「反弹动能普遍且启动快」→「反弹是『确认』而非『加分项』」（位置分随反弹高度递减）；
    「深回踩是主流形态」→「…也是低吸的入场区」（缩量枯竭+企稳/双底=入场区而非旁观区）；
    新增「底部是机会，反弹过高反而是风险」（核心哲学 + 本期 chasedShare% 已被追高压制 + 创新低封顶防接飞刀）；
    新增「机会分级 A/B/C——胜率优先」（A 级 = 评分≥75+抛压枯竭+未失守 MA5，左侧右侧双通道）；
    「反弹并非全部兑现」→「弱势股是陷阱不是便宜货」（硬性否决 + 创新低永不入机会）
  - 一句话共性加入操作哲学：底部低吸（左侧赔率优先）、反弹只确认不追高、优先 A 级核心组合
  - 口径说明全面重写：距涨停空间定义、机会双通道（反弹确认 或 底部潜伏形态完整条件）、A/B/C 分级标准、
    追高/修复压制规则、风险分追高因子
- 验证（浏览器登录 888888）：信号分布行 A 级核心 25 / B 级 57 / C 级 32 徽章渲染；
  8 个洞察行全部按新文案渲染（chasedShare=6%）；一句话共性与口径说明完整；
  sticky footer 正常（内容不足一屏贴底、长内容自然下推）；控制台无错误；lint 通过
- 涉及文件：src/components/pullback-commonality.tsx

## Task 45: 回踩深度分布选中态配色（黑色→琥珀色）
- 用户反馈：直方图选中柱子的背景/边框是黑色，太丑。根源：shadcn New York 主题 --primary 为
  oklch(0.205 0 0)（亮色模式≈纯黑），选中态 ring-primary/60 + bg-primary/5 + text-primary 全是黑色调。
- 修复（最小侵入，仅 Histogram 组件，不动全局主题）：选中态统一换琥珀色（amber）——
  与柱子本身 emerald/yellow/orange/red/rose 协调，语义上是「选中高亮」：
  - 区间按钮选中态：ring-2 ring-amber-500/70 bg-amber-500/10（原 ring-primary/60 bg-primary/5）
  - 计数文字与区间标签：text-amber-600 dark:text-amber-400（原 text-primary）
  - 柱顶指示点：bg-amber-500（原 bg-primary）
  - 「清空 (N)」按钮：琥珀色文字/浅琥珀背景/琥珀边框（原 primary 黑色调）
- 验证（浏览器登录 888888）：点击「50-70%」与「回到起涨点」两个区间，选中柱子呈现琥珀 ring+浅琥珀底+
  琥珀计数/标签/指示点，黑色消除；未选中柱子淡出正常；清空按钮琥珀色；控制台无错误；lint 通过
- 涉及文件：src/components/limit-up-pullback-screener.tsx（Histogram 组件 5 处 class）

## Task 46: 智能因子层——四个「已有数据但未参与评分」的维度纳入算法
- 用户诉求：继续优化回踩选股的算法，让其更加智能。盘点了评分库后发现四个维度有数据但从未参与评分：
  反弹段量能（共性归纳第 9 条「放量反抽确认动能；缩量反弹待量能验证」一直未落地）、板块字段（sector 仅用于
  展示）、日内振幅位置（high/low 未用于承接判断）、低点距今天数（daysSinceLow 未参与评分）。本轮将其全部
  纳入「智能因子层」——合计 -10~+10 的调整项，主要作用在 65-80 分边际带，让 B/C 级与门槛边缘区分更细。
- 四因子设计（均为小幅调整，缺数据自动跳过取中性）：
  - 反弹量能质量 (-3~+3)：低点后反弹段均量 / 低点前回踩段均量。≥1.2 放量反弹=二次启动获资金确认 +3；
    <0.7 缩量反弹=无量反抽防诱多 -3。新 ext 字段 reboundVolRatio。
  - 板块共振 (-3~+3)：同板块回踩样本数 + 同伴（剔除自身）平均涨跌（口径内）。count≥3 且同伴≥+2% 共振强 +3；
    同伴≥0 共振 +1；同伴≤-2% 板块退潮 -3（题材齐跌个股难独善其身）。新接口 SectorStat + buildSectorStats
    （盘中/盘前双口径，盘前模式过 deriveT1Stock 不泄漏盘中数据）。
  - 尾盘承接 (-2~+2)：最新K线收盘在日内振幅中的位置 closePos。≥0.7 报收日内高位承接强 +2；
    ≤0.3 报收低位隔日惯性低开风险 -2。
  - 低点新鲜度 (-2~+2, 仅左侧区 r<3)：daysSinceLow 1-3 天且未破=新鲜底部 +2；≥8 天仍未反弹=关注度衰减 -2。
- A 级门槛同步加严（胜率优先）：右侧确认票（r≥3%）必须量能不缩（reboundVolRatio≥0.8 或缺数据）——
  缩量反抽的「机会」恰是胜率杀手。分级说明与页尾文案同步更新。
- 数据链路：涨停池 API 自带 hybk 行业字段 → fetchZTPool 提取 sector → 盘前路由两遍式重构
  （先收集 psList → buildSectorStats(psList)（ps 已是 T-1 视角）→ 统一评分）；盘中管道 sector 仍由 f100 富化，
  池字段作兜底。前端 resolveSignal 本地补算时用扫描全集构建板块统计（premarket 模式），与服务端口径对齐。
- 前端透出：详情卡新增「反弹量能 / 报收位置 / 板块共振」3 行（含配色语义：放量/高位承接红涨色、
  退潮/走弱绿跌色）；SignalBadge tooltip 说明追加智能因子层；页尾新增「智能因子层」洞察行 +
  口径说明重写；reasons 截断 12→14 保证新因子文案不被裁剪。
- 验证（bun 直跑共享库 + 盘前快照 POST 重算 + 浏览器）：
  - 盘中 241 只（sector 覆盖 100%）：reboundVolRatio 覆盖 36%（仅有反弹段者）、closePos 99.6%；
    板块统计 71 个板块（汽车零部件 25 只/专用设备 18 只…）；评分位移 127 只（+112/-15），门槛穿越 5 只
    （金辰股份 64→65C 入机会）、分级变化 1 只；A 级 6 只中右侧量能违规 0；新增 reason 命中：
    板块共振 109/退潮 12/放量反弹 12/缩量反弹 17/低点新鲜 11/日内低位 207
  - 盘前快照重算（basisDate 2026-11-25，T-1 为大跌日）：239 只 16 机会/57 观察/166 风险（A2/B6/C8）；
    板块退潮 157 命中符合市况；A 级样本 300237 reasons 含完整因子链（含板块退潮 -3 仍达 A 的高分组合）
  - 浏览器（登录 888888）：统计卡「A 级 2」；A 级机会筛选 002124/300237；300237 详情卡三行新因子渲染正确
    （反弹量能 温和0.81倍 / 报收位置 日内63% / 板块共振 汽车零部件·25只·均值-6.2% 绿色退潮警示）；
    tooltip 判定依据完整；页尾智能因子层洞察行渲染；控制台 0 错误；lint 通过
- 涉及文件：src/lib/pullback-metrics.ts、src/lib/pullback-pipeline.ts、src/app/api/stock/premarket-signals/route.ts、
  src/components/limit-up-pullback-screener.tsx、src/components/pullback-commonality.tsx

## Task 47: 近 5 日热点概念榜（每日涨幅前三）页面展示
- 用户诉求：把最近五天每天的涨幅前 3 名热点概念在页面中展示出来。落地为回踩选股页
  SummaryCard 与直方图之间的「近 5 日热点概念」面板——为 Task 46 板块共振因子提供市况参照
  （判断个股所属题材是持续热点还是一日游）。
- 数据方案（新接口 /api/stock/hot-concepts）：东财概念板块（m:90+t:3，554 个，剔除风格/统计类
  伪概念后约 440 个）。历史每日涨幅用板块日 K（secid=90.BKxxxx，klt=101，f59=当日涨跌幅，
  lmt=8）回溯；当日值用 clist 快照（f3 涨幅/f5 量/f6 额）单请求覆盖全市场，今日列永远完整。
- 限速攻坚（本轮主要工作量）：EM push2 系对突发连发按 IP 频控（rc:100 / 直接 RST 断连），
  undici/bun fetch 还会把「已回完 body 立即 RST」的正常响应当致命错误丢弃（em-raw-client.ts
  注释早已记录）。踩坑序列：全局 fetch 并发 12 → 84/94 失败；emRawFetch 并发 8 → 仍约半数
  rc:100；间隔 250-400ms 也只有 ~40% 成功。最终架构：
  - 所有 EM 请求走模块级限速队列（并发 3 + 最小间隔 200ms，em-raw-client 原生 http 容忍
    premature close，多 IP 候选）
  - 历史日 K 磁盘持久缓存（.cache/hot-concepts-history.json，原子写 tmp→rename）：历史条目
    永不变化，每板块每天只刷一次；服务重启后从磁盘秒恢复，无需重拉
  - 后台 warmup 渐进补全（候选集=今日涨幅/5日涨幅/主力净流入各前 150 去重，约 260-320 个），
    接口先返回已收录部分（meta.complete=false），前端 3 秒轮询直至收敛（最多 15 次，错误路径
    也续期）
  - 候选集按交易日冻结（盘中 f3 变动会让 warmup 追移动目标永不完敛——实测发现后修复）；
    今日列排名由全量清单驱动不受候选集影响；次日自动重算冻结集
  - 冷启动首请求最多等待 9s 让 warmup 填充部分历史，随后立即返回部分结果
- 过滤增强：管线 STYLE_TAG_RE（昨日涨停/连板/MSCI 等）之上，热点榜专用叠加
  HOT_STYLE_EXTRA_RE（指数成分：上证50_/沪深300/中证500/创业板综/深成500/央视50…；
  风格：大盘价值/价值股/周期股/权重股/行业龙头/科技风格等；财报统计：预增/预减/扭亏；
  调研统计：密集调研/增持计划/私募新进；坏数据 BK0706 名称退化）——不动管线共享正则，
  避免影响回踩选股 pickBestConcept 行为。过滤后今日板块 486→443。
- 输出：days（近 5 交易日升序）/ perDay（每日 top3：名称/涨幅/成交额亿/量能比=当日量÷前日量）
  / frequency（5 日上榜次数聚合，连续上榜=持续热点，count≥2 才展示火焰徽章）/ meta.complete
  （前端据此轮询）。
- 前端组件 hot-concepts-panel.tsx：最新日在前（今日+T-1 移动端首行），名次章（1 琥珀、2/3 灰）、
  红涨绿跌、上榜≥2 次火焰标记、频次摘要 chips（×N 次 + 最好名次 + 5 日累计 tooltip）、
  口径说明行、折叠/展开（aria-expanded）、刷新（refresh=1 绕过缓存）、骨架屏/错误重试态。
- 验证（curl + 浏览器登录 888888）：
  - API：complete=true（387 板块收录/263 候选），缓存命中 5ms；排名合理——11-23 机器人执行器
    +7.88%/物理AI+7.83%/AI视频+6.83%（科技主线日）、11-20 中特估/鸡肉/猪肉（大跌日防御类）、
    今日盘中 水产+3.4%/金属铅/黄金（实时）；过滤后无任何风格类漏网
  - 浏览器：面板渲染于统计卡与直方图之间；桌面 5 列/移动 2 列布局正常、名称截断正常；
    折叠/展开/刷新交互正常；页尾共性归纳区与 sticky footer 不受影响；控制台 0 错误；lint 通过
  - 一次瞬时 500（东财限流）自愈复现：前端错误路径续期轮询恢复
- 涉及文件：src/app/api/stock/hot-concepts/route.ts（新增）、src/components/hot-concepts-panel.tsx（新增）、
  src/components/limit-up-pullback-screener.tsx（插入面板 + import）、src/lib/pullback-pipeline.ts（导出 STYLE_TAG_RE）

## Task 48: 热点概念面板 日期升序 + 移到筛选条件下方
- 用户诉求：①近 5 日热点概念日期从小到大排列（原先面板做了 reverse，最新日在最前）；
  ②把「近 5 日热点概念」面板从统计卡与直方图之间移动到筛选条件卡下方。
- 改动（均为最小侵入）：
  - hot-concepts-panel.tsx：dayColumns 去掉 .reverse()（API perDay 本身就是日期升序
    ——route.ts 中 days=[...dateSet].sort().slice(-5) 后 days.map 生成），列序变为
    最早日→今日（今日徽章在最右列）；同步更新注释「5 日榜单（日期从早到晚，今日在最右）」
  - limit-up-pullback-screener.tsx：删除 SummaryCard 与 Histogram 之间的 <HotConceptsPanel/>，
    改插到筛选条件 Card（Search+Presets+QuickTags+FilterPanel 折叠区）闭合之后、
    Stock Table 之前——面板顶部紧邻「筛选条件」折叠条，下方直接是股票表格
- 布局链路（验证后）：主卡 → 盘前研判 → 统计卡 → 直方图 → 筛选条件卡 → 热点概念面板 → 股票表格
- 验证（浏览器登录 888888 + DOM 断言 + 截图）：
  - 日期顺序 DOM 实测 "11/20 < 11/23 < 11/24 < 11/25 < 11/26"（升序，今日徽章在 11/26 列）
  - 面板 previousElementSibling=筛选条件卡（表格卡片/收藏/快捷预设尾部）、
    nextElementSibling=股票表格——位置正确
  - 截图确认：筛选条件滑块区下方即面板，5 列 Top3 数据完整（11/23 机器人执行器 +7.88% 等）、
    名次章/火焰/今日徽章/红涨绿跌均正常，下方表格渲染不受影响
  - 控制台 0 错误、页面 0 错误；lint 通过
  - 插曲：验证中一次复杂 eval 阻塞 agent-browser daemon（截图全白），重启会话后复验通过
- 涉及文件：src/components/hot-concepts-panel.tsx（2 处）、
  src/components/limit-up-pullback-screener.tsx（位置迁移）

## Task 49: 股票列表每页 20 条一次展示，消除表格内部滚动
- 用户诉求：下面股票展示的列表能一次性展示 20 条数据不用滚动，每次翻页/滚动太麻烦。
- 现状：分页本有每页条数切换（20/50/100）但默认 50，且表格容器 max-h-[600px]
  内部纵向滚动——即使选了 20 条也要在小滚动条里搓 2 屏，双重滚动体验差。
- 改动（limit-up-pullback-screener.tsx 3 处，最小侵入）：
  1. 默认 pageSize 50→20（SSR 与本地回退两处）
  2. LAST_PAGE_SIZE_KEY 升级为 -v2 新 key：因 useEffect[pageSize] 首渲染即会把旧默认
     50 写入 localStorage，仅改默认值对老用户永远无效，换 key 一次性生效（旧 key 作废）
  3. 表格容器 max-h-[600px]→max-h-[1160px]：实测行高 ~53px，20 行+表头 ≈1100px，
     1160px 容器可完整放下 → scrollHeight=clientHeight=1100，内部滚动条消失；
     选 50/100 条时内容超高自动恢复内部滚动 + sticky 表头兜底
- 为什么保留 overflow-y-auto 容器而不去掉 max-h：容器 overflow-x-auto 使 overflow-y
  计算为 auto（CSS 规范 visible→auto），容器成为滚动祖先——内容不溢出时 sticky 表头
  失效随页面滚走；保留真实滚动容器才能在内容超高（50/100 条、展开行）时维持 sticky
  表头/左列。20 条常规场景下两者视觉一致（无滚动条），后者多一层兜底。
- 验证（浏览器登录 888888 + DOM 断言 + 截图）：
  - 默认进入即「显示 1-20 / 共 218 只」，tbody 20 行，scrollHeight=clientHeight=1100、
    内部无滚动；截图确认第 1-20 行随页面自然展开，第 11-20 行页面滚动可见
  - 切 50：50 行渲染、scrollH 2690>clientH 1160 内部滚动兜底、headerSticky=sticky
  - 切回 20：localStorage v2 key 持久化 "20"，恢复无内部滚动；控制台 0 错误
  - lint 通过
- 涉及文件：src/components/limit-up-pullback-screener.tsx（LAST_PAGE_SIZE_KEY v2、
  pageSize 默认值、表格容器 max-h）

## Task 50: 热点概念每日 Top3 → Top8
- 用户诉求：近 5 日热点概念每天展示前 8 名热点概念。
- 后端 route.ts：
  - 每日排名 slice(0,3)→slice(0,8)，rank 语义 1-3→1-8
  - 候选集扩大 150→260（今日涨幅/5日涨幅/主力净流入三维度 top260 去重=306 板块）：
    top8 后历史某日第 5-8 名可能落在原候选集之外（当日大涨但今日熄火的冷门板块），
    三维度 top260 后「某日单日进前八」的板块几乎必然被 5 日累计或主力净流入覆盖
  - 实测 complete=true 一次收敛：磁盘缓存已有 390+ 板块日 K，覆盖 306 候选无需补拉
- 前端 hot-concepts-panel.tsx：Badge「每日涨幅前三」→「每日涨幅前八」；RANK_STYLES
  扩展到 8 级灰阶（1 琥珀、2/3 原灰、4-8 透明度递减的浅灰），火焰徽章/频次 chips/
  appearCount 逻辑不变（上榜=进当日 top8，自然扩大统计口径）
- 验证（curl + 浏览器登录 888888）：
  - API：5 天 × 每日 8 条齐全；排名合理——11-23 机器人链霸榜（执行器/物理AI/人形机器人/
    减速器/AI语料）、11-20 大跌日防御类（中特估/猪肉/转基因）、11-25 医药消费、
    今日盘中资源链（水产/金属铅镍锌/黄金/稀缺资源）；top3 与 Task 47 一致（算法未变）
  - 频次：水产概念×2（大跌日抗跌+今日领涨，持续热点）、减速器×2 等
  - UI：8 条/列名次章灰阶正常、4-8 名火焰徽章正常、面板高度合理、控制台 0 错误；lint 通过
- 涉及文件：src/app/api/stock/hot-concepts/route.ts（候选集 260 + slice 8）、
  src/components/hot-concepts-panel.tsx（Badge 文字 + RANK_STYLES 8 级）

## Task 51: 个股概念展示 1 个 → 3 个最相关概念
- 用户诉求：每个股票展示的概念从 1 个增加到 3 个，展示 3 个最相关的概念。
- 算法层 pullback-pipeline.ts：
  - 新增 pickTopConcepts(boards, conceptCodes, sector, industryCodes, n=3)：复用原三模式
    筛选（精确概念集/降级行业排除/名称兜底）+ STYLE_TAG_RE，改为按今日板块涨幅降序
    稳定排序取前 n（同分保 slist 原序，与旧单值版「严格大于才替换」语义一致）
  - 新增 resolveStockConcepts：模块级缓存改存 string[]（30 分钟 TTL 不变）；
    resolveStockConcept 保留为取 [0] 的兼容包装——slist 请求次数不变，仅解析层扩展
- API limit-up-pullback/route.ts：类型加 concepts?: string[]（concept 保留=concepts[0]
  向后兼容），赋值处 resolveStockConcepts
- 前端 screener.tsx：
  - 概念列竖排 3 个概念：主概念深色加粗、第 2/3 名灰度递减（视觉动量层次），
    tooltip 展示主概念+相关概念+口径说明（今日涨幅前三/风格标签剔除）
  - CSV 概念列输出 3 个概念以 / 分隔（concept 旧字段兜底）
  - 表格容器 max-h-[1160px]→[1300px]：3 行概念使行高 ~53px→~64px，20 行 1285px，
    1300px 容器恢复「20 条一次展示无内部滚动」（Task 49 效果保持）
- 验证（curl + 浏览器登录 888888）：
  - API：231 只全部有 concepts，225 只满 3 个（个别所属概念板块不足 3 只返回 1-2 个）；
    排序合理——广百股份 黄金概念/粤港自贸/预制菜概念（今日黄金领涨居首）；
    concept=concepts[0] 兼容旧数据
  - UI：概念列 3 行竖排动量层次清晰；tooltip hover 显示完整；20 行 scrollHeight=
    clientHeight=1285 无内部滚动；控制台 0 错误；lint 通过
- 涉及文件：src/lib/pullback-pipeline.ts（pickTopConcepts/resolveStockConcepts）、
  src/app/api/stock/limit-up-pullback/route.ts（concepts 字段）、
  src/components/limit-up-pullback-screener.tsx（概念列 UI/CSV/容器高度）
