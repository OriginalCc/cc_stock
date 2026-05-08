# Worklog: Extract StrategyAdminPanel Component

## Task
Extract the `StrategyAdminPanel` component from `/home/z/my-project/src/app/page.tsx` into a separate file `/home/z/my-project/src/components/strategy-admin-panel.tsx`.

## What was done

### 1. Analysis of dependencies
- Read lines 2780-6033 of `page.tsx` to understand the full scope of code to extract
- Identified all dependencies:
  - `StrategyData` interface (lines 2782-2824)
  - `CustomFactorCondition` interface (lines 2828-2833)
  - `CustomFactorDefinition` interface (lines 2835-2846)
  - `CONDITION_LIBRARY` constant (lines 2849-2939)
  - `BUILT_IN_CUSTOM_FACTORS` constant (lines 2942-3007)
  - `CUSTOM_FACTORS_STORAGE_KEY` constant (line 3009)
  - `CustomFactorsTab` component (lines 3011-3640)
  - Helper functions: `getCategoryColor`, `getSignalBadge`, `getLogicCategoryIcon`, `getLogicCategoryColor` (lines 3780-3831)
  - `StrategyAdminPanel` component (lines 3641-6033)

### 2. Checked import usage in remaining page.tsx
- `UITooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent` — only used in StrategyAdminPanel → removed from page.tsx
- `Textarea` — only used in CustomFactorsTab → removed from page.tsx
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` — only used in StrategyAdminPanel → removed from page.tsx
- Lucide icons only used in extracted code: `Settings`, `ChevronDown`, `ChevronUp`, `Database`, `EyeOff`, `Save`, `Pencil`, `Trash2`, `Plus`, `Eye`, `Cpu` → removed from page.tsx
- Lucide icons used in both extracted and remaining code: `GitBranch`, `Shield`, `RefreshCw`, `Star`, `Clock`, `Zap`, `X`, `Activity`, `Newspaper`, `ArrowUpRight`, `ArrowDownRight` → kept in page.tsx

### 3. Created new component file
- Created `/home/z/my-project/src/components/strategy-admin-panel.tsx` with:
  - `"use client";` directive
  - All necessary React hooks imports
  - All UI component imports (Card, Badge, Button, Input, Tabs, Select, Tooltip, Textarea)
  - All lucide icon imports used by the extracted components
  - The complete extracted code (interfaces, constants, CustomFactorsTab, helper functions, StrategyAdminPanel)
  - Exported `StrategyAdminPanel` with `export function`

### 4. Updated page.tsx
- Added import: `import { StrategyAdminPanel } from "@/components/strategy-admin-panel";`
- Removed the extracted code block (lines 2780-6033 → replaced with a comment)
- Removed unused imports (Tooltip, Textarea, Select, and lucide icons only used in extracted code)

### 5. Verification
- Ran `bun run lint` — passes with no errors
- Dev server shows no compilation errors

## Files modified
- `/home/z/my-project/src/app/page.tsx` — removed ~3200 lines of extracted code and cleaned up imports
- `/home/z/my-project/src/components/strategy-admin-panel.tsx` — created with ~3290 lines

---

# Worklog: Extract TimeSharingPanel Component

## Task
Extract the `TimeSharingPanel` component and related chart rendering functions from `/home/z/my-project/src/app/page.tsx` into a separate file `/home/z/my-project/src/components/time-sharing-panel.tsx`.

## What was done

### 1. Analysis of dependencies
Read the full page.tsx (5723 lines) to understand the scope of code to extract. Identified the following components/functions for extraction:

**Tooltip components (only used by TimeSharingPanel):**
- `TimelineTooltip` (lines 310-349)
- `TimelineVolumeTooltip` (lines 351-368)
- `TimelineMACDTooltip` (lines 370-390)

**Helper functions (only used by extracted components):**
- `getStrengthLabel` (lines 520-526)
- `getStrengthColor` (lines 528-534)

**Types (only used by extracted components):**
- `MergedSignal` interface (lines 539-551)

**Chart renderers (only used by TimeSharingPanel):**
- `PulseVolumeRenderer` (lines 811-915)
- `TimelineSignalRenderer` (lines 917-1408)

**Tick components (only used by extracted panels):**
- `PercentYTick` (lines 1412-1425)
- `MiniPercentYTick` (lines 1428-1440)

**Helper (only used by MiniTimelinePanel):**
- `computeMiniMACD` (lines 1444-1463)

**Panel components:**
- `MiniTimelinePanel` (lines 1465-1723) — used by main component, needs export
- `TimeSharingPanel` (lines 1727-2766) — main export target

### 2. Discovered chart-shared.ts
Found that `/home/z/my-project/src/lib/chart-shared.ts` already contains many of the types, constants, and helper functions that were duplicated in page.tsx:
- `TSignal`, `MergedSignal`, `PulseVolumeMarker` interfaces
- `REGIME_CONFIG`, `T_MODE_CONFIG` constants
- `formatVolume`, `computeMiniMACD`, `generateTimelineSignals` functions
- `getStrengthLabel`, `getStrengthColor` functions
- `pvParseTime`, `detectPulseVolumeMarkers` functions

The new `time-sharing-panel.tsx` imports from `@/lib/chart-shared` instead of redefining these.

### 3. Items NOT extracted (still used by main component)
- `TSignal` interface — used by `generateTimelineSignals` in main component
- `generateTimelineSignals` function — called at line 3757 in main component
- `PulseVolumeMarker` interface — used by `detectPulseVolumeMarkers` return type
- `pvParseTime` — used inside `detectPulseVolumeMarkers`
- `detectPulseVolumeMarkers` — called at line 3765 in main component
- `REGIME_CONFIG`, `T_MODE_CONFIG` — used in main component's regime badges
- `SIGNAL_PULSE_CSS` — used in main component's style injection
- `playAlertSound`, `getAudioContext` — called at line 3840 in main component
- `getTIndexColor`, `getTIndexLabel`, `getTIndexLabelColor` — used in T-Index gauge

### 4. Created new component file
- Created `/home/z/my-project/src/components/time-sharing-panel.tsx` (2072 lines) with:
  - `"use client";` directive
  - Imports from `@/lib/chart-shared` for types, constants, and helpers
  - Imports from `@/lib/t-strategy` for `detectMarketRegimeDetail`, `getTimeWindow`, `Strength`, `RegimeDetail`
  - Imports from recharts, lucide-react, UI components
  - All tooltip components (TimelineTooltip, TimelineVolumeTooltip, TimelineMACDTooltip)
  - PulseVolumeRenderer, TimelineSignalRenderer
  - PercentYTick, MiniPercentYTick
  - MiniTimelinePanel (exported)
  - TimeSharingPanel (exported)

### 5. Updated page.tsx
- Added import: `import { TimeSharingPanel, MiniTimelinePanel } from "@/components/time-sharing-panel";`
- Removed all extracted rendering components and functions
- Removed orphaned memoized tooltip references (`timelineTooltipEl`, `volumeTooltipEl`, `macdTooltipEl`)
- Cleaned up stray closing braces and comments from removal
- File reduced from ~5723 to ~3643 lines

### 6. Verification
- Ran `bun run lint` — passes with no errors
- Dev server shows no compilation errors

## Files modified
- `/home/z/my-project/src/app/page.tsx` — reduced from ~5723 to ~3643 lines
- `/home/z/my-project/src/components/time-sharing-panel.tsx` — created with 2072 lines
