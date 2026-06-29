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
