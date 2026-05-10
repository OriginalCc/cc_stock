# Task 2-prep: Shared Screener Utilities

## File Created
`/home/z/my-project/src/lib/screener-shared.ts`

## What's Included

### 1. Watchlist System
- `SCREENER_WATCHLIST_KEY` = `"screener-watchlist"` (localStorage key)
- `WATCHLIST_CHANGED_EVENT` = `"screener-watchlist-changed"` (custom event)
- `WatchlistItem` interface: `{ symbol, name, addedAt, source, price?, changePercent? }`
- `loadWatchlist()`, `saveWatchlist()`, `addToWatchlist()`, `removeFromWatchlist()`, `isInWatchlist()`
- Custom event dispatched on every save for cross-component reactivity

### 2. Auto-Refresh System
- `isTradingHours()` - checks China timezone (UTC+8), 9:30-11:30 & 13:00-15:00 weekdays
- `getTradingPhaseInfo()` - returns `{ phase, minutesSinceOpen, isTradingHours }`
- `TRADING_REFRESH_INTERVAL` = 60000ms (1 minute)
- `useAutoRefresh(callback, enabled)` - React hook, 30s check interval, immediate fire on trading hours entry

### 3. Stats Utility
- `computeScreenerStats(scores)` - returns `{ avg, median, top25, distribution }` with 10-bucket distribution
- `formatMarketCap(val)` - centralized from 4+ duplicate implementations
- `formatAmount(val)` - centralized from 4+ duplicate implementations

### 4. Mini Timeline Fetcher
- `MiniTimelineItem` interface, `MiniTimelineResult` interface
- `fetchMiniTimeline(symbol)` - calls `/api/stock/ashare-timeline`, downsamples to max 30 points

## Usage Pattern for Screener Components
```typescript
import {
  // Watchlist
  loadWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist,
  WatchlistItem, WATCHLIST_CHANGED_EVENT,
  // Auto-refresh
  useAutoRefresh, isTradingHours, getTradingPhaseInfo, TRADING_REFRESH_INTERVAL,
  // Stats
  computeScreenerStats, formatMarketCap, formatAmount, ScreenerStats,
  // Timeline
  fetchMiniTimeline, MiniTimelineItem, MiniTimelineResult,
} from "@/lib/screener-shared";
```

## Notes
- `useAutoRefresh` uses `"use client"` implicit via React hooks import
- `formatMarketCap` and `formatAmount` match the existing implementations in early-trading-screener, intraday-screener, stock-screener, limit-up-analysis
- The file can be used on both client and server (non-hook exports are pure functions)
- Lint passes clean
