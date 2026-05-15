# Task 3 - Timeline Cache Optimizer

## Task
Optimize server-side stock screener API routes for faster loading by adding a shared timeline cache.

## Changes Made

### 1. Created `/src/lib/server-timeline-cache.ts`
- Module-level in-memory `Map<string, TimelineCacheEntry>` cache
- 60-second TTL (timeline data updates frequently during trading)
- `getCachedTimeline(symbol)` - returns cached data or null if expired/missing
- `setCachedTimeline(symbol, data)` - stores data with current timestamp
- `getTimelineCacheStats()` - returns cache size for debugging
- Cache type accommodates both `{ time, price, volume }[]` and `{ time, price, volume, avgPrice? }[]`

### 2. Modified `/src/app/api/stock/screener/route.ts`
- Added import of `getCachedTimeline`, `setCachedTimeline` from `@/lib/server-timeline-cache`
- `getStockTimeline()`: checks cache first, stores result after successful fetch
- Batch size: 5 → 10

### 3. Modified `/src/app/api/stock/intraday-screener/route.ts`
- Same pattern: import cache, check/store in `getStockTimeline()`
- Batch size: 5 → 10

### 4. Modified `/src/app/api/stock/early-screen/route.ts`
- Same pattern: import cache, check/store in `getStockTimeline()`
- Batch size: 5 → 10

### 5. Modified `/src/app/api/stock/limit-up/route.ts`
- Same pattern: import cache, check/store in `getStockTimeline()`
- Batch size: 5 → 10

## Result
- Lint passes cleanly
- Shared cache eliminates redundant per-stock HTTP calls to Tencent API across all 4 screener routes
- Increased batch concurrency from 5 to 10 for faster processing
