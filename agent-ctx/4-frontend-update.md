# Task 4: Update stock-screener frontend component for enhanced screening features

## Agent: Frontend Update Agent

## Summary
Updated `/home/z/my-project/src/components/stock-screener.tsx` to display 7 new fields from the enhanced screener API.

## Changes Made

### 1. ScreenerStock Interface
Added 7 new fields: compositeScore, compositeDetail, resonanceTags, vwapPosition, vwapPositionDetail, capitalTrend, capitalTrendDetail

### 2. SortField Type
Added "compositeScore" as first option in the union type

### 3. Helper Functions
Added 6 new functions:
- getCompositeScoreColor() - color mapping for composite score
- getCompositeScoreBg() - background/border color for composite score
- getCompositeLabel() - label mapping (极佳/优秀/良好/一般/偏弱/弱势)
- getVwapPositionLabel() - VWAP position label + color
- getCapitalTrendLabel() - capital trend label + color + icon

### 4. Table Updates
- Added "综合评分" column header with sort after "名称" before "可靠度"
- Added composite score cell with Badge + label + tooltip
- Updated "信号详情" column with resonance tags, VWAP position, capital trend

### 5. Default Sort
Changed from "changePercent" to "compositeScore"

### 6. Filter Updates
- Added minCompositeScore to ScreenerFilters interface and DEFAULT_FILTERS
- Added composite score filter section with Slider + Input + quick buttons
- Changed Row 3 grid from lg:grid-cols-4 to lg:grid-cols-5
- Added client-side compositeScore filtering in displayStocks

### 7. Criteria Tags
Added rose-colored Badge for minCompositeScore filter when > 0

### 8. Strategy Panel
Added "综合" row in 评分体系 section describing 6维综合评分模型

### 9. Quick Presets
Updated all 6 presets with enableProgressiveVol, progressiveVolThreshold, minCompositeScore fields

## Verification
- `bun run lint` passes with no errors
- Dev server running without compilation errors
