# Task 4-b: Update early-trading-screener frontend for new screening factors

## Summary
Updated `/home/z/my-project/src/components/early-trading-screener.tsx` to display the new 量价齐升 and 突破新高 screening factors.

## Changes Made

### 1. EarlyScreenStock Interface (lines 90-95)
Added 4 new fields after `earlyCapitalDetail`:
- `earlyCoRiseScore: number` — 量价齐升评分
- `earlyCoRiseDetail: string` — 量价齐升详情
- `earlyBreakoutScore: number` — 突破新高评分
- `earlyBreakoutDetail: string` — 突破新高详情

### 2. SortField Type (line 118)
Added `earlyCoRiseScore` and `earlyBreakoutScore` to the union type.

### 3. Strategy Explanation Card (lines 930-964)
- Changed text from "6大早盘特有维度" to "8大早盘特有维度"
- Changed grid from `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` to `grid-cols-2 sm:grid-cols-4 lg:grid-cols-8`
- Updated percentage weights for existing 6 dimensions (25→20, 25→20, 15→12, 15→12, 10→8, 10→8)
- Added 量价齐升 (12%) card with teal-600/teal-400 colors
- Added 突破新高 (8%) card with cyan-600/cyan-400 colors

### 4. Active Filter Tags (lines 686-688)
Changed "开盘1小时" badge text to "严格09:30-10:30" to emphasize the strict time window.

## Verification
- `bun run lint` passes with no errors
- All existing functionality preserved
