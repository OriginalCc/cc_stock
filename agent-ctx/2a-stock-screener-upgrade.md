# Task 2a: Upgrade Stock Screener Component

## Task Summary
Upgraded `/home/z/my-project/src/components/stock-screener.tsx` with 5 new features.

## Changes Made

### 1. Replace Duplicate Helper Functions
- Removed local `formatMarketCap()` and `formatAmount()` function definitions (lines 109-126 in original)
- Added import from `@/lib/screener-shared`: `formatMarketCap, formatAmount, loadWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist, type WatchlistItem, useAutoRefresh, computeScreenerStats, isTradingHours`

### 2. Watchlist/Favorites Functionality
- Added `watchlist` state (`useState<WatchlistItem[]>([])`)
- Load on mount: `useEffect(() => { setWatchlist(loadWatchlist()); }, [])`
- Listen for changes: `useEffect` with `screener-watchlist-changed` event listener
- Watchlist badge section at top showing watchlisted stocks as compact yellow badges
- Clicking badge calls `onSelectStock(symbol)`
- Star icon button in each table row toggles watchlist status with `e.stopPropagation()`

### 3. Auto-Refresh During Trading Hours
- Added `autoRefreshEnabled` state (default: true)
- Added `pageVisible` state with `visibilitychange` listener
- Used `useAutoRefresh` hook with condition `autoRefreshEnabled && pageVisible`
- Clock icon toggle button next to refresh button
- Green pulsing dot indicator when auto-refresh is active during trading hours

### 4. Result Statistics Summary
- Added `statsExpanded` state
- Collapsible statistics section after stats bar
- Pulse score distribution as color-coded horizontal bar chart
- Evaluation distribution as colored badges with counts
- Toggle button with BarChart3 icon

### 5. Table UX Improvements
- Alternating row colors: `bg-background` / `bg-muted/20`
- Rank badges for top 3: 🥇🥈🥉
- Symbol column widened to 90px for star + rank + symbol
- Star button is separate clickable element

## Lint Status
All checks pass (`bun run lint` - no errors)
