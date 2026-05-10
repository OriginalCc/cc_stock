# Task 1: Enhance Screener API

## Agent: Screener Enhancement Agent

## Summary
Enhanced the stock screener API (`/api/stock/screener/route.ts`) with 4 new detection functions and 6 new output fields for improved stock selection capabilities.

## Changes Made

### 1. ScreenerStock Interface (6 new fields)
- `compositeScore: number` - Weighted combination 0-100
- `compositeDetail: string` - Score breakdown
- `resonanceTags: string` - Comma-separated resonance tags
- `vwapPosition: string` - Price vs VWAP relationship
- `vwapPositionDetail: string` - VWAP description
- `capitalTrend: string` - Capital flow classification
- `capitalTrendDetail: string` - Capital trend description

### 2. New Functions
- `detectVWAPPosition()` - Calculates VWAP from timeline, detects cross events, classifies position
- `analyzeCapitalTrend()` - Classifies mainNetInflow/amount ratio into 5 tiers
- `calculateCompositeScore()` - Weighted combination: pulse 20%, volumeSurge 20%, progressiveVol 15%, evaluation 15%, capital 15%, VWAP 15%
- `detectResonance()` - 5 resonance rules: 脉冲放量, 递增放量, 三因子, 资金量能, 均线

### 3. Handler Integration
- All 3 code paths (pulse detection, MA-only, no-detection) compute new fields
- Timeline path uses VWAP from data; other paths default to "no_data"
- Default sort changed: compositeScore desc → reliabilityScore desc → changePercent desc

## Verification
- `bun run lint` passes with no errors
- Dev server running without compilation errors
- All existing functionality preserved
