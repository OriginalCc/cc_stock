# Task 1: Intraday Screener Optimization

## Agent: Intraday Screener Optimizer

## Summary
Optimized the intraday-screener API to STRICTLY use the 09:30-10:30 time window for analysis and added two new screening factors.

## Changes Made
- File: `/home/z/my-project/src/app/api/stock/intraday-screener/route.ts`
- Added `filterEarlyTimeline()` helper for 09:30-10:30 time filtering
- Added `analyzeVolumePriceCoRise()` function (量价齐升 detection)
- Added `analyzeNewHighBreakout()` function (突破新高 detection)
- Added `timeWindow` and `timeWindowDetail` to `IntradayScreenerResult` interface
- Added `coRiseScore/coRiseDetail/breakoutScore/breakoutDetail` to `IntradayStock` interface
- Updated `calculateCompositeScore()` weights: added coRise(0.15) and breakout(0.10)
- Integrated new analysis calls in batch processing with early data tracking
- All response paths include time window info

## Verification
- `bun run lint` passes with no errors
- Dev server running without compilation errors
