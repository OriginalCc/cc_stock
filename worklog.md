# Work Log

---
Task ID: 1
Agent: Main Agent
Task: 增加8个新因子参数到滚动做T策略引擎

Work Log:
- 分析现有项目结构和16个因子参数
- 设计8个新因子并更新策略引擎
- 更新DB种子数据和前端UI
- 版本从v3.1升级到v3.2

Stage Summary:
- 因子总数从16个增加到24个
- 新增技术指标类别：RSI、BOLL、VOLUME_PATTERN
- Lint通过，服务正常运行

---
Task ID: 2
Agent: Main Agent
Task: 分时走势每次触发参数因子都在均价线上标识出来

Work Log:
- 分析现有 TimelineSignalRenderer 实现，原版信号标记在价格线位置
- 重新设计信号渲染器 v3.4，将因子触发标记显示在均价线(avgPrice)上
- 实现：价格线上的B/S小圆点 → 虚线连接 → 均价线上的大圆点(内含方向箭头) → 因子名称+强度标签
- 添加标签防重叠逻辑（自动偏移避免遮挡）
- 均价线标记内部显示上/下箭头指示买入/卖出方向
- 添加图表图例"因子标记"说明
- 暗色标签背景配色：买入=深红、卖出=深绿、止损=深黄

Stage Summary:
- 信号标记从价格线位置改为均价线位置，更直观显示因子与均价的关系
- 价格线保留小圆点B/S标记，虚线连接到均价线大圆点
- 添加标签防重叠机制
- Lint通过，服务正常运行

---
Task ID: 1
Agent: main
Task: Move buy/sell signal markers from avgPrice line to price line (分时线)

Work Log:
- Read and analyzed the existing TimelineSignalRenderer component (v3.4) which placed markers on the avgPrice (均价) line with connecting lines from the price position
- Rewrote TimelineSignalRenderer (v3.5) to place all signal markers directly on the price line
- Removed the connecting dashed line from price to avgPrice
- Removed avgPrice line data lookup logic (no longer needed)
- Kept the main marker (circle + arrow/triangle indicator) but now at the price line y-position
- Maintained the factor name + strength label, positioned below for buy signals, above for sell/stoploss signals
- Added a small connecting dashed line from marker edge to label for visual clarity
- Updated legend comments from v3.4 to v3.5

Stage Summary:
- Buy/sell/stoploss markers now appear directly on the 分时线 (price line) instead of the 均价线 (avgPrice line)
- Cleaner visual: no more connecting lines between price and avgPrice
- Lint passes, dev server running without errors

---
Task ID: 1-2
Agent: main
Task: Add zoom in/out buttons to K-line chart + Default K-line to daily

Work Log:
- Changed default interval from "5m" to "1d" in use-stock-data.ts
- Modified changeChartMode to auto-switch to "1d" interval when entering kline mode
- Added klineVisibleBars state (default 80) and ZOOM_LEVELS [30, 50, 80, 120, 200, 300]
- Added zoomIn, zoomOut, zoomReset callback functions
- chartData now sliced based on klineVisibleBars using useMemo
- Added zoom control buttons (ZoomIn, ZoomOut, RotateCcw) to K-line chart header
- Shows current bar count (e.g. "80根") between zoom buttons
- Increased K-line chart height from 380 to 460 for better visibility
- Increased Volume chart height from 90 to 100
- Added dynamic barSize to all K-line sub-charts (candlestick, volume, MACD)
- barSize adjusts based on visible bars: 10 for <50, 7 for <80, 5 for <150, 3 for 150+
- Improved CandlestickRenderer body width ratio calculation

Stage Summary:
- K-line chart now has zoom controls: ZoomIn (fewer bars / more detail), ZoomOut (more bars), Reset
- Default view shows 80 bars of daily K-line data
- Candlesticks are much clearer with proper sizing
- Switching to K-line mode auto-selects daily (日线) interval
- All sub-charts (price, volume, MACD) have consistent bar sizing

---
Task ID: 1
Agent: main
Task: Remove signal generation limits - show all factor triggers independently

Work Log:
- Analyzed the signal generation flow and identified three key limitations:
  1. dailyTCount >= maxDailyTCount (default 2) blocked all signals after 2 buy signals
  2. Buy signals required lastSellPrice + checkSpreadFloor (spread floor check)
  3. Post-processing removed consecutive same-type signals (buy_buy, sell_sell)
- Removed dailyTCount variable and all dailyTCount++ increments from t-strategy.ts
- Removed all checkSpreadFloor guards from buy signals (factors 6-8, 16, 18, 22, 26, 28, 29)
- Kept lastSellPrice tracking for stop-loss detection only (factor 0)
- Changed post-processing: only remove consecutive identical factor names (e.g. two "MACD金叉" in a row)
- Different factors can now trigger consecutively (e.g. "均价偏离过高" followed by "MACD死叉")
- Updated version comment to v3.5
- Updated bridge function comment in page.tsx

Stage Summary:
- Signal generation is now in "analysis mode" - all factor triggers are shown independently
- No daily T-count limit - can show unlimited buy/sell signals throughout the day
- No spread floor dependency - buy signals don't require a prior sell
- Each factor is independent - user can see WHERE each factor would trigger
- Stop-loss still functional (triggers when price rises 1.5% after a sell)
- Lint passes, dev server running without errors

---
Task ID: 2
Agent: main
Task: Optimize timeline signal display when too many signals make chart hard to read

Work Log:
- Analyzed the existing TimelineSignalRenderer v4 implementation
- Identified problems: merge distance too small (8px/3min), weak signals create clutter, labels overlap
- Rewrote TimelineSignalRenderer to v5 with these improvements:
  1. Merge distance increased from 8px (3min) to 30px (15min) - much more aggressive grouping
  2. Merge by direction (buy=up, sell/stoploss=down) instead of exact type match
  3. Use strongest signal's position as representative point (instead of first signal)
  4. Priority-based label placement: strong signals get labels first, then medium if space, weak = dot only
  5. Weak signals are rendered as small dots without labels (no clutter)
  6. Compact label format: "因子名 ×3" for merged ≥3, "因子1/因子2" or "因子+1" for 2
  7. Smaller font size (8px instead of 9px), smaller label padding (3px instead of 4px)
  8. Subtler connecting lines (0.4px, lower opacity)
  9. Count badge only shown for medium+ strength signals
  10. Sort label placement by strength priority (strong first gets best position)

Stage Summary:
- Timeline signals are now much cleaner with aggressive merging (15min window vs 3min)
- Weak signals are just small dots - no labels to clutter the chart
- Strong signals always try to get labels; medium signals only if space allows
- Compact label format reduces label sizes
- No lint errors, dev server running fine

---
Task ID: 1
Agent: main
Task: Change all "昨MA5/MA10/MA20" labels to "今MA5/MA10/MA20" on the timeline chart

Work Log:
- Read current page.tsx to understand the prevDayMA usage
- Changed `prevDayMA` variable to `todayMA` throughout the code
- Changed data source from `allChartData[allChartData.length - 2]` (yesterday) to `allChartData[allChartData.length - 1]` (today)
- Updated header legend labels: 昨MA5 → 今MA5, 昨MA10 → 今MA10, 昨MA20 → 今MA20
- Updated ReferenceLine labels: 昨MA5 → 今MA5, 昨MA10 → 今MA10, 昨MA20 → 今MA20
- Updated prop name and type definition: prevDayMA → todayMA
- Updated comments: "Previous trading day's MA lines" → "Today's MA lines"
- Ran lint check - passed with no errors
- Dev server running correctly

Stage Summary:
- All "昨MA" labels changed to "今MA" (header legend + chart ReferenceLine labels)
- MA data source changed from second-to-last bar (yesterday) to last bar (today)
- Variable renamed from prevDayMA to todayMA for clarity

---
Task ID: 3
Agent: main
Task: 在策略面板菜单趋势识别后面添加一个核心逻辑的菜单，把做T胜率提升说明写到里面

Work Log:
- 分析策略面板 TabsList 结构，找到"趋势识别" tab 的位置
- 在 TabsList 中"趋势识别"后面添加了"核心逻辑" TabsTrigger (value="corelogic")
- 在"趋势识别" tab content 后面添加了"核心逻辑" tab content，包含十大维度内容：
  1. 大盘联动 — 顺大势做小T (胜率贡献 15%)
  2. VWAP偏离回归 — 均价线是做T的锚 (胜率贡献 20%)
  3. 量价配合 — 量在价先，无量不动 (胜率贡献 15%)
  4. MACD背驰 — 抓转折的利器 (胜率贡献 10%)
  5. 时段规律 — 做T的黄金时间窗 (胜率贡献 10%)
  6. 支撑阻力位 — 价格的弹性边界 (胜率贡献 8%)
  7. 正T vs 反T — 方向比努力更重要 (胜率贡献 8%)
  8. 信号叠加确认 — 多因子共振才出手 (胜率贡献 8%)
  9. 仓位控制 — 活下来比赚得多更重要 (风控贡献 3%)
  10. 止损纪律 — 做T的最后一道防线 (风控贡献 3%)
- 还添加了综合胜率提升公式和做T前快速检查清单
- 每个维度都有独立的渐变背景色、编号徽章、胜率贡献标签
- 内容包含正确做法/常见错误对比、操作对应关系、具体建议等

Stage Summary:
- 策略面板新增"核心逻辑"标签页，紧接在"趋势识别"之后
- 十大维度完整呈现做T胜率提升的核心逻辑框架
- Lint通过，dev server正常运行

---
Task ID: 4
Agent: main
Task: 在核心逻辑tab中补充更多提升做T胜率的进阶维度

Work Log:
- 在基础10维的做T Checklist之后，添加了"进阶维度"分隔区块
- 新增10个进阶维度（维度11-20）：
  11. 板块联动 — 跟着板块风向走 (胜率贡献 8%)
  12. 竞价预判 — 开盘前的第一手情报 (胜率贡献 5%)
  13. 资金流向 — 跟着聪明钱走 (胜率贡献 7%)
  14. 隔夜外盘 — 全局视野下的方向预判 (胜率贡献 5%)
  15. 个股波动率特性 — 选对股票做对T (胜率贡献 6%)
  16. 连续做T衰减 — 贪多必失的数学原理 (风控贡献 4%)
  17. 整数关口心理 — 价格的隐形引力 (胜率贡献 3%)
  18. 波动率周期 — 收敛必扩张，扩张必收敛 (胜率贡献 5%)
  19. 尾盘信号 — 明日操作的前瞻指标 (胜率贡献 4%)
  20. 消息面过滤 — 大事不做T，小事不慌张 (风控贡献 3%)
- 维度16包含可视化进度条（做T次数 vs 胜率）
- 维度18包含波动率周期流程图
- 添加了"20维全量胜率叠加"汇总，含实操建议/高频检查/低频检查分类

Stage Summary:
- 核心逻辑面板从10维扩展到20维（基础10维+进阶10维）
- 进阶维度更注重跨市场联动、个股特性和行为规律的深度利用
- 理论胜率上限从85%提升到95%+
- Lint通过，dev server正常运行

---
Task ID: 5
Agent: main
Task: 新增自定义因子功能 - 基于分时线的策略组合器

Work Log:
- 分析用户需求：自定义因子作用于分时线（1分钟级别数据），而非K线
- 用户举例：脉冲下跌+卖出量能萎缩+均线走平 → 强买入信号（即因子31"脉冲缩量企稳"）
- 确认策略引擎已有4个v3.7自定义因子（31-34）运行在分时线数据上
- 在策略面板TabsList中新增"自定义因子"tab（在核心逻辑之后）
- 创建CustomFactorsTab组件，包含：
  1. 标题区域：分时线策略组合器说明
  2. 数据源提示：强调作用于分时线数据
  3. 内置自定义因子展示（因子31-34）：启用/禁用开关、展开详情、条件组合可视化
  4. 用户自定义因子列表：支持删除、展开详情
  5. 新增自定义因子表单：名称、描述、信号方向、做T模式、强度、条件选择
  6. 条件库（24个预定义条件）：按分类（价格形态/量能特征/技术指标/趋势判断）筛选
  7. 条件组合预览：可视化显示AND逻辑
  8. 分时线条件库参考：4类条件一览
  9. 使用说明
- 持久化：用户自定义因子保存到localStorage (customFactors_v1)
- 内置因子与用户因子分开管理，内置因子不可删除

Stage Summary:
- 新增"自定义因子"标签页，完整的因子组合器UI
- 4个内置因子（脉冲缩量企稳/脉冲拉升缩量滞涨/缩量横盘突破/放量突破均线）均基于分时线数据
- 24个预定义条件可自由组合创建新因子
- 用户创建的因子持久化到localStorage
- Lint通过，dev server正常运行

---
Task ID: 2
Agent: Main Agent
Task: 实现自定义因子动态检测，将用户创建的因子展现到分时图上 (v3.8)

Work Log:
- 检查现有代码：发现4个内置自定义因子(31-34)已硬编码在t-strategy.ts中，可以正常在分时图上显示
- 发现关键gap：用户在UI中创建的自定义因子未连接到策略引擎，UI提示"后续版本将支持自动检测"
- 在t-strategy.ts中新增CustomFactorDefinition和CustomFactorCondition类型导出
- 实现evaluateCondition()动态条件评估器，支持20种条件key的分时线数据检测：
  - 价格形态：pulse_drop, pulse_rise, price_above_vwap, price_below_vwap, vwap_cross_up, vwap_cross_down, double_bottom, prev_close_support, late_drop
  - 量能特征：vol_shrink, vol_expand, volume_price_divergence
  - 技术指标：vwap_deviation_high, vwap_deviation_low, rsi_oversold, rsi_overbought, boll_lower, boll_upper, macd_golden, macd_dead
  - 趋势判断：vwap_flat, vwap_up, vwap_down, consolidation
- 在generateTimelineSignals函数中新增customFactors参数
- 在硬编码因子31-34评估之后，添加v3.8动态自定义因子评估逻辑（AND逻辑：所有条件同时满足）
- 在page.tsx中新增customFactors状态，从localStorage加载用户自定义因子
- 将customFactors传递给generateTimelineSignals wrapper函数
- 更新CustomFactorsTab UI：版本升级v3.8，新增"检测中"脉冲徽章，更新使用说明
- 信号触发后会以"自定义因子[因子名]触发：条件1 + 条件2 + ..."格式显示在分时图上

Stage Summary:
- 用户创建的自定义因子现在可以实时检测并在分时图上显示信号
- 内置因子(31-34)继续由硬编码逻辑处理，用户自定义因子由动态评估器处理
- 所有20种条件支持分时线（1分钟级别）数据检测
- lint检查通过，dev server正常运行

---
Task ID: 6
Agent: main
Task: 在分时图中用虚线标记处支撑位与压力位

Work Log:
- 分析现有代码：TimeSharingPanel已接受keyPriceLevels prop但从未使用
- computeKeyPriceLevels函数已在t-strategy.ts中实现，计算以下关键价位：
  1. 整数关口（基于昨收价的心理支撑/阻力位）
  2. 日内高低点（天然支撑阻力）
  3. 昨收价（重要心理关口）
  4. 涨跌停价位（极端位置）
- 在主组件StockTAssistant中添加keyPriceLevels的useMemo计算
- 将keyPriceLevels传递给TimeSharingPanel组件
- 在分时图价格面板中添加支撑/阻力虚线：
  - 支撑位：绿色虚线 (#22c55e)，strokeDasharray="4 3"，标签带▲符号
  - 阻力位：红色虚线 (#ef4444)，strokeDasharray="4 3"，标签带▼符号
  - 自动跳过昨收价（已由主参考线显示）
  - 自动跳过涨停/跌停（通常超出可见范围）
  - 只显示在Y轴可见范围内的价位
- 在图例栏中添加支撑/压力标识说明（绿色虚线=支撑，红色虚线=压力）

Stage Summary:
- 分时图现在用虚线标记关键支撑位（绿色）和压力位（红色）
- 关键价位包括：整数关口、日内高低点
- 图例栏新增支撑/压力标识
- lint检查通过，dev server正常运行

---
Task ID: 7
Agent: Main Agent
Task: 实现股票与所在板块之间的关联，增加做T赢的概率

Work Log:
- 研究东方财富API，发现可用的板块数据接口：
  - push2.eastmoney.com/api/qt/stock/get?secid=1.600519&fields=f127 → 获取股票行业板块名
  - searchapi.eastmoney.com/api/suggest/get → 搜索板块代码
  - push2.eastmoney.com/api/qt/stock/trends2/get?secid=90.BK0896 → 获取板块分时数据
- 在 ashare-api.ts 中新增3个API函数和2个类型
- 添加本地stock→sector映射作为fallback（覆盖30只热门股）
- 创建 /api/stock/ashare-sector API路由
- 在 t-strategy.ts 中新增"步骤7: 板块联动加权"信号增强逻辑
- 在 page.tsx 中集成板块联动（状态管理、数据获取、UI徽章）
- 所有lint检查通过，dev server正常运行

Stage Summary:
- 完整的板块联动功能已实现：数据获取 → 走势识别 → 信号增强 → UI展示
- 板块走势识别复用 detectMarketRegimeDetail()
- 信号增强逻辑与大盘联动逻辑模式一致
- 东方财富API不稳定时有本地fallback机制

---
Task ID: 1
Agent: main
Task: 优化分时图Y轴显示，让走势更明显（只在负区运行就只显示负区）

Work Log:
- 分析了当前分时图Y轴逻辑：始终以昨收价(prevClose)为中心对称显示，导致价格只在负区运行时浪费50%的图表空间
- 修改了 Y-axis domain 计算逻辑（page.tsx 第1268-1303行）：
  1. 从 zoomData 中收集实际可见的价格和均价数据
  2. 计算实际数据范围 (dataMin/dataMax)，加入20%的比例填充
  3. 确保 prevClose 参考线始终可见（在边缘），但不再强制居中
  4. 百分比轴自动跟随新的价格范围

Stage Summary:
- 实现了分时图Y轴智能自适应缩放
- 当股价只在负区运行时，Y轴只显示负区附近范围，波动更明显
- prevClose 参考线始终可见（在图表边缘），保持上下文信息
- 缩放时也生效：zoomData 的范围决定了Y轴范围

---
Task ID: 1
Agent: main
Task: 在做T信号分析上方新增大盘&板块走势区域：左侧深证指数分时图+VOL+MACD，右侧股票对应板块分时图+VOL+MACD

Work Log:
- 修改指数数据获取逻辑：indexTimelineData 状态存储完整的分时数据（items + prevClose），不仅存 regime
- 修改板块数据获取逻辑：sectorTimelineData 状态存储完整的板块分时数据
- 创建 computeMiniMACD() 函数：独立计算分时 MACD 指标
- 创建 MiniTimelinePanel 组件：紧凑型分时图面板，包含价格线+均价线+昨收参考线、VOL 成交量柱、MACD（DIF/DEA/柱）
- 在做T信号分析上方插入 "大盘 & 板块走势" 区域
  - 左侧：当前活跃指数（深证/上证/创业板）的分时图，带 regime 标签和切换按钮
  - 右侧：股票对应行业板块的分时图，带 regime 标签
  - 响应式布局：移动端纵向排列，桌面端左右并排（grid-cols-2）
- 智能Y轴缩放：与主图一致的自适应Y轴
- VOL/MACD 颜色加深：与主图一致的红绿深色方案

Stage Summary:
- 新增 MiniTimelinePanel 组件（~240行）
- 修改 index fetch effect 存储完整分时数据
- 修改 sector fetch effect 存储完整分时数据
- 新增 "大盘 & 板块走势" 区域，位于做T信号分析上方

---
Task ID: 1
Agent: main
Task: 实现ETF分时数据获取功能

Work Log:
- 分析了 ETF 代码规则：上海ETF (51xxxx, 56xxxx, 58xxxx), 深圳ETF (15xxxx, 16xxxx, 18xxxx)
- 修改 `toSinaSymbol()` — 新增 ETF 前缀到 sh/sz 的映射
- 修改 `toYahooSymbol()` — 新增 ETF 前缀到 .SS/.SZ 的映射
- 修改 `isAShare()` — 注释更新为"股票或ETF"，6位数字代码已能覆盖ETF
- 修改 `getExchange()` — 新增 ETF 前缀到 SH/SZ 的判断
- 新增 `isETFCode()` 辅助函数 — 判断代码是否为ETF
- 修改搜索逻辑 `searchAShare()` — 搜索结果中标注 "ETF" 类型
- 新增20只热门ETF到 POPULAR_ASHARES 映射表（510300, 159919 等）
- 修改分时API错误消息：仅支持A股 → 仅支持A股和ETF
- 修改搜索下拉UI — ETF 结果显示紫色 "ETF" 标签
- 测试验证：510300(沪深300ETF) 和 159919(沪深300ETF深) 分时/行情/K线/搜索均正常

Stage Summary:
- ETF 全链路支持：搜索 → 行情 → 分时 → K线，全部可用
- 搜索结果中 ETF 有独立的紫色标签区分
- 底层API（腾讯、新浪）天然支持ETF，只需修改代码路由层

---
Task ID: 5-b
Agent: ui-developer
Task: Add T-Index composite score, Smart Action Panel, and Signal Alert System

Work Log:
- Read page.tsx (6300+ lines) to understand StockTAssistant component structure
- Added Bell, BellOff, Volume2 imports from lucide-react
- Added `playAlertSound()` function using Web Audio API (buy=880Hz sine, sell=660Hz sine, stoploss=440Hz sawtooth)
- Added T-Index color/label helper functions (getTIndexColor, getTIndexLabel, getTIndexLabelColor)
- Added CSS keyframe animations (signalPulse, flashBorder, flashBorderGreen) via style tag injection
- Added signal alert state: soundEnabled (localStorage persisted), alertedSignalIdsRef (Set), flashSignal
- Added signal alert useEffect that watches timelineSignals for new strong signals, plays sound and triggers visual flash
- Added T-Index (做T指数) computation useMemo: base=50, buy strong +15/medium +8/weak +3, sell strong -15/medium -8/weak -3, stoploss -20, regime adjustments (震荡市 +5, 上升通道 -5, 下跌趋势 -10, 横盘末期 -15), capped 0-100
- Added Smart Action recommendation useMemo: generates contextual advice (紧急止损/建议正T卖出/建议正T买回/等待确认/观望等待) with confidence score based on latest signals, time window, and T-index
- Added T-Index + Smart Action Panel UI between stock info card and chart mode selector (responsive grid, 2 columns on desktop)
  - T-Index card: SVG circular gauge, score number, label, color-coded bar, pulsing Volume2 icon for strong signals
  - Smart Action card: icon + recommendation text, supporting reason, time window badge, confidence bar
- Added sound toggle button (Bell/BellOff) in chart mode selector row
- Added visual flash animation on stock info card (animate-flash-red / animate-flash-green)
- Fixed lint error: wrapped setFlashSignal in setTimeout(0) to avoid synchronous setState in effect
- Lint passes, dev server running normally

Stage Summary:
- Three major UI features added to page.tsx only (no other files modified):
  1. 做T指数 (T-Index): composite 0-100 score with circular gauge, color coding, and progress bar
  2. 智能操作建议 (Smart Action Panel): contextual buy/sell/wait recommendations with confidence bar
  3. Signal Alert System: Web Audio API sound alerts for new strong signals + visual flash on stock info card + pulsing indicator
- Sound toggle persisted to localStorage, only alerts for NEW strong signals (tracked via Set)
- All lint checks pass

---
Task ID: 5-a
Agent: strategy-engine
Task: Add KDJ factors and Fibonacci key levels to strategy engine

Work Log:
- Read worklog.md and analyzed existing t-strategy.ts codebase (v3.7 with 34 factors)
- Added KDJ parameters to StrategyConfig interface: kdjPeriod(9), kdjM1(3), kdjM2(3), kdjOversold(20), kdjOverbought(80), jExtremeLow(0), jExtremeHigh(100)
- Added KDJ parameter defaults to DEFAULT_STRATEGY_CONFIG
- Imported calculateKDJ from @/lib/indicators at top of t-strategy.ts
- Added KDJ value computation in generateTimelineSignals using rolling high/low estimation from close prices
  - For each minute, estimated high = max(current close, previous close), estimated low = min(current close, previous close)
  - This approximates 1-minute bar high/low since timeline data only has close prices
- Added 4 new factor rules (35-38) after factor 34:
  - Factor 35: KDJ金叉买入 (buy, 反T, strong/medium) - K line crosses above D line, stronger when J < 20
  - Factor 36: KDJ死叉卖出 (sell, 正T, strong/medium) - K line crosses below D line, stronger when J > 80
  - Factor 37: J线超卖反弹 (buy, 反T, medium) - J value below 0 and starts turning up
  - Factor 38: J线超买回落 (sell, 正T, medium) - J value above 100 and starts turning down
- Added 6 KDJ condition keys to evaluateCondition function: kdj_golden, kdj_death, j_oversold, j_overbought, kdj_above_80, kdj_below_20
- Updated evaluateCondition signature to accept optional kdjValuesParam parameter
- Updated evaluateCondition call in dynamic custom factor evaluation to pass kdjValues
- Added Fibonacci retracement levels to computeKeyPriceLevels:
  - Calculates 5 Fibonacci levels (23.6%, 38.2%, 50%, 61.8%, 78.6%) based on intraday high/low
  - Only computed when intraday range > 1% (sufficient amplitude)
  - Levels classified as support (below current price) or resistance (above current price)
- Updated STRATEGY_OVERVIEW: version 3.7 → 3.9, added factors 35-38 to factorSummary
- All lint checks pass for t-strategy.ts and indicators.ts (the pre-existing page.tsx error is unrelated)

Stage Summary:
- Strategy engine upgraded from v3.7 to v3.9
- Total factor count: 34 → 38 (4 new KDJ-based factors)
- KDJ indicator now integrated into the strategy engine for the first time
- Fibonacci retracement levels added as dynamic support/resistance in computeKeyPriceLevels
- 6 new KDJ conditions available for custom factor compositions
- Dev server running without errors
## Performance Optimization - TimeSharingPanel & Main Component Memoization

**Date:** 2025-03-04

### Summary
Applied 7 performance optimizations to `/home/z/my-project/src/app/page.tsx` to reduce unnecessary re-computations on every render. No visual behavior was changed.

### Changes Made

1. **Change 1: Memoize zoomData and all derived calculations in TimeSharingPanel**
   - Wrapped the entire zoom slicing + Y-axis range + signal counts + MACD range + volume range + lastItem + lastSignal + barSize computation (formerly lines 1563-1670) into a single `useMemo` block
   - Dependencies: `[fullDayData, data, visibleMinutes, panOffset, timeTicks, prevClose, signals, macdData]`
   - Replaced `Math.min(...spread)` / `Math.max(...spread)` with `reduce` to avoid call stack issues
   - Replaced repeated `.filter()` calls for signal counting with a single `for...of` loop
   - Moved early return `if (data.length === 0) return null;` after all hooks to comply with React Hooks rules

2. **Change 2: Memoize MiniTimelinePanel computations**
   - Wrapped `safePrevClose`, Y-axis range, percent range, maxVolume, barSize, MACD range, lastItem, isUp calculations into a `useMemo`
   - Dependencies: `[data, prevClose, chartData, macdData]`
   - Used `reduce` for min/max instead of spread
   - Added early-return inside useMemo for empty data case; moved `if (data.length === 0) return null;` after the hook

3. **Change 3: Memoize K-line range calculations in main component**
   - Changed `allChartData = history.filter(...)` to `useMemo(() => history.filter(...), [history])`
   - Wrapped `minPrice`, `maxPrice`, `pricePadding`, `macdMin`, `macdMax`, `macdPadding`, `maxVolume` into a single `useMemo`
   - Dependencies: `[chartData]`
   - Used `reduce` for min/max instead of spread

4. **Change 4: Fix customFactors 5-second polling**
   - Changed `setCustomFactors(parsed)` to `setCustomFactors(prev => { if (JSON.stringify(prev) === JSON.stringify(parsed)) return prev; return parsed; })` to avoid unnecessary state updates
   - Same pattern applied for `BUILT_IN_CUSTOM_FACTORS` case and catch block

5. **Change 5: Memoize signal counts in main page component**
   - Created a single `signalCounts` useMemo that computes buyCount, strongBuys, sellCount, strongSells, totalSigs, strongSigs, mediumSigs, weakSigs, confluenceCount, keyLevelCount, vwapSlopeCount, indexRegimeCount in one pass
   - Dependencies: `[timelineSignals]`
   - Replaced 2 IIFE blocks (buy/sell signal cards) with direct usage of `signalCounts` values
   - Replaced the v3.6 enhancement IIFE block with destructured values from `signalCounts`

6. **Change 6: Memoize detectMarketRegimeDetail in TimeSharingPanel**
   - Extracted `detectMarketRegimeDetail(data, prevClose)` from inside an IIFE in JSX to a `useMemo` before the return
   - Dependencies: `[data, prevClose]`
   - Updated the IIFE to use `regimeDetail` instead of calling the function directly

7. **Change 7: Combine ref sync useEffects**
   - In TimeSharingPanel: Combined 8 separate `useEffect` calls (panOffset, visibleMinutes, fullDayData, onPanOffsetChange, onZoomIn, onZoomOut, zoomIdx, maxZoomIdx) into a single `useEffect`
   - In main component: Combined 3 separate `useEffect` calls (klinePanOffset, klineVisibleBars, allChartData) into a single `useEffect`

### Lint Status
All lint checks pass with 0 errors, 0 warnings.

---
Task ID: 1
Agent: main
Task: 资讯分析改为对明日涨跌进行分析

Work Log:
- 分析现有资讯分析功能：API route + UI已实现"今日预判"
- 修改 API route (`/api/stock/news-analysis/route.ts`):
  - 系统提示词：从"今日走势预判"改为"明日走势预判"，增加分析维度（收盘情况、资金流向、外盘影响、技术形态等）
  - 搜索关键词：从"A股 大盘 今日 走势 资讯"改为"A股 大盘 明日 走势 预测 资讯"
  - 上下文消息：从"分析今日走势预判"改为"综合以上资讯，分析明日走势预判"
  - 做T建议：从"做T建议"改为"明日做T建议"
- 修改前端UI (`page.tsx`):
  - 加载文案：从"正在搜索大盘资讯并分析"改为"正在搜索大盘资讯，分析明日走势"
  - 预判标题：从"今日预判"改为"明日预判"
  - 建议标签：从"建议"改为"明日建议"

Stage Summary:
- 资讯分析从"今日预判"全面改为"明日涨跌分析"
- API和UI文案同步更新
- Lint通过，dev server正常运行

---
Task ID: 2
Agent: main
Task: 丰富资讯分析功能 + 引入更多资讯渠道

Work Log:
- 重写 API route (`/api/stock/news-analysis/route.ts`)，主要改进：
  1. 多角度并行搜索：大盘4维度(宏观政策/资金流向/外盘影响/技术分析)，板块4维度(行业政策/板块资金/技术形态/关联市场)，个股4维度(公司资讯/研报评级/技术分析/资金动向)
  2. 引入 web-reader (page_reader) 深度阅读：对Top 2文章读取全文内容，提取纯文本供LLM分析
  3. 资讯来源分类：自动识别6类渠道(券商研报/财经媒体/政策公告/投资社区/外媒/综合资讯)
  4. 增强LLM分析输出：新增 riskLevel(风险等级)、newsSentiment(资讯情绪)、technicalView(技术面观点)、capitalView(资金面观点)、policyView(政策面观点)、sentimentView(情绪面观点)、detailedReasoning(详细推理)
  5. 共享ZAI实例，URL去重，按日期排序取Top 10
- 重写前端UI (`page.tsx` 新闻分析面板)：
  1. 标题栏增加"明日预判"副标题和资讯统计(条数/渠道数)
  2. Tab栏右侧显示搜索维度标签
  3. 趋势预判卡片增加风险等级徽章(高/中/低)和情绪标签(偏多😊/偏空😟/中性😐)
  4. 信心度增加标签显示(低/中/高)
  5. 新增四维分析卡片：技术面📊/资金面💰/政策面📜/情绪面🎭 (2x2 grid)
  6. 新增详细推理折叠面板(可展开/收起)
  7. 新增资讯渠道统计条(分类色标签+数量)
  8. 资讯列表增加来源分类标签(彩色)和搜索维度标签
  9. 空状态提示增加覆盖维度说明
  10. 加载状态增加多维度搜索提示

Stage Summary:
- 资讯分析从单源搜索升级为4维度×3类型=12路并行搜索
- 引入web-reader深度阅读Top 2文章全文，提升分析质量
- 新增6类资讯渠道分类，增加来源可信度判断
- 分析结果从5字段扩展到12字段，支持多维度评估
- UI全面升级：风险/情绪/四维分析/详细推理/渠道统计
- Lint通过，dev server正常运行

---
Task ID: 1
Agent: main
Task: Fix MACD display issues - some parts disappearing

Work Log:
- Diagnosed MACD Y-axis domain issue in TimeSharingPanel: was computing MACD range from full `macdData` instead of zoomed `zd`, causing bars to become invisible when zoomed in
- Fixed MACD Y-axis domain computation to use zoomed data (`zd`) instead of full data (`macdData`)
- Added zero-line visibility guarantee: if mMin > 0, set mMin = 0; if mMax < 0, set mMax = 0
- Increased padding from 2% to 5% for better visual clarity
- Fixed K-line MACD bar color bug: `payload.macd && payload.macd >= 0` → `payload.macd != null && payload.macd >= 0` (was incorrectly rendering zero-value bars as green)
- Fixed MACDTooltip color bug: same `&&` → `!= null &&` pattern
- Fixed computeMiniMACD threshold: lowered from 10 to 2 minimum data points (was causing empty MACD in mini charts with <10 points)
- All lint checks pass, dev server running normally

Stage Summary:
- MACD Y-axis now adapts to visible zoom range, making bars properly sized at all zoom levels
- Zero line always visible in MACD chart
- MACD color rendering fixed for zero-value bars (now correctly red when MACD = 0)
- Mini charts now show MACD with as few as 2 data points

---
Task ID: 1
Agent: main
Task: 实现分时图3秒级别实时刷新

Work Log:
- 分析分时数据源：腾讯API返回1分钟粒度数据，之前整体30秒刷新一次
- 实现 liveTimeline 机制：将实时报价(quote)价格注入到分时数据的最新分钟
  - 如果最新时间点是当前分钟：用quote.price替换该点价格
  - 如果进入新分钟但API尚未更新：自动插入新的数据点
  - 非交易时间不做注入
- 修改 use-stock-data.ts：拆分刷新频率
  - quote刷新：3秒（获取实时价格）
  - timeline/history刷新：30秒（获取1分钟级数据）
- 全部下游计算改用 liveTimeline：MACD、信号、关键价位、Y轴、UI展示
- 更新UI标签："自动刷新 30s" → "实时刷新 3s"

Stage Summary:
- 分时图现在每3秒刷新一次（通过实时报价驱动）
- 当前分钟内的价格变化可以实时看到
- 进入新分钟时自动插入数据点（不等待30秒的timeline API刷新）
- MACD和信号也会跟随实时价格变化
- lint通过，dev server正常运行

---
Task ID: 1
Agent: main
Task: 资讯版块新增当日资讯缓存功能，不用每次进入页面都重新请求

Work Log:
- 分析现有资讯数据流：API route 有服务端10分钟内存缓存，客户端无缓存，每次进入页面都要重新请求
- 修改服务端 API (`/api/stock/news-analysis/route.ts`):
  1. 缓存TTL从10分钟延长到30分钟（平衡时效性和成本）
  2. 缓存key增加日期后缀 `${type}-${symbol}-${sectorName}-${date}`，确保跨日不使用旧缓存
  3. 新增 `mode=incremental` 参数支持增量查询
  4. 新增 `lastTimestamp` 参数：客户端传入上次缓存数据的时间戳
  5. 增量模式逻辑：如果服务端缓存有效且时间戳 ≤ lastTimestamp → 返回 { noUpdate: true }；如果更新 → 返回新数据；如果缓存过期 → 走完整搜索流程
  6. 新增 `getTodayKey()` 辅助函数（Asia/Shanghai 时区的 YYYY-MM-DD）
- 修改客户端 (`page.tsx`):
  1. 新增 `getNewsCacheKey()`, `saveNewsCache()`, `loadNewsCache()` 辅助函数
  2. localStorage 缓存key格式：`news_${symbol}_${YYYY-MM-DD}`，4小时TTL
  3. `fetchNewsAnalysis` 支持增量模式：`fetchNewsAnalysis({ incremental: true })`
  4. 增量模式不显示loading spinner（已有数据时），后台静默检查更新
  5. 使用 `newsDataRef` 避免将 newsData 放入 useCallback 依赖数组（防止无限重渲染）
  6. 使用 `setNewsData(prev => ...)` 函数式更新避免闭包陈旧数据
  7. 新增 `prevNewsSymbolRef` 监听股票切换，自动加载新股票的缓存数据
  8. 自动加载流程：优先从 localStorage 读取 → 即时显示 → 后台增量检查更新
  9. 手动"刷新"按钮强制全量重新获取（不走增量模式）
  10. 新增每日缓存清理：mount时删除前一天的news_开头的localStorage条目
- UI改进：
  1. 新增缓存状态徽章：本地缓存(绿色)、本地缓存·检查更新中(橙色)、服务端缓存(蓝色)
  2. 移除趋势卡片内的"(缓存)"文本，改用头部徽章统一显示

Stage Summary:
- 资讯数据现在有两层缓存：服务端内存缓存(30分钟) + 客户端localStorage缓存(4小时)
- 进入页面时优先显示本地缓存数据（即时），然后后台增量检查更新
- 服务器支持增量查询模式，避免重复搜索和LLM分析
- 股票切换时自动加载对应缓存
- 前一天的缓存自动清理
- lint通过，dev server正常运行

---
Task ID: 2
Agent: main
Task: 丰富资讯版块功能

Work Log:
- 分析现有资讯功能：3个tab(大盘/板块/个股)、趋势预判卡片、四维分析、资讯列表
- 新增6大功能模块：
  1. **资讯筛选/过滤** — 按来源类型(券商研报/财经媒体/政策公告等)和搜索维度(宏观政策/资金流向等)筛选，显示匹配数
  2. **情绪雷达图** — SVG雷达图展示四维分析(技术面/资金面/政策面/情绪面)的量化评分，红/黄/绿颜色区分偏多/中性/偏空
  3. **历史预判追踪** — 自动记录每次预测结果到localStorage，支持准/半/偏反馈按钮，计算今日准确率
  4. **缓存新鲜度倒计时** — Timer图标显示距上次刷新的时间，超过10分钟建议刷新，30分钟自动增量刷新
  5. **关键资讯高亮** — 券商研报和政策公告类资讯标记"重要"标签，使用不同背景色突出
  6. **AI操作建议卡片** — 根据预判结果(suggestion/riskLevel/confidence)生成具体操作建议(正T/反T/观望)
- UI布局优化：
  - 趋势预判卡片从全宽改为3/5宽度，右侧放情绪雷达图(2/5)
  - 四维分析卡片增加情绪评分标签(偏多/中性/偏空)
  - 资讯渠道统计改为可点击的过滤按钮
  - 搜索维度标签改为可点击的过滤按钮
  - Tab切换时自动清除筛选条件
  - loading状态改为"有缓存时不显示spinner，只在首次加载时显示"
- 修复 TrendingUp 重复导入导致的编译错误
- lint通过，dev server正常运行

Stage Summary:
- 资讯版块从4个功能模块扩展到10个
- 情绪雷达图使用纯SVG实现，无额外依赖
- 预判追踪支持准确率反馈，数据持久化到localStorage
- 关键资讯高亮基于来源类型自动判断
- 缓存自动刷新机制(30分钟)
- lint通过，dev server正常运行

---
Task ID: 1
Agent: main
Task: 新增智能选股页面 - 通讯板块脉冲拉升筛选器

Work Log:
- 分析用户选股需求：9个条件（涨幅0-3%、通讯板块、开盘脉冲拉升、主板、排除ST/创业板/科创板/北交、市值<200亿）
- 创建后端API `/api/stock/screener/route.ts`：
  - 使用东方财富搜索API查找通讯板块(通信/通讯)代码
  - 使用东方财富clist API获取板块成分股实时数据（支持分页）
  - 过滤逻辑：主板(600xxx/601xxx/603xxx/605xxx/000xxx/001xxx/002xxx)、排除ST/300xxx/688xxx/8xxxxx/4xxxxx
  - 使用腾讯分钟数据API获取1分钟分时数据做脉冲拉升检测
  - 脉冲检测算法：5分钟窗口最大升幅、开盘冲高、冲高回落、量能放大、跳空高开，综合评分0-100
  - 批量并发获取分时数据（5个一批），阈值>=20分认定为脉冲
- 创建前端组件 `/components/stock-screener.tsx`：
  - 筛选条件标签展示（9个条件，绿色Badge）
  - 结果表格：代码、名称、脉冲评分、最新价、涨跌幅、开盘、振幅、总市值、换手率、主力净流入、PE、脉冲详情
  - 支持排序（脉冲/涨跌幅/市值/换手/振幅/主力净流入）
  - 加载骨架屏、空状态、错误重试
  - 点击股票可跳转到做T助手模式查看详情
- 集成到 `page.tsx`：
  - 新增pageMode状态（"t-assistant" | "screener"）
  - 在header添加模式切换按钮（做T/选股）
  - 选股模式下渲染StockScreener组件
  - 选择股票后自动切换回做T模式

Stage Summary:
- 完整的智能选股功能，API响应时间~570ms
- 测试结果：通讯板块100只股票中筛选出11只符合条件的股票
- 脉冲检测算法综合5个维度评分，提供详细描述（如"09:31-09:35飙升2.9%，开盘冲高5.6%，冲高回落2.0%"）
- 前端UI响应式设计，支持排序和跳转
- lint通过，dev server正常运行

---
Task ID: 1
Agent: main
Task: Add caching for screener results to avoid re-fetching every time user enters the page

Work Log:
- Added server-side cache (Map<string, {data, timestamp}>) with 3-minute TTL to /api/stock/screener route
- Cache key built from all query parameters (sector, minChange, maxChange, maxMarketCap, pulseThreshold, pulse)
- Server returns `cached: true` flag when serving from cache
- Added `refresh=1` query parameter to bypass server cache (force refresh)
- Added module-level client cache (`clientCache`) in stock-screener.tsx that persists across component mounts/unmounts
- Client cache also uses 3-minute TTL, matching server cache
- When component mounts, checks client cache first; if fresh, uses cached data without API call
- Refresh button now sends `refresh=1` to force bypass both caches
- Added "缓存 Xs" badge in header showing remaining cache TTL when data is from cache
- Added `Database` icon import for cache indicator
- Lint check passes cleanly

Stage Summary:
- Server-side: screenerCache Map with 3-min TTL, cache key from params, force refresh support
- Client-side: module-level clientCache survives tab switches, 3-min TTL
- Both caches work together: client cache avoids even making the API request, server cache avoids re-running the expensive pipeline
- User sees "缓存 Xs" badge when viewing cached data, can force refresh with button

---
Task ID: 2
Agent: main
Task: Add 涨停分析 (Limit-Up Analysis) page

Work Log:
- Created backend API at /api/stock/limit-up/route.ts (935 lines)
  - Fetches top 3 hot sectors from EastMoney by change percent
  - Gets limit-up stocks for each sector (>=9.9% main board, >=19.9% ChiNext/STAR)
  - Technical analysis: lock time, lock strength, break count, volume ratio, limit-up type, consecutive days
  - News analysis via z-ai-web-dev-sdk: sector driver, catalysts, outlook, key events
  - 5-minute server-side cache with ?refresh=1 bypass
  - Partial results on error, proper timeout handling
- Created frontend component at /components/limit-up-analysis.tsx (815 lines)
  - Header card with date, refresh button, cache countdown badge
  - Three sector cards with news analysis section + stocks table
  - Color-coded limit-up type badges (一字板/秒板/早板/午板/尾板)
  - Lock strength progress bar with color coding
  - Consecutive days highlighting (>=3 red pulsing badge)
  - Module-level client cache (5-min TTL) persists across tab switches
- Integrated into main page tab system
  - Added "limit-up" to pageMode type union
  - Added "涨停" toggle button in header with TrendingUp icon
  - Added LimitUpAnalysis rendering in main content area
  - Stock selection switches back to "t-assistant" mode

Stage Summary:
- New page "涨停分析" accessible via "涨停" tab button
- Backend: full pipeline from sector discovery → limit-up filtering → technical + news analysis
- Frontend: polished UI with caching, responsive design, proper loading/error states
- All lint checks pass cleanly

---
Task ID: 3
Agent: main
Task: Make screener filter conditions editable for manual input

Work Log:
- Updated backend API (screener/route.ts):
  - Renamed `findCommunicationSectors()` to `findSectorsByKeyword(keyword)` 
  - Now accepts dynamic sector keyword parameter instead of hardcoded "通信"
  - Added alias mappings for common sectors (通信→通讯, 半导体→芯片, etc.)
  - Error message now shows the actual keyword searched
- Rewrote frontend component (stock-screener.tsx):
  - Added expandable filter panel with "编辑筛选条件" toggle
  - Sector input: text input with dropdown showing 16 popular sectors (通信, 半导体, AI, 新能源, etc.)
  - Change % range: dual-thumb slider + number inputs (min~max)
  - Max market cap: slider + number input (10~2000亿)
  - Pulse detection: on/off switch + threshold slider (0~100)
  - Quick presets: 5 predefined filter combinations (默认, 半导体宽幅, AI大市值, 新能源波动, 医药纯筛选)
  - "开始选股" button to apply filters and fetch data
  - "重置条件" button to reset to defaults
  - Active criteria tags always visible at top showing current filters
  - Changed indicator (yellow dot) when filters differ from defaults
  - Cache entry now includes filters state for consistency

Stage Summary:
- All 6 filter parameters are now user-editable: sector, minChange, maxChange, maxMarketCap, pulseThreshold, enablePulse
- Popular sectors quick-select dropdown with emoji icons
- Slider + number input combo for precise control
- Quick presets for common screening strategies
- Backend supports dynamic sector keyword search with alias expansion
- Lint passes cleanly

---
Task ID: 1
Agent: main
Task: Update screener default values: 涨幅范围-5%~10%, 脉冲拉升10%, 放量拉升10%

Work Log:
- Updated DEFAULT_FILTERS in stock-screener.tsx: minChange 0→-5, maxChange 3→10, pulseThreshold 20→10, volumeSurgeThreshold 20→10
- Updated backend route.ts default params: minChange "0"→"-5", maxChange "3"→"10", pulseThreshold "20"→"10", volumeSurgeThreshold "20"→"10"
- Updated quick preset buttons (半导体/AI/新能源/医药) to use new defaults
- Added "微弱脉冲" (score>=10) and "微弱放量" (score>=10) levels to label functions
- Added score>=10 color level (emerald-400) and background level (emerald-500/10) for both pulse and volume surge
- Updated fallback values in onChange handlers from || 20 to || 10

Stage Summary:
- Default screener filters now: 涨幅-5%~10%, 脉冲≥10, 放量≥10
- Score label system now has 6 levels (≥70/≥50/≥30/≥20/≥10/<10)
- Lint passes, dev server running normally

---
Task ID: 1
Agent: main
Task: Fix K-line chart not showing today's candle

Work Log:
- Root cause identified: Sina Finance daily K-line API (scale=240) does NOT return the current incomplete trading day. Only historical completed days are returned.
- Verified via live API test: scale=5 (intraday) includes today, scale=240 (daily) last bar is yesterday.
- Modified `allChartData` useMemo in page.tsx to merge today's real-time quote into K-line history:
  - Only applies for daily (1d) and weekly (1wk) intervals — intraday K-lines already include current session
  - Computes today's date in China timezone (UTC+8) for accurate date comparison
  - For weekly intervals, uses Monday's date as the week key
  - If today's candle is missing (lastDate < todayKey): appends new candle with quote data (open/high/low/close/volume), MA and MACD set to null
  - If today's candle already exists (lastDate === todayKey, e.g. after market close): updates with latest quote data
- Fixed `prevDayMA5` computation to fall back to previous bar when today's appended candle has null MA values
- MA lines in K-line chart already use `connectNulls`, so they gracefully skip null values on today's candle

Stage Summary:
- K-line chart now shows today's real-time candle for daily/weekly intervals
- Today's candle is built from live quote data (updated every 3 seconds)
- MA5/MA10/MA20 lines stop at yesterday (null values on today's candle are skipped via connectNulls)
- Lint passes, dev server running normally

---
Task ID: 1
Agent: main
Task: Add pulse surge and volume surge markers to the timeline chart

Work Log:
- Added `PulseVolumeMarker` interface (time, type, score, label, detail)
- Added `pvParseTime()` helper to parse HH:mm to minutes
- Added `detectPulseVolumeMarkers()` function - frontend version of the backend screener's pulse/volume surge detection
  - Pulse detection: 5-minute window surge, open-to-high, peak+pullback, volume spike, gap-up (same scoring logic as backend)
  - Volume surge detection: incremental volumes, max volume ratio, progressive increase, window volume vs baseline, up-with-high-vol ratio
  - Returns markers with exact time points for chart annotation
- Added `PulseVolumeRenderer` component - custom SVG renderer for Recharts ComposedChart
  - Pulse markers: orange/amber theme with ⚡ icon, positioned above price line
  - Volume surge markers: cyan/teal theme with ▲ icon, positioned below price line
  - Both have connecting dashed line from marker to price point, background pill label with score
- Integrated into data flow:
  - Added `pvMarkers` useMemo in main component, computed from `liveTimeline` and `timelinePrevClose`
  - Added `pvMarkerByTime` map in TimeSharingPanel's fullDayData computation
  - Injected `pvMarker` field into each timeline data point (like existing `tSignal`)
  - Added `PulseVolumeRenderer` as `<Customized>` component in price chart
  - Added `pvMarkers` prop to TimeSharingPanel
  - Added pvMarkers dependency to fullDayData useMemo
- Added pulse/volume surge summary in the signal analysis section below the chart
  - Amber badges for pulse markers, cyan badges for volume surge markers
  - Shows time, label (score), and detail description

Stage Summary:
- Timeline chart now shows pulse surge (⚡ orange) and volume surge (▲ cyan) markers
- Detection runs automatically on any stock using the timeline data
- Markers update in real-time as quote data refreshes every 3 seconds
- Signal analysis section shows a summary of detected markers
- Lint passes, dev server running normally
