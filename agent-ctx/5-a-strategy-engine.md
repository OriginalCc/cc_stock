# Task 5-a: Strategy Engine Enhancement

## Task
Add KDJ factors and Fibonacci key levels to strategy engine

## Changes Made

### File: `/home/z/my-project/src/lib/t-strategy.ts`

1. **Import**: Added `import { calculateKDJ } from '@/lib/indicators'`

2. **StrategyConfig**: Added 7 KDJ parameters:
   - `kdjPeriod` (default: 9)
   - `kdjM1` (default: 3)
   - `kdjM2` (default: 3)
   - `kdjOversold` (default: 20)
   - `kdjOverbought` (default: 80)
   - `jExtremeLow` (default: 0)
   - `jExtremeHigh` (default: 100)

3. **generateTimelineSignals**: 
   - Added KDJ computation using rolling high/low estimation
   - Added factors 35-38 (KDJ金叉买入, KDJ死叉卖出, J线超卖反弹, J线超买回落)

4. **evaluateCondition**: 
   - Added `kdjValuesParam` optional parameter
   - Added 6 KDJ condition keys: kdj_golden, kdj_death, j_oversold, j_overbought, kdj_above_80, kdj_below_20

5. **computeKeyPriceLevels**: 
   - Added Fibonacci retracement levels (23.6%, 38.2%, 50%, 61.8%, 78.6%)

6. **STRATEGY_OVERVIEW**: Updated to v3.9 with factors 35-38

### File: `/home/z/my-project/src/lib/indicators.ts`
- No changes needed (calculateKDJ already existed)

## Lint Status
- t-strategy.ts: ✅ passes
- indicators.ts: ✅ passes
- Pre-existing page.tsx lint error is unrelated to this task
