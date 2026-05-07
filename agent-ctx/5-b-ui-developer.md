# Task 5-b: Add T-Index, Smart Action Panel, and Signal Alert System

## Agent: ui-developer

## Work Summary

Added three major UI features to `src/app/page.tsx` only (no other files modified):

### 1. 做T指数 (T-Index) - Composite Signal Confidence Score
- **Computation** (useMemo): base=50, buy signals add (+15/+8/+3), sell signals subtract (-15/-8/-3), stoploss -20, market regime adjustments
- **UI**: Circular SVG gauge (72x72), large score number, color-coded label (卖出区域/观望/可以做T/优质做T机会), progress bar
- **Position**: New card between stock info and chart mode selector, left column

### 2. Smart Action Recommendation Panel (智能操作建议)
- **Computation** (useMemo): Analyzes latest signals, time window, T-index to generate recommendation
- **Recommendations**: ⚡紧急止损 / 🔴建议正T卖出 / 🟢建议正T买回 / 📊等待确认 / ⏳观望等待
- **UI**: Icon + large recommendation text, supporting reason, time window badge, confidence progress bar
- **Position**: New card between stock info and chart mode selector, right column

### 3. Signal Alert System
- **Sound Alert**: Web Audio API (buy=880Hz sine, sell=660Hz sine, stoploss=440Hz sawtooth), plays only for NEW strong signals
- **Sound Toggle**: Bell/BellOff button in chart mode selector row, persisted to localStorage
- **Visual Flash**: Red/green flash animation on stock info card border when strong signals fire
- **Pulsing Indicator**: Volume2 icon pulses next to T-Index when strong signal active
- **CSS Animations**: signalPulse, flashBorder, flashBorderGreen keyframes injected via style tag

### Key Decisions
- Only modified page.tsx as instructed
- Used setTimeout(0) for flash setState to avoid lint error (react-hooks/set-state-in-effect)
- Tracked alerted signals via Set ref to prevent duplicate alerts
- Responsive layout: grid-cols-1 on mobile, grid-cols-2 on desktop
