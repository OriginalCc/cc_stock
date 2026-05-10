---
Task ID: 1
Agent: Main Agent
Task: Implement early trading screening (开盘1小时选股) feature

Work Log:
- Explored existing project structure: intraday-screener component and API, page.tsx navigation
- Designed 6-dimension early trading screening strategy focusing on first 60 minutes of trading
- Created backend API: `/api/stock/early-screen/route.ts` with:
  - Trading phase detection (开盘15分钟/30分钟/1小时/盘中/非交易时间)
  - Opening pattern analysis (高开强走/低开反转/平开上攻)
  - Early volume analysis (开盘放量/量比飙升/递增放量)
  - Early VWAP analysis (快速突破均价线/均价线上行)
  - Early trend pattern analysis (V型反转/阶梯启动/创新高)
  - Early MACD analysis (早盘MACD金叉/DIF转正)
  - Early capital flow analysis (主力抢筹/资金推升)
  - Composite scoring with weighted formula emphasizing opening pattern and volume
  - Timeline data filtering to only use first 60 minutes (9:30-10:30)
- Created frontend component: `/src/components/early-trading-screener.tsx` with:
  - Real-time trading phase display with countdown timer
  - Strategy selector (综合评分/量比飙升/主力抢筹/涨幅排行/换手活跃)
  - Filter panel with adjustable parameters
  - Results table with early-specific columns (开盘缺口/开盘形态/早盘量能/前30分涨跌等)
  - Strategy explanation card with usage tips
- Updated page.tsx to add "早盘选股" navigation button and EarlyTradingScreener component
- Tested: API returns correct trading phase, lint passes, page compiles and renders correctly

Stage Summary:
- New page "早盘选股" (early-screen) added to navigation bar
- Backend API: GET /api/stock/early-screen with full early-trading analysis
- Frontend component: EarlyTradingScreener with 6-dimension scoring system
- Key feature: Can screen stocks within first hour of trading, no need to wait for full day
- All lint checks pass, dev server running without errors

---
Task ID: 1
Agent: Bug Fix Agent
Task: Fix K-line chart duplicate bar bug

Root Cause:
- In `allChartData` useMemo, `lastDate` from API could have format like `"2025-03-14 00:00:00"` while `todayKey` was `"2025-03-14"`
- String comparison `lastDate === todayKey` failed due to format mismatch
- String comparison `lastDate < todayKey` also failed (`"2025-03-14 00:00:00"` > `"2025-03-14"` lexicographically due to space suffix)
- This caused a new bar to be pushed instead of merging into the existing one, creating duplicates
- Dedup kept the last occurrence (quote-pushed bar with null MA/MACD) instead of the API bar with computed indicators

Fix Applied (in `/home/z/my-project/src/app/page.tsx`, lines 178-274):
1. Added `normalizeDate()` helper that extracts just the date part (`d.split(" ")[0].split("T")[0]`)
2. Replaced `lastDate` comparison logic with a reverse search from end of array using normalized dates
3. When API already has today's bar (`existingTodayIdx >= 0`), merge quote OHLCV data into it while preserving API-computed MA/MACD values
4. Only push a new bar if no existing bar is found AND it's a weekday
5. Improved deduplication to prefer bars with non-null MA values (API data) over quote-pushed bars with null MA
6. Added date field normalization in dedup output to clean format (remove time component from date strings)

Verification:
- `bun run lint` passes with no errors
- Dependencies array unchanged: [history, quote, interval]
- All existing functionality preserved

---
Task ID: 2-prep
Agent: Prep Agent
Task: Create shared utility code for all 4 screener components

Work Log:
- Analyzed existing screener components (early-trading-screener, intraday-screener, stock-screener, limit-up-analysis) to identify duplicated code
- Found formatMarketCap() and formatAmount() duplicated in 4+ components with identical implementations
- Created `/src/lib/screener-shared.ts` with 4 major utility sections:
  1. Watchlist/Favorites System (localStorage-based):
     - SCREENER_WATCHLIST_KEY constant
     - WatchlistItem interface (symbol, name, addedAt, source, price, changePercent)
     - loadWatchlist() / saveWatchlist() with localStorage + custom event dispatch
     - addToWatchlist() / removeFromWatchlist() with update semantics
     - isInWatchlist() for quick lookup
     - Custom event "screener-watchlist-changed" dispatched on every mutation
  2. Auto-Refresh System:
     - isTradingHours() checks China timezone trading hours (9:30-11:30, 13:00-15:00 weekdays)
     - getTradingPhaseInfo() returns phase name, minutes since open, and trading status
     - TRADING_REFRESH_INTERVAL = 60000 (1 minute)
     - useAutoRefresh() React hook that auto-refreshes during trading hours with 30s check interval
  3. Screener Stats Utility:
     - computeScreenerStats() computes avg, median, top25, and 10-bucket distribution
     - formatMarketCap() centralized from 4+ duplicate implementations
     - formatAmount() centralized from 4+ duplicate implementations
  4. Mini Timeline Fetcher:
     - fetchMiniTimeline() fetches + downsamples timeline data for preview charts
     - Uses existing /api/stock/ashare-timeline endpoint
     - Downsampling to max 30 points with guaranteed last-point inclusion
- Fixed lint error: useRef.current assignment during render → wrapped in useEffect
- All lint checks pass

Stage Summary:
- New file: /src/lib/screener-shared.ts (exported utilities for 4 screener components)
- Ready for consumption by early-trading-screener, intraday-screener, stock-screener, limit-up-analysis
- Eliminates formatMarketCap/formatAmount duplication across 4+ files
- Provides shared watchlist, auto-refresh, stats, and timeline preview capabilities

---
Task ID: 2a
Agent: Upgrade Agent
Task: Upgrade stock-screener component with new features

Work Log:
- Replaced local `formatMarketCap()` and `formatAmount()` with imports from `@/lib/screener-shared`
- Added `Star`, `Clock` icons from lucide-react
- Added `useMemo` import from React
- Imported shared utilities: `formatMarketCap, formatAmount, loadWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist, type WatchlistItem, useAutoRefresh, computeScreenerStats, isTradingHours`

1. Watchlist/Favorites functionality:
   - Added `watchlist` state (WatchlistItem[])
   - Load watchlist on mount with `useEffect`
   - Listen for `screener-watchlist-changed` custom events to sync across components/tabs
   - Added watchlist badge section at top (between filter tags and filter panel) showing watchlisted stocks as compact yellow badges
   - Clicking a badge calls `onSelectStock(symbol)` to navigate to the stock
   - Each table row has a star icon button (before the symbol) that toggles watchlist status
   - Filled yellow star for watchlisted stocks, outline star for others
   - Star button uses `e.stopPropagation()` to avoid triggering row navigation

2. Auto-Refresh during trading hours:
   - Added `autoRefreshEnabled` state (default: true)
   - Added `pageVisible` state with `visibilitychange` event listener
   - Used `useAutoRefresh` hook from shared module with condition `autoRefreshEnabled && pageVisible`
   - Added Clock icon toggle button next to the refresh button
   - Shows green pulsing dot indicator when auto-refresh is active during trading hours
   - Tooltip explains current auto-refresh status

3. Result Statistics Summary:
   - Added `statsExpanded` state
   - Added collapsible statistics section after the stats bar
   - Pulse score distribution: horizontal bar chart using `computeScreenerStats` with color-coded bars (gray/yellow/orange/red)
   - Evaluation distribution: colored badges with counts for all 6 evaluation labels
   - Shows mean and median values for pulse scores
   - Toggle button with BarChart3 icon

4. Table UX improvements:
   - Alternating row colors: `bg-background` / `bg-muted/20`
   - Rank badges for top 3 stocks: 🥇🥈🥉
   - Symbol column widened to 90px to accommodate star + rank badge + symbol
   - Star button is a separate clickable element with `stopPropagation`

All lint checks pass. All existing functionality preserved.

Stage Summary:
- Stock screener component upgraded with 4 new features
- Watchlist integration complete with cross-component sync
- Auto-refresh during trading hours with visibility detection
- Collapsible statistics with pulse distribution and evaluation counts
- Improved table readability with alternating rows, rank badges, and inline watchlist toggle

---
Task ID: 2b
Agent: Upgrade Agent
Task: Upgrade intraday-screener component with new features

Work Log:
- Replaced local `formatMarketCap()` and `formatAmount()` with imports from `@/lib/screener-shared`
- Removed duplicate local function definitions (lines 165-182 in original file)
- Added imports: `Star`, `X`, `ChevronRight` from lucide-react
- Imported shared utilities: `formatMarketCap, formatAmount, loadWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist, type WatchlistItem, useAutoRefresh, computeScreenerStats, fetchMiniTimeline, type MiniTimelineResult, isTradingHours`

1. Watchlist/Favorites functionality:
   - Added `watchlist` state (WatchlistItem[])
   - Load watchlist on mount with `useEffect`
   - Listen for `screener-watchlist-changed` custom events to sync across components/tabs
   - Added compact watchlist section between filter tags and filter panel with amber styling
   - Watchlist badges show stock name and changePercent, clickable to navigate
   - Each table row has a star icon button in the new "操作" column that toggles watchlist status
   - Filled amber star for watchlisted stocks (always visible), outline star for others (visible on hover)
   - Star button uses `e.stopPropagation()` to avoid triggering row navigation

2. Auto-Refresh during trading hours:
   - Added `autoRefresh` state (default: false)
   - Used `useAutoRefresh` hook from shared module
   - Added Zap icon toggle button next to the refresh button with "自动" label
   - Shows green pulsing dot indicator when auto-refresh is active
   - Tooltip explains auto-refresh status
   - Button style changes to `variant="default"` when active

3. Result Statistics Summary:
   - Added `statsExpanded` state
   - Added collapsible statistics section after the stats bar with toggle button
   - Composite score distribution using `computeScreenerStats`: horizontal bar chart with color-coded bars (gray/lime/yellow/orange/red)
   - Shows avg, median, and P75 values
   - Pattern tag distribution: horizontal bar chart with tag-specific colors
   - Tag counts and percentages shown
   - Two-column layout: score distribution + pattern tag distribution

4. Table UX improvements:
   - Alternating row colors: even rows transparent, odd rows `bg-muted/20`
   - Rank badges for top 3 stocks: 🥇🥈🥉 emoji in the # column
   - Expanded action column (w-[80px]) with both star and eye buttons
   - Star button always visible when watchlisted, otherwise shows on hover
   - Eye button shows on hover, stays highlighted when preview is active

5. Mini Timeline Preview:
   - Added `previewStock`, `previewData`, `previewLoading`, `previewPos` states
   - When user clicks Eye icon on a stock row, fetches mini timeline data via `fetchMiniTimeline`
   - Shows fixed-position popup near the clicked row with:
     - Stock name, symbol, price, and change%
     - SVG line chart (MiniLineChart component) of the last ~30 data points
     - Color-coded line (red for up, green for down) with area fill
     - Dashed prevClose reference line
     - Time labels for first and last data points
   - Close button (X) to dismiss
   - Click outside to dismiss (via mousedown event listener)
   - Loading state with spinner
   - Empty state message when no data

All lint checks pass. All existing functionality preserved.

Stage Summary:
- Intraday screener component upgraded with 6 new features
- Replaced duplicate formatMarketCap/formatAmount with shared imports
- Watchlist integration with cross-component sync and amber-themed badge section
- Auto-refresh toggle with green pulse indicator
- Collapsible statistics with score distribution and pattern tag distribution
- Improved table: alternating rows, rank badges, star+eye action column
- Mini timeline preview popup with SVG line chart

---
Task ID: 2d
Agent: Upgrade Agent
Task: Upgrade limit-up-analysis component with new features

Work Log:
- Replaced local `formatMarketCap()` and `formatAmount()` with imports from `@/lib/screener-shared`
- Removed duplicate local function definitions (lines 108-125 in original)
- Imported shared utilities: `formatMarketCap, formatAmount, loadWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist, type WatchlistItem, useAutoRefresh, isTradingHours`
- Added new icon imports: `Star, Activity, Crown, Medal, Award`

1. Watchlist/Favorites functionality:
   - Added `watchlist` state (WatchlistItem[])
   - Load watchlist on mount with `useEffect`
   - Listen for `screener-watchlist-changed` custom events to sync across components/tabs
   - Added `WatchlistSection` sub-component: compact card at top showing watchlisted stocks as yellow badges with name and changePercent
   - Each stock row has a star icon button (first column) that toggles watchlist status
   - Filled yellow star for watchlisted stocks, muted outline for others
   - Star button uses `e.stopPropagation()` to avoid triggering row navigation
   - Watchlist badges are clickable to navigate to stock, star icon removes from watchlist

2. Auto-Refresh during trading hours:
   - Added `autoRefreshEnabled` state (default: true)
   - Used `useAutoRefresh` hook from shared module with `autoRefreshEnabled` condition
   - Added Activity icon toggle button in header with green pulsing dot during active trading hours
   - Tooltip explains auto-refresh status
   - Button styled as emerald when enabled, outline when disabled

3. Improved Sector Card UX:
   - Alternating row colors: odd rows get `bg-muted/20`
   - Rank badges for top 3 stocks per sector: Crown (gold), Medal (silver), Award (bronze)
   - Star button in first column with `stopPropagation` to not trigger row click
   - Added summary bar in sector card header showing: total limit-up count, average lock strength (color-coded), consecutive board leader (连板王)
   - Added dedicated first column for star/rank icons

4. Overall statistics (new card after header):
   - Sector Distribution: SVG mini pie chart with color-coded legend showing sector name + count
   - Limit-Up Type Distribution: colored badges with counts and percentages for 一字板/秒板/早板/午板/尾板
   - Lock Strength Distribution: horizontal bar chart with 4 brackets (强≥80, 中50-79, 弱30-49, 散<30) with color-coded bars and counts
   - Pie chart built using reduce (no mutable variable during render) to satisfy React hooks immutability lint rule

Verification:
- `bun run lint` passes with no errors
- Fixed react-hooks/immutability lint error by refactoring pie chart `cumulativeAngle` mutation into `reduce` accumulator pattern
- Dev server running without compilation errors

Stage Summary:
- Limit-up analysis component fully upgraded with 5 new features
- Watchlist integration with cross-component sync and compact display
- Auto-refresh during trading hours with visual indicator
- Improved sector card readability with alternating rows, rank badges, and summary bars
- New overall statistics card with pie chart, type distribution, and lock strength distribution
- All duplicate helper functions removed in favor of shared module imports

---
Task ID: 2c
Agent: Upgrade Agent
Task: Upgrade early-trading-screener component with new features

Work Log:
- Replaced local `formatMarketCap()` and `formatAmount()` function definitions with imports from `@/lib/screener-shared`
- Removed duplicate local function definitions (lines 151-170 in original)
- Imported shared utilities: `formatMarketCap, formatAmount, loadWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist, type WatchlistItem, useAutoRefresh, computeScreenerStats, getTradingPhaseInfo, fetchMiniTimeline, type MiniTimelineResult, WATCHLIST_CHANGED_EVENT`
- Added new icon imports: `Star, X`

1. Watchlist/Favorites functionality:
   - Added `watchlist` state (WatchlistItem[])
   - Load watchlist on mount with `useEffect`
   - Listen for `screener-watchlist-changed` custom events AND `storage` events for cross-component/cross-tab sync
   - Added compact watchlist card section between stats bar and results table showing watchlisted stocks as badges with name + changePercent
   - Watchlist badges clickable to navigate to stock
   - Each table row has a star icon button (in the stock name column) that toggles watchlist status
   - Filled amber star for watchlisted stocks, muted outline for others
   - Star button uses `e.stopPropagation()` to avoid triggering row navigation

2. Auto-Refresh during trading hours:
   - Added `autoRefreshEnabled` state (default: true)
   - Used `useAutoRefresh` hook from shared module with `autoRefreshEnabled` condition
   - Added `isInGoldenWindow` computed value that checks if currently in 9:30-10:30 (minutesSinceOpen <= 60)
   - Auto-refresh badge in header shows:
     - Pulsing amber with "黄金窗口自动刷新中" during golden window
     - Green with "自动刷新" during other trading hours
     - Clickable to toggle on/off
   - Shows muted badge "开启自动刷新" when disabled

3. Result Statistics Summary:
   - Added statistics card after watchlist section using `computeScreenerStats`
   - Three-column layout:
     - Score distribution: shows average, median, P75 values + mini color-coded horizontal bar chart (10 buckets from gray→lime→yellow→orange→red)
     - Pattern tag distribution: top 6 pattern tags as colored badges with counts
     - Open gap rate distribution: 高开/平开/低开 counts with color-coded mini bar + legend

4. Table UX improvements:
   - Alternating row colors: odd rows get `bg-muted/20`
   - Rank badges for top 3: gold circle (1), silver circle (2), bronze circle (3) — others show plain number
   - Star button in stock name column with `e.stopPropagation()` — does NOT trigger row navigation
   - Added `getRankBadge()` helper function for rank display

5. Mini Timeline Preview:
   - Eye icon in last column triggers `handleTimelineFetch()` which calls `fetchMiniTimeline()` from shared module
   - Shows popup card with:
     - SVG line chart (price line in red, avg price dashed blue, prev close dashed gray)
     - Legend explaining the 3 lines
     - Three early-specific data cards: 开盘缺口率, 前30分钟涨跌, 早盘量比
   - Loading state with spinner
   - Close button with X icon
   - Click-outside-to-close behavior via `mousedown` event listener
   - `e.stopPropagation()` on Eye button to not trigger row click

Verification:
- `bun run lint` passes with no errors
- Dev server running without compilation errors
- All existing functionality preserved (strategy selector, filter panel, tooltips, trading phase display)

Stage Summary:
- Early-trading-screener component fully upgraded with 6 new features
- Shared module imports replace duplicate formatMarketCap/formatAmount
- Watchlist integration with cross-component sync and compact display
- Auto-refresh during trading hours with golden window indicator
- Result statistics card with score distribution, pattern tags, and gap rate distribution
- Improved table readability with alternating rows, rank badges, and inline watchlist toggle
- Mini timeline popup with SVG chart and early-specific data cards
- All lint checks pass
---
Task ID: 1
Agent: main
Task: Add "递增放量" (progressive volume increase) factor to stock screening and display on time-sharing chart

Work Log:
- Read and analyzed codebase: t-strategy.ts (signal generation), chart-shared.ts (marker detection), time-sharing-panel.tsx (marker rendering), stock-screener.tsx (screener UI)
- Added "progressive_vol" type to PulseVolumeMarker interface in chart-shared.ts
- Added progressive volume detection algorithm in detectPulseVolumeMarkers() function in chart-shared.ts
- The detection finds 3+ consecutive minutes of increasing volume, calculates score based on: sequence length, price rise, volume growth rate, multi-round progressive, average step growth rate, and progressive volume ratio
- Updated PulseVolumeRenderer in time-sharing-panel.tsx with emerald/green color theme for progressive_vol markers (distinct from pulse=amber, volume_surge=cyan)
- Added Factor 39 "递增放量" to t-strategy.ts signal generation engine - generates buy signals when 3+ consecutive minutes of increasing volume + price rise
- Signal strength: strong (6+ min + 1.5% rise + 100% vol growth), medium (4+ min + 0.5% rise), weak (3+ min + any rise)
- Added "递增放量" factor to DB seed data in strategy-factors/route.ts and strategy/route.ts
- Inserted "递增放量" factor into live database via API call
- Lint check passed, dev server running without errors

Stage Summary:
- "递增放量" factor now appears in:
  1. Time-sharing chart as emerald/green markers with 📈 icon
  2. Signal generation as Factor 39 (buy signal, 反T mode)
  3. Strategy panel as a toggleable factor in VOLUME_PATTERN category
  4. Stock screener already had progressiveVolScore (existing feature)
- Three marker types now on time-sharing chart: pulse (amber/⚡), volume_surge (cyan/▲), progressive_vol (emerald/📈)

---
Task ID: 5
Agent: main
Task: Update 递增放量 factor in screening strategy panel

Work Log:
- Added auto-migration logic to /api/stock/strategy-factors GET endpoint
- Created DEFAULT_FACTOR_SEEDS constant with all v3.3+ factors including 递增放量
- Auto-migration checks existing factor names and creates any missing ones
- Updated evaluateStock() in screener API to include progressiveVolScore (factors 7b and 7c)
- Added 递增放量 as rule #24 in strategy/route.ts timeline signals rules
- Verified lint passes with no errors

Stage Summary:
- 递增放量 now appears in screener strategy panel via auto-migration
- evaluateStock() now considers progressiveVolScore for bullish evaluation
- Timeline signals rules updated to include 递增放量 (id: 24)
- DB will auto-migrate on next GET request to /api/stock/strategy-factors

---
Task ID: 1
Agent: Screener Enhancement Agent
Task: Enhance screener API with improved stock selection capabilities

Work Log:
- Read existing `/home/z/my-project/src/app/api/stock/screener/route.ts` (1492 lines) and worklog
- Added 6 new fields to ScreenerStock interface:
  - compositeScore (number 0-100): weighted combination of all factors
  - compositeDetail (string): breakdown of composite score components
  - resonanceTags (string): comma-separated multi-factor resonance tags
  - vwapPosition (string): "above_vwap"|"below_vwap"|"near_vwap"|"cross_up"|"cross_down"|"no_data"
  - vwapPositionDetail (string): human-readable VWAP position description
  - capitalTrend (string): "strong_inflow"|"moderate_inflow"|"neutral"|"outflow"|"strong_outflow"
  - capitalTrendDetail (string): capital trend description with inflow ratio
- Added `detectVWAPPosition()` function:
  - Calculates VWAP from cumulative timeline data by computing per-minute volumes first
  - VWAP = cumulative(price * per_minute_volume) / cumulative(per_minute_volume)
  - Detects cross_up/cross_down events within last 5 minutes
  - Classifies: above_vwap (>0.5%), below_vwap (<-0.5%), near_vwap (±0.5%), cross events
- Added `analyzeCapitalTrend()` function:
  - Classifies based on mainNetInflow/amount ratio
  - strong_inflow (>5%), moderate_inflow (>2%), neutral (-2%~2%), outflow (<-2%), strong_outflow (<-5%)
  - Includes inflow ratio percentage in detail string
- Added `calculateCompositeScore()` function:
  - Weights: pulseScore 20%, volumeSurgeScore 20%, progressiveVolScore 15%, evaluation 15%, capitalTrend 15%, vwapPosition 15%
  - Maps evaluation labels to scores (强势续涨=100, 温和看多=75, 震荡整理=50, etc.)
  - Maps capital trend to scores (strong_inflow=100, moderate_inflow=75, etc.)
  - Maps VWAP position to scores (above_vwap=90, cross_up=85, near_vwap=70, etc.)
  - Final score = weighted sum, capped 0-100
- Added `detectResonance()` function:
  - 脉冲放量共振: pulseScore≥40 AND volumeSurgeScore≥40
  - 递增放量共振: progressiveVolScore≥40 AND (pulseScore≥30 OR volumeSurgeScore≥30)
  - 三因子共振: all three scores≥40
  - 资金量能共振: capitalTrend includes "inflow" AND (pulseScore≥30 OR volumeSurgeScore≥30)
  - 均线共振: vwapPosition is above_vwap/cross_up AND (pulseScore≥30 OR volumeSurgeScore≥30)
  - Returns comma-separated tags, empty string if none
- Integrated into main handler (3 code paths):
  1. Pulse/volume/progVol detection path: calls all new functions inside timeline batch processing after evaluation
  2. MA trend only path: computes capitalTrend, compositeScore, resonanceTags (VWAP=no_data)
  3. No detection path: same as path 2 (VWAP=no_data)
- Initialized new fields with defaults in candidates.push()
- Updated sort order in all 3 paths: compositeScore desc → reliabilityScore desc → changePercent desc
- Lint passes with no errors
- Dev server running without compilation errors

Stage Summary:
- Screener API enhanced with 4 new detection functions and 6 new output fields
- VWAP position detection provides price-vs-average-price analysis
- Capital trend analysis quantifies main force net inflow as percentage of amount
- Composite score provides single 0-100 metric combining all factors with specified weights
- Multi-factor resonance detection identifies simultaneous strong signals across factors
- Default sort changed from reliabilityScore-first to compositeScore-first
- All existing functionality preserved, no breaking changes

---
Task ID: 4
Agent: Frontend Update Agent
Task: Update stock-screener frontend component to display enhanced screening features

Work Log:
- Read existing `/home/z/my-project/src/components/stock-screener.tsx` and worklog
- Added 7 new fields to ScreenerStock interface:
  - compositeScore, compositeDetail, resonanceTags, vwapPosition, vwapPositionDetail, capitalTrend, capitalTrendDetail
- Added "compositeScore" to SortField type as first option
- Added 6 new helper functions after existing ones:
  - getCompositeScoreColor(): color mapping for composite score (80→red, 65→orange, 50→yellow, 35→lime, 20→emerald, else gray)
  - getCompositeScoreBg(): background/border color mapping for composite score
  - getCompositeLabel(): label mapping (80→极佳, 65→优秀, 50→良好, 35→一般, 20→偏弱, else 弱势)
  - getVwapPositionLabel(): VWAP position label + color (above_vwap→均线上方/red, below_vwap→均线下方/green, near_vwap→均线附近/yellow, cross_up→上穿均线/red, cross_down→下穿均线/green)
  - getCapitalTrendLabel(): capital trend label + color + icon (strong_inflow→大幅流入/🔴, moderate_inflow→温和流入/📈, neutral→中性/➡️, outflow→流出/📉, strong_outflow→大幅流出/⚠️)
- Added composite score column to table:
  - New TableHead "综合评分" with sort icon AFTER "名称" and BEFORE "可靠度"
  - New TableCell with Badge + label + tooltip showing score/100 and compositeDetail
  - Uses compColor/compBg/compLabel calculated at top of stock row rendering block
- Updated "信号详情" column:
  - Added resonanceTags display with 🎯 prefix in rose-500
  - Replaced reliabilityDetail with compositeDetail for 🛡 prefix in emerald-500
  - Added vwapPosition display with 📏 prefix in teal-500 (only when not "no_data")
  - Added capitalTrend display with emoji + text from getCapitalTrendLabel (only when not "neutral")
  - Updated tooltip to show all new fields: 共振, 综合, 脉冲, 放量, 递增, 均价线, 资金
  - Changed "无信号" condition to check compositeScore instead of reliabilityScore
  - Widened column from max-w-[160px] to max-w-[200px], tooltip from max-w-[300px] to max-w-[350px]
- Changed default sortField from "changePercent" to "compositeScore"
- Added minCompositeScore field to ScreenerFilters interface and DEFAULT_FILTERS (default: 0)
- Added composite score filter to filter panel:
  - New section after Row 3 with Target icon label "最低综合评分"
  - Slider (0-100, step 5) + number Input + quick buttons (不限/≥30/≥50/≥65)
  - Changed Row 3 grid from lg:grid-cols-4 to lg:grid-cols-5
- Added client-side filtering for minCompositeScore in displayStocks computation
- Added composite score criteria tag: rose-colored Badge with Target icon showing "综合≥N" when minCompositeScore > 0
- Updated strategy panel overview tab: added "综合" row at top of 评分体系 section with rose Badge describing 6维综合评分模型
- Updated all 6 quick preset filters to include enableProgressiveVol, progressiveVolThreshold, and minCompositeScore fields
  - 激进策略 preset sets minCompositeScore: 30
  - All other presets set minCompositeScore: 0

Verification:
- `bun run lint` passes with no errors
- Dev server running without compilation errors
- All existing functionality preserved

Stage Summary:
- Stock screener frontend updated to display 7 new fields from enhanced API
- Composite score column added to table with color-coded Badge and tooltip
- Signal details column enriched with resonance tags, VWAP position, and capital trend
- Composite score filter added to filter panel with slider and quick presets
- Default sort changed to compositeScore for best-first ordering
- Strategy panel updated with composite score description
- All 6 quick presets updated with complete filter fields

---
Task ID: 5
Agent: Main Agent
Task: Add smart recommendation summary card and finalize screener optimization

Work Log:
- Added smart recommendation summary card between criteria header and results table
- Shows TOP 3 stocks with composite score badges, evaluation labels, resonance tags, VWAP position
- Quick stats bar below: average composite score, resonance count, inflow count, above-VWAP count
- Fixed typo: stock.resononeTags → stock.resonanceTags in recommendation card
- Verified lint passes with no errors
- Verified dev server running without compilation errors
- All existing functionality preserved

Stage Summary:
- Smart recommendation card provides instant overview of best stocks
- Users can quickly identify top picks without scanning the full table
- Quick stats give a macro view of screening results quality
- All screener optimization tasks completed successfully

---
Task ID: 1
Agent: Intraday Screener Optimizer
Task: Optimize intraday-screener API to strictly use 09:30-10:30 time window and add new screening factors

Work Log:
- Read existing `/home/z/my-project/src/app/api/stock/intraday-screener/route.ts` (1008 lines)
- Read worklog for context on previous changes

Changes Made:
1. **Time Window Filtering**: Added `filterEarlyTimeline()` function that filters timeline data to only include 09:30-10:30. In the batch processing loop, after `getStockTimeline()`, the full timeline is filtered using this function. If early timeline has >= 5 data points, it's used; otherwise falls back to full day data. Added `earlyDataCount` tracker.

2. **Time Window Info in Response**: Added `timeWindow` (string: "09:30-10:30" or "full_day") and `timeWindowDetail` (string with explanation) fields to `IntradayScreenerResult` interface. All response paths (success, empty, error) include these fields.

3. **量价齐升 (Volume-Price Co-rise) Detection**: Added `analyzeVolumePriceCoRise()` function with 4 scoring dimensions:
   - Consecutive co-rise minutes (8+=30pts, 5+=22pts, 3+=12pts)
   - Overall co-rise ratio (50%+=25pts, 35%+=15pts, 25%+=8pts)
   - Big volume + price up bars density (3+=15pts, 2+=8pts)
   - Sustained average price & volume both positive (10pts)

4. **突破新高 (New High Breakout) Detection**: Added `analyzeNewHighBreakout()` function with 5 scoring dimensions:
   - Current price vs prev close (3%+=20pts, 2%+=15pts, 1%+=8pts)
   - New high count tracking (10+=25pts, 5+=18pts, 3+=10pts)
   - Recent breakout freshness (2+ in last 10min=20pts, 1=10pts)
   - Price near day high (0.5%=15pts, 1%=8pts)
   - Volume confirmation on breakout (avg*1.5=10pts)

5. **IntradayStock Interface**: Added 4 new fields: `coRiseScore`, `coRiseDetail`, `breakoutScore`, `breakoutDetail`

6. **Composite Score Weights Updated**:
   - vwap: 0.20→0.15, volumePattern: 0.25→0.20, trendPattern: 0.25→0.20
   - macd: 0.15→0.10, capitalFlow: 0.15→0.10
   - NEW: coRise: 0.15, breakout: 0.10
   - Total still = 1.00

7. **Batch Processing Integration**: Added co-rise and breakout analysis calls in the timeline batch processing loop, wrapped in try/catch for resilience. Both use the filtered (early session) timeline.

8. **Response Time Window Tracking**: `earlyDataCount` is tracked per-stock; final response includes timeWindow="09:30-10:30" with detail showing count, or "full_day" with fallback explanation.

Verification:
- `bun run lint` passes with no errors
- Dev server running without compilation errors
- All existing functionality preserved

Stage Summary:
- Intraday screener API now STRICTLY uses 09:30-10:30 time window for analysis (consistent with early-screen API)
- Two new screening factors added: 量价齐升 and 突破新高
- Composite score now uses 7 dimensions with updated weights
- Time window info exposed in API response for transparency
- Fallback to full day data only when early session has < 5 data points

---
Task ID: 4-b
Agent: Frontend Update Agent
Task: Update early-trading-screener frontend component to display new screening factors (量价齐升, 突破新高)

Work Log:
- Read existing `/home/z/my-project/src/components/early-trading-screener.tsx` (1434 lines) and worklog
- Made 4 targeted edits:

1. **EarlyScreenStock interface**: Added 4 new fields after `earlyCapitalDetail`:
   - `earlyCoRiseScore: number` — 量价齐升评分
   - `earlyCoRiseDetail: string` — 量价齐升详情
   - `earlyBreakoutScore: number` — 突破新高评分
   - `earlyBreakoutDetail: string` — 突破新高详情

2. **SortField type**: Added `earlyCoRiseScore` and `earlyBreakoutScore` to the union type

3. **Strategy Explanation Card**: Updated from 6 to 8 dimensions:
   - Changed grid from `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` to `grid-cols-2 sm:grid-cols-4 lg:grid-cols-8`
   - Updated text from "6大早盘特有维度" to "8大早盘特有维度"
   - Updated percentage weights: 开盘形态 25%→20%, 早盘量能 25%→20%, 均价线 15%→12%, 早盘趋势 15%→12%, 早盘MACD 10%→8%, 主力抢筹 10%→8%
   - Added 量价齐升 (12%) card with teal color theme
   - Added 突破新高 (8%) card with cyan color theme

4. **"严格09:30-10:30" emphasis badge**: Changed the "开盘1小时" badge text to "严格09:30-10:30" in the active filter tags section

Verification:
- `bun run lint` passes with no errors
- All existing functionality preserved (strategy selector, filter panel, table, timeline popup, watchlist, etc.)

Stage Summary:
- Early-trading-screener frontend updated to support 2 new screening factors
- Interface and type definitions updated for new score fields
- Strategy explanation card now shows 8 dimensions with updated percentages
- Active filter badge emphasizes strict 09:30-10:30 time window
- All lint checks pass

---
Task ID: 4-a
Agent: Frontend Update Agent
Task: Update intraday-screener frontend component to display time window info and new screening factors (量价齐升, 突破新高)

Work Log:
- Read existing `/home/z/my-project/src/components/intraday-screener.tsx` (1417 lines) and worklog for context

Changes Made:
1. **Added Clock import** from lucide-react (line 64)
2. **Updated IntradayStock interface** (lines 116-119): Added 4 new fields:
   - coRiseScore (number): 量价齐升评分
   - coRiseDetail (string): 量价齐升详情
   - breakoutScore (number): 突破新高评分
   - breakoutDetail (string): 突破新高详情
3. **Updated IntradayScreenerResult interface** (lines 129-130): Added 2 new fields:
   - timeWindow (string): "09:30-10:30" or "full_day"
   - timeWindowDetail (string): Description of why the time window was chosen
4. **Updated SortField type** (line 135): Added "coRiseScore" and "breakoutScore" as sortable fields
5. **Added time window badge** (lines 646-649): New Badge after "全市场扫描" showing:
   - "09:30-10:30 严格早段" when result.timeWindow === "09:30-10:30"
   - "全天数据" otherwise
   - Uses amber-500 styling with Clock icon
6. **Updated Strategy Description Card** (lines 931-961):
   - Changed "5大维度" → "7大维度"
   - Changed grid from `sm:grid-cols-5` → `grid-cols-2 sm:grid-cols-4 lg:grid-cols-7` for responsive layout
   - Updated existing dimension percentages: 均价线 20%→15%, 量价配合 25%→20%, 趋势形态 25%→20%, MACD 15%→10%, 资金流向 15%→10%
   - Added two new dimension cards: 量价齐升 (15%, teal), 突破新高 (10%, cyan)
7. **Updated RadarChart component** (lines 456-464): Added 2 new dimensions to the radar:
   - { key: "coRiseScore", label: "量价齐升", value: stock.coRiseScore }
   - { key: "breakoutScore", label: "突破新高", value: stock.breakoutScore }
8. **Updated Detail Panel dimension bars** (lines 1390-1398):
   - Updated existing dimension weights to match new percentages
   - Added 量价齐升 (weight: "15%", color: "bg-teal-500")
   - Added 突破新高 (weight: "10%", color: "bg-cyan-500")

Verification:
- `bun run lint` passes with no errors
- Dev server running without compilation errors
- All existing functionality preserved

Stage Summary:
- Intraday screener frontend updated to display time window info and 2 new screening factors
- Time window badge shows "09:30-10:30 严格早段" or "全天数据" based on API response
- Strategy description now shows 7 dimensions with updated percentages (total still 100%)
- Radar chart expanded from 5 to 7 dimensions
- Detail panel shows all 7 dimension bars with correct weights and colors
- SortField type supports sorting by coRiseScore and breakoutScore

---
Task ID: 1-5
Agent: Main Agent
Task: Optimize stock screening - strict 09:30-10:30 time window and add new screening factors

Work Log:
- Analyzed all 3 screening APIs: early-screen, intraday-screener, screener
- Found intraday-screener was using FULL DAY data (no time window filtering)
- Found early-screen had fallback to full day when < 10 data points
- Fixed intraday-screener: Added filterEarlyTimeline() to strictly filter to 09:30-10:30
- Fixed early-screen: Lowered threshold from 10 to 5 data points for early session
- Added 2 new screening factors to both APIs:
  - 量价齐升 (Volume-Price Co-rise): detects when volume AND price rise together consistently
  - 突破新高 (New High Breakout): detects stocks breaking to new intraday highs with volume confirmation
- Updated composite score weights:
  - intraday-screener: vwap 0.15, volumePattern 0.20, trendPattern 0.20, macd 0.10, capitalFlow 0.10, coRise 0.15, breakout 0.10
  - early-screen: opening 0.20, volume 0.20, vwap 0.12, trend 0.12, macd 0.08, capital 0.08, coRise 0.12, breakout 0.08
- Added timeWindow/timeWindowDetail fields to intraday-screener response
- Updated intraday-screener.tsx frontend: new fields, time window badge, 7-dimension radar, strategy card
- Updated early-trading-screener.tsx frontend: new fields, "严格09:30-10:30" badge, 8-dimension strategy card
- Lint passes, dev server running fine

Stage Summary:
- All screening now strictly uses 09:30-10:30 time window (with minimal fallback)
- Two new powerful screening factors added: 量价齐升 and 突破新高
- Frontend updated to display time window info and new factor scores
- All code quality checks pass

---
Task ID: 6
Agent: Main Agent
Task: Make screener marker tags higher z-order than intraday factor tags, and make screener tags more prominent

Work Log:
- Analyzed time-sharing-panel.tsx to understand tag rendering structure
- Found PulseVolumeRenderer (选股标记标签: 脉冲/放量拉升/递增放量) and TimelineSignalRenderer (分时因子标签: 买/卖信号) were two separate `<Customized>` components
- Extracted PulseVolumeRenderer's logic into shared functions: `extractPulseVolumePoints()` and `renderPulseVolumeMarker()`
- Made PulseVolumeRenderer markers much more prominent:
  - Circle radius: 4→6 with glow ring (r=9)
  - Label pill: 76×14→84×16 with thicker borders
  - Font size: 8→9 with fontWeight 700
  - Added white glow background behind label pill for readability
  - More opaque and saturated colors (bgColor 0.15→0.25, borderColor 0.6→0.85)
  - Thicker connector line (0.8→1.0) with better dash pattern
- Extracted TimelineSignalRenderer's rendering logic into a pure function `computeTimelineSignalElements()` that returns `{ signalElements, bubbleElements }` separately
- Created `CombinedChartOverlay` component with explicit 3-layer rendering order:
  - Layer 1 (bottom): 分时因子 signal markers & labels
  - Layer 2 (middle): 选股标记 pulse/volume markers (ON TOP of factor signals)
  - Layer 3 (top): Expanded signal bubbles (interactive, must be on top for usability)
- Replaced two `<Customized>` components with single `<Customized component={CombinedChartOverlay} />`
- Added `useCallback` import for state management in CombinedChartOverlay
- Lint check passes, dev server running without errors

Stage Summary:
- Screener marker tags (选股标记) now guaranteed to render ON TOP of intraday factor tags (分时因子)
- Screener tags are now much more prominent: larger markers, bolder labels, glow effects, white backing
- Single CombinedChartOverlay component ensures correct SVG layer ordering
- Legacy PulseVolumeRenderer and TimelineSignalRenderer kept for backward compat

---
Task ID: 8
Agent: Main Agent
Task: Optimize K-line page loading speed + Fix 放量→放量拉升 labels in 分时图

Work Log:
- Analyzed full K-line page loading flow and identified 7+ performance bottlenecks
- Key finding: heavy timeline computations (MACD, signal generation ~7000 condition evaluations, T-index, smart action, pvMarkers, keyPriceLevels) were running even in K-line mode where they're never displayed
- Fixed 放量 label in chart-shared.ts: "强放量"→"强放量拉升", "放量"→"放量拉升", "微放量"→"轻微放量拉升"

Performance optimizations implemented:

1. **Skip heavy timeline computations in K-line mode** (BIGGEST WIN)
   - Added `isTimelineActive` flag (chartMode === "timeline")
   - Guard all heavy useMemo hooks: timelineMACDData, timelineSignals, pvMarkers, signalCounts, tIndex, smartAction, keyPriceLevels, liveTimeline
   - When in K-line mode, all these return empty/default values immediately
   - This eliminates ~7000 condition evaluations per timeline update

2. **Skip timeline API fetch in K-line mode**
   - useStockData now only fetches timeline data when chartMode === "timeline"
   - On initial load: only fetches quote + history in K-line mode (1 less API call)
   - On stock change: skips fetchTimeline when in K-line mode

3. **Save/restore chartMode from localStorage**
   - New LAST_CHART_MODE_KEY persists the user's chart mode preference
   - If user was in K-line mode last session, page loads without fetching timeline data at all
   - changeChartMode now persists mode to localStorage

4. **Defer non-critical API calls**
   - Index timeline fetches delayed 3s (was immediate, now setTimeout 3s)
   - Factor overrides fetch delayed 2s (was immediate, now setTimeout 2s)
   - These no longer compete with the critical quote + history fetch path

5. **Defer K-line sub-chart rendering**
   - KLineChartPanel now uses `subChartsReady` flag with requestAnimationFrame
   - Main K-line chart renders immediately
   - Volume, KDJ, MACD sub-charts render one frame later
   - Shows "加载中..." placeholders briefly before sub-charts appear

6. **Conditional T-Index/Smart Action panel rendering**
   - T-Index & Smart Action panel only renders in timeline mode (quote && isTimelineActive && liveTimeline.length > 0)

Stage Summary:
- K-line page initial load reduced from 6+ parallel API calls to 2 (quote + history)
- ~7000 condition evaluations eliminated in K-line mode
- Sub-charts deferred by 1 frame for faster initial paint
- Non-critical fetches (indices, factor overrides) deferred 2-3s
- Previous session's "放量"→"放量拉升" label fix confirmed in chart-shared.ts
