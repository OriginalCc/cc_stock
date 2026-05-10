---
Task ID: 1
Agent: main
Task: Fix 5-day intraday chart (五日分时图) to auto-fit window height - upper part was empty

Work Log:
- Investigated current FiveDayTimelinePanel implementation - found fixed height={400} for ResponsiveContainer
- Rewrote component to use dynamic height based on window viewport
- Added containerRef + useEffect with resize listener to calculate available height
- Split chart into separate price chart (75% of available space) and volume chart (25%)
- Fixed firstDayRefClose calculation - now uses the day BEFORE the 5-day window as reference (from K-line data) instead of current quote.prevClose
- Added firstDayRefClose to convertTo5DayTimeline return type for proper Y-axis center line
- Added price area fill with red/green color based on price vs refClose
- Improved avg price line to use dashed stroke for clarity
- Fixed DayBoundaryLines to accept chartHeight prop for proper vertical line extent
- Verified API endpoint works correctly (returns 250 data points spanning multiple days)
- Lint passes cleanly

Stage Summary:
- FiveDayTimelinePanel now auto-fits window height instead of fixed 400px
- Price chart fills ~75% of available viewport space
- Volume chart is a separate chart below at ~25% height
- First day's prevClose is correctly computed from K-line data (day before 5-day window)
- Y-axis is symmetric around the reference close with proper percentage ticks
