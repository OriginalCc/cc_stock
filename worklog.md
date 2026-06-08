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
