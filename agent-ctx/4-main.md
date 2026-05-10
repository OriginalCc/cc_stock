# Task 4 - Add Strategy Panel to Stock Screener

## Agent: main

## Status: COMPLETED

## Summary
Added a collapsible strategy panel ("选股策略面板") to the stock screener component, borrowing the design from the T-trading page's StrategyAdminPanel.

## Changes Made

### File: `/home/z/my-project/src/components/stock-screener.tsx`

1. **New imports**: Added `Tabs`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`, and lucide icons (`Settings`, `Save`, `Eye`, `EyeOff`, `Cpu`, `Shield`)

2. **New state variables**:
   - `strategyExpanded` (boolean, default false)
   - `strategyTab` (string, default "overview")
   - `strategyFactors` (any[])
   - `strategyConfig` (Record<string, Record<string, number>>)
   - `strategyLoading` (boolean)
   - `strategyFetchedRef` (useRef)
   - `editingParamKey`, `editingParamValue` (for inline param editing)

3. **New functions**:
   - `fetchStrategyData()` - Fetches from `/api/stock/strategy-factors` and `/api/stock/strategy-config`
   - `handleStrategyExpand()` - Toggle panel + trigger fetch on first expand
   - `handleFactorToggle()` - PUT to `/api/stock/strategy` to toggle factor enabled
   - `handleFactorFieldChange()` - PUT to `/api/stock/strategy` to update strength/tMode/timeWindow
   - `handleConfigSave()` - PUT to `/api/stock/strategy-config` to save param edits

4. **New JSX**: Strategy panel Card with 5 tabs:
   - **选股总纲 (overview)**: Strategy name, core philosophy, selection criteria, exclusion rules, scoring system
   - **评分权重 (scoring)**: Pulse detection factors table, volume surge factors table, evaluation model factors
   - **DB因子库 (factors)**: DB factor table with toggle/select dropdowns
   - **评估模型 (evaluation)**: 6 evaluation labels with color-coded badges, bullish/bearish factor tables
   - **指标参数 (params)**: MACD, VWAP, RSI, Bollinger, Volume params with click-to-edit

### File: `/home/z/my-project/worklog.md`
- Appended Task 4 work record

## Lint Result
- `bun run lint` passes with zero errors

## Dev Server
- Server running stably on port 3000
