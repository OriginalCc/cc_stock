"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Customized,
} from "recharts";
import { useStockData, type TimeInterval, type StockSearchResult, type KLineItem, type TimelineItem, type ChartMode } from "@/hooks/use-stock-data";
import { calculateMACD } from "@/lib/indicators";
import { generateTimelineSignals as generateOptimizedSignals, getTimeWindow, detectMarketRegime, detectMarketRegimeDetail, buildFactorOverridesFromDB, computeKeyPriceLevels, type TSignal as OptimizedTSignal, type TimeWindow, type MarketRegime, type FactorOverride, type RegimeDetail, type Strength, type CustomFactorDefinition as EngineCustomFactorDefinition, STRATEGY_OVERVIEW } from "@/lib/t-strategy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  X,
  Clock,
  Zap,
  LineChart,
  CandlestickChart,
  Settings,
  ChevronDown,
  ChevronUp,
  Database,
  GitBranch,
  Shield,
  RefreshCw,
  Cpu,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Save,
  Star,
  Pencil,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Bell,
  BellOff,
  Volume2,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────

const INTERVALS: { value: TimeInterval; label: string }[] = [
  { value: "5m", label: "5分" },
  { value: "15m", label: "15分" },
  { value: "30m", label: "30分" },
  { value: "1h", label: "60分" },
  { value: "1d", label: "日线" },
  { value: "1wk", label: "周线" },
];

const DEFAULT_ASHARES = [
  { symbol: "600519", name: "贵州茅台" },
  { symbol: "000858", name: "五粮液" },
  { symbol: "601318", name: "中国平安" },
  { symbol: "002594", name: "比亚迪" },
  { symbol: "300750", name: "宁德时代" },
  { symbol: "600036", name: "招商银行" },
  { symbol: "000333", name: "美的集团" },
  { symbol: "601899", name: "紫金矿业" },
];

// ── Market Index Configuration (深证/沪指/创业板) ──
type IndexKey = "sz" | "sh" | "cyb";
const INDEX_CONFIG: Record<IndexKey, { symbol: string; label: string; shortLabel: string }> = {
  sz:  { symbol: "399001",    label: "深证成指", shortLabel: "深" },
  sh:  { symbol: "000001.SS", label: "上证指数", shortLabel: "沪" },
  cyb: { symbol: "399006",    label: "创业板指", shortLabel: "创" },
};
const INDEX_KEYS: IndexKey[] = ["sz", "sh", "cyb"];

// ── Signal Alert Sound (Web Audio API) ─────────────────
const playAlertSound = (type: 'buy' | 'sell' | 'stoploss') => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    // Different tones: buy=high bright, sell=mid warning, stoploss=low urgent
    osc.frequency.value = type === 'buy' ? 880 : type === 'sell' ? 660 : 440;
    osc.type = type === 'stoploss' ? 'sawtooth' : 'sine';
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
};

// ── T-Index Color Helpers ──────────────────────────────
function getTIndexColor(score: number): string {
  if (score <= 30) return '#ef4444';     // red
  if (score <= 50) return '#f97316';     // orange
  if (score <= 70) return '#84cc16';     // yellow-green
  return '#22c55e';                       // green
}

function getTIndexLabel(score: number): string {
  if (score <= 30) return '卖出区域';
  if (score <= 50) return '观望';
  if (score <= 70) return '可以做T';
  return '优质做T机会';
}

function getTIndexLabelColor(score: number): string {
  if (score <= 30) return 'text-red-500';
  if (score <= 50) return 'text-orange-500';
  if (score <= 70) return 'text-lime-500';
  return 'text-green-500';
}

// ── Pulse animation keyframes (injected via style tag) ──
const SIGNAL_PULSE_CSS = `
@keyframes signalPulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes flashBorder {
  0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
  50% { box-shadow: 0 0 12px 4px rgba(239,68,68,0.3); }
  100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
}
@keyframes flashBorderGreen {
  0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
  50% { box-shadow: 0 0 12px 4px rgba(34,197,94,0.3); }
  100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
}
.animate-signal-pulse { animation: signalPulse 1.2s ease-in-out infinite; }
.animate-flash-red { animation: flashBorder 0.8s ease-out; }
.animate-flash-green { animation: flashBorderGreen 0.8s ease-out; }
`;

// ── Candlestick Renderer ──────────────────────────────

function CandlestickRenderer(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap } = props;
  if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis || !yAxis) return null;

  const yScale = yAxis.scale;
  let barData: any[] = [];
  for (const item of formattedGraphicalItems) {
    if (item?.props?.data && Array.isArray(item.props.data)) {
      barData = item.props.data;
      break;
    }
  }
  if (barData.length === 0) return null;

  const sampleEntry = barData[0];
  const barWidth = sampleEntry?.width || 4;

  // Adjust candle body width proportionally, ensure minimum visibility
  const candleBodyRatio = barWidth > 8 ? 0.6 : barWidth > 5 ? 0.7 : 0.8;

  return (
    <g>
      {barData.map((entry: any, i: number) => {
        const { x, payload } = entry;
        if (!payload || !payload.close) return null;
        const { open, close, high, low } = payload;
        if (!open || !high || !low) return null;

        const isUp = close >= open;
        const color = isUp ? "#ef4444" : "#22c55e";

        const yHigh = yScale(high);
        const yLow = yScale(low);
        const yOpen = yScale(open);
        const yClose = yScale(close);

        const bodyTop = Math.min(yOpen, yClose);
        const bodyBottom = Math.max(yOpen, yClose);
        const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
        const centerX = x + barWidth / 2;
        const bodyWidth = Math.max(barWidth * candleBodyRatio, 2);

        return (
          <g key={`candle-${i}`}>
            <line x1={centerX} y1={yHigh} x2={centerX} y2={bodyTop} stroke={color} strokeWidth={1} />
            <line x1={centerX} y1={bodyBottom} x2={centerX} y2={yLow} stroke={color} strokeWidth={1} />
            <rect x={centerX - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={isUp ? "transparent" : color} stroke={color} strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}

// ── Custom Tooltips ───────────────────────────────────

const KLineTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data) return null;

  const isUp = data.close >= data.open;
  const color = isUp ? "text-red-500" : "text-green-500";

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[180px]">
      <div className="font-medium mb-2 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">开盘</span>
        <span className={`text-right font-mono ${color}`}>{data.open.toFixed(2)}</span>
        <span className="text-muted-foreground">收盘</span>
        <span className={`text-right font-mono ${color}`}>{data.close.toFixed(2)}</span>
        <span className="text-muted-foreground">最高</span>
        <span className="text-right font-mono text-red-500">{data.high.toFixed(2)}</span>
        <span className="text-muted-foreground">最低</span>
        <span className="text-right font-mono text-green-500">{data.low.toFixed(2)}</span>
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
        {data.ma5 != null && (
          <>
            <span className="text-muted-foreground">MA5</span>
            <span className="text-right font-mono text-yellow-500">{data.ma5!.toFixed(2)}</span>
          </>
        )}
        {data.ma10 != null && (
          <>
            <span className="text-muted-foreground">MA10</span>
            <span className="text-right font-mono text-blue-500">{data.ma10!.toFixed(2)}</span>
          </>
        )}
        {data.ma20 != null && (
          <>
            <span className="text-muted-foreground">MA20</span>
            <span className="text-right font-mono text-purple-500">{data.ma20!.toFixed(2)}</span>
          </>
        )}
      </div>
      {data.dif != null && (
        <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-y-1 gap-x-3">
          <span className="text-muted-foreground">DIF</span>
          <span className="text-right font-mono">{data.dif.toFixed(4)}</span>
          <span className="text-muted-foreground">DEA</span>
          <span className="text-right font-mono">{data.dea?.toFixed(4)}</span>
          <span className="text-muted-foreground">MACD</span>
          <span className={`text-right font-mono ${data.macd && data.macd > 0 ? "text-red-500" : "text-green-500"}`}>
            {data.macd?.toFixed(4)}
          </span>
        </div>
      )}
      {data.signal && data.signal.type !== "hold" && (
        <div className="mt-2 pt-2 border-t border-border">
          <Badge variant={data.signal.type === "buy" ? "default" : "destructive"} className="text-xs">
            {data.signal.type === "buy" ? "买入" : "卖出"} · {data.signal.reason}
          </Badge>
        </div>
      )}
    </div>
  );
};

const TimelineTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data || !data.hasData) return null;

  const isUp = data.changePercent >= 0;
  const signal = data.tSignal as TSignal | undefined;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <div className="font-medium mb-2 text-foreground">{data.time}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">价格</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price?.toFixed(2) ?? "--"}</span>
        <span className="text-muted-foreground">均价</span>
        <span className="text-right font-mono text-yellow-500">{data.avgPrice?.toFixed(2) ?? "--"}</span>
        <span className="text-muted-foreground">涨跌</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.changePercent?.toFixed(2) ?? "--"}%</span>
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
      </div>
      {signal && (
        <div className="mt-2 pt-2 border-t border-border">
          <Badge variant={signal.type === "buy" ? "default" : signal.type === "stoploss" ? "outline" : "destructive"} className="text-xs">
            {signal.type === "buy" ? "买入" : signal.type === "stoploss" ? "止损" : "卖出"} · {signal.reason}
            {signal.strength === "strong" ? " (强)" : signal.strength === "medium" ? " (中)" : " (弱)"}
          </Badge>
          {signal.tMode && (
            <div className="text-[10px] text-muted-foreground mt-1">
              模式: {signal.tMode} {signal.timeWindow && `· ${signal.timeWindow}`}
            </div>
          )}
          {signal.description && (
            <div className="text-[10px] text-muted-foreground">{signal.description}</div>
          )}
        </div>
      )}
    </div>
  );
};

const TimelineVolumeTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as TimelineItem & { volColor?: string; hasData?: boolean };
  if (!data || !data.hasData) return null;
  const isUp = data.changePercent >= 0;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[140px]">
      <div className="font-medium mb-1 text-foreground">{data.time}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
        <span className="text-muted-foreground">价格</span>
        <span className={`text-right font-mono ${isUp ? "text-red-500" : "text-green-500"}`}>{data.price.toFixed(2)}</span>
      </div>
    </div>
  );
};

const TimelineMACDTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data || !data.hasData) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <div className="font-medium mb-2 text-foreground">{data.time || data.date || ""}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">DIF</span>
        <span className="text-right font-mono">{data.dif != null ? data.dif.toFixed(4) : "--"}</span>
        <span className="text-muted-foreground">DEA</span>
        <span className="text-right font-mono">{data.dea != null ? data.dea.toFixed(4) : "--"}</span>
        <span className="text-muted-foreground">MACD</span>
        <span className={`text-right font-mono ${data.macd != null && data.macd > 0 ? "text-red-500" : "text-green-500"}`}>
          {data.macd != null ? data.macd.toFixed(4) : "--"}
        </span>
      </div>
    </div>
  );
};

const MACDTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data || data.dif == null) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <div className="font-medium mb-2 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">DIF</span>
        <span className="text-right font-mono">{data.dif.toFixed(4)}</span>
        <span className="text-muted-foreground">DEA</span>
        <span className="text-right font-mono">{data.dea?.toFixed(4)}</span>
        <span className="text-muted-foreground">MACD</span>
        <span className={`text-right font-mono ${data.macd && data.macd > 0 ? "text-red-500" : "text-green-500"}`}>
          {data.macd?.toFixed(4)}
        </span>
      </div>
    </div>
  );
};

const VolumeTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[140px]">
      <div className="font-medium mb-1 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
      </div>
    </div>
  );
};

// ── Helper ────────────────────────────────────────────

function formatNum(num: number, digits: number = 2) {
  if (!num && num !== 0) return "--";
  // Use toFixed + regex for deterministic output (avoids hydration mismatch)
  const fixed = num.toFixed(digits);
  if (digits === 0) return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const [intPart, decPart] = fixed.split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intFormatted}.${decPart}`;
}

function formatVolume(vol: number) {
  if (!vol) return "--";
  if (vol >= 1e8) return (vol / 1e8).toFixed(2) + "亿";
  if (vol >= 1e4) return (vol / 1e4).toFixed(2) + "万";
  // Use fixed formatting to avoid hydration mismatch from toLocaleString
  return vol.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatMarketCap(val: number) {
  if (!val) return "--";
  if (val >= 1e12) return (val / 1e12).toFixed(2) + "万亿";
  if (val >= 1e8) return (val / 1e8).toFixed(2) + "亿";
  if (val >= 1e4) return (val / 1e4).toFixed(2) + "万";
  // Use fixed formatting to avoid hydration mismatch from toLocaleString
  return val.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ── 做 T Signal Generation for Timeline ──────────────

interface TSignal {
  type: "buy" | "sell" | "stoploss";
  reason: string;
  strength: "strong" | "medium" | "weak";
  tMode?: string;        // "正T" | "反T"
  timeWindow?: string;   // TimeWindow type
  description?: string;  // Detailed description
}

/**
 * Generate T-trading signals for timeline data.
 * v3.6: Added index regime weighting for signal enhancement.
 */
function generateTimelineSignals(
  timeline: TimelineItem[],
  macdData: { time: string; dif: number | null; dea: number | null; macd: number | null }[],
  prevClose: number,
  factorOverrides?: FactorOverride[],
  indexRegime?: RegimeDetail | null,
  customFactors?: CustomFactorDefinition[],
): (TSignal | null)[] {
  // Convert UI CustomFactorDefinition to engine format
  const engineCustomFactors: EngineCustomFactorDefinition[] | undefined = customFactors?.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    signalType: f.signalType,
    tMode: f.tMode,
    strength: f.strength,
    conditions: f.conditions.map(c => ({
      key: c.key,
      label: c.label,
      description: c.description,
      category: c.category,
    })),
    enabled: f.enabled,
    isBuiltIn: f.isBuiltIn,
    dataSource: f.dataSource as "分时线",
  }));

  // Call the optimized strategy engine with factor overrides + index regime + custom factors
  const optimizedSignals = generateOptimizedSignals(timeline, macdData, prevClose, undefined, factorOverrides, indexRegime, engineCustomFactors);

  // Convert to local TSignal format (compatible with chart rendering)
  return optimizedSignals.map(s => {
    if (!s) return null;
    return {
      type: s.type,
      reason: s.reason,
      strength: s.strength,
      tMode: s.tMode,
      timeWindow: s.timeWindow,
      description: s.description,
    };
  });
}

// ── Strength label helper ──────────────────────────────

function getStrengthLabel(strength: "strong" | "medium" | "weak"): string {
  switch (strength) {
    case "strong": return "强";
    case "medium": return "中";
    case "weak": return "弱";
  }
}

function getStrengthColor(strength: "strong" | "medium" | "weak"): string {
  switch (strength) {
    case "strong": return "#dc2626"; // red-600
    case "medium": return "#f59e0b"; // amber-500
    case "weak": return "#9ca3af"; // gray-400
  }
}

// ── Timeline Signal Renderer (custom SVG on chart) ────
// v6: Strong=label+triangle, Medium=amber dot+badge, Weak=gray dot only

interface MergedSignal {
  id: string;                  // unique id for expand tracking
  x: number;
  y: number;
  type: "buy" | "sell" | "stoploss";
  reasons: string[];           // unique factor names
  strength: Strength;          // strongest among merged
  count: number;               // how many merged
  originalIndex: number;       // first original index
  direction: "up" | "down";   // buy=up, sell/stoploss=down
  isCustom?: boolean;          // true if any signal is from a user custom factor
  customReasons?: Set<string>; // set of reason names that come from custom factors
}

function TimelineSignalRenderer(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap } = props;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis || !yAxis) return null;

  // Get data points from the price line
  let priceLineData: any[] = [];
  for (const item of formattedGraphicalItems) {
    if (item?.props?.points && Array.isArray(item.props.points)) {
      const stroke = item.props.stroke || item?.props?.lineProps?.stroke;
      // Skip avgPrice (yellow dashed) line
      if (stroke === "#eab308") continue;
      if (priceLineData.length === 0) {
        priceLineData = item.props.points;
      }
    }
  }
  if (priceLineData.length === 0) return null;

  // ── Step 1: Collect all signal points ──
  const allSignals: { x: number; y: number; signal: TSignal; index: number }[] = [];
  priceLineData.forEach((point: any, i: number) => {
    const signal = point?.payload?.tSignal as TSignal | undefined | null;
    if (!signal) return;
    allSignals.push({ x: point.x, y: point.y, signal, index: i });
  });

  if (allSignals.length === 0) return null;

  // ── Step 2: Smart merge - same direction (buy/sell), wider distance ──
  const MERGE_DISTANCE_X = 30;
  const strengthOrder: Record<string, number> = { strong: 3, medium: 2, weak: 1 };
  const merged: MergedSignal[] = [];
  const used = new Set<number>();

  for (let i = 0; i < allSignals.length; i++) {
    if (used.has(i)) continue;
    const s = allSignals[i];
    const direction: "up" | "down" = s.signal.type === "buy" ? "up" : "down";
    const group: typeof allSignals = [s];
    used.add(i);

    for (let j = i + 1; j < allSignals.length; j++) {
      if (used.has(j)) continue;
      const next = allSignals[j];
      const nextDir: "up" | "down" = next.signal.type === "buy" ? "up" : "down";
      if (nextDir === direction && (next.x - s.x) <= MERGE_DISTANCE_X) {
        group.push(next);
        used.add(j);
      } else if ((next.x - s.x) > MERGE_DISTANCE_X) {
        break;
      }
    }

    let bestStrength: Strength = "weak";
    let bestIdx = 0;
    let hasCustomFactor = false;
    const uniqueReasons = new Set<string>();
    const customReasonSet = new Set<string>();
    for (let k = 0; k < group.length; k++) {
      const g = group[k];
      uniqueReasons.add(g.signal.reason);
      if (strengthOrder[g.signal.strength] > strengthOrder[bestStrength]) {
        bestStrength = g.signal.strength;
        bestIdx = k;
      }
      if (g.signal.description?.startsWith("自定义因子[")) {
        hasCustomFactor = true;
        customReasonSet.add(g.signal.reason);
      }
    }

    const representative = group[bestIdx];

    merged.push({
      id: `sig-${s.index}-${direction}`,
      x: representative.x,
      y: representative.y,
      type: s.signal.type,
      reasons: Array.from(uniqueReasons),
      strength: bestStrength,
      count: group.length,
      originalIndex: s.index,
      direction,
      isCustom: hasCustomFactor,
      customReasons: customReasonSet,
    });
  }

  // ── Step 3: Only strong signals get text labels ──
  const labelRects: { x: number; y: number; width: number; height: number }[] = [];

  // Helper: detect if a signal comes from a user-created custom factor
  const isCustomFactor = (sig: TSignal): boolean => {
    if (!sig.description) return false;
    return sig.description.startsWith("自定义因子[");
  };

  function overlapsAny(rect: { x: number; y: number; width: number; height: number }, rects: typeof labelRects): boolean {
    for (const r of rects) {
      if (rect.x < r.x + r.width && rect.x + rect.width > r.x &&
          rect.y < r.y + r.height && rect.y + rect.height > r.y) {
        return true;
      }
    }
    return false;
  }

  interface LabelPlan {
    merged: MergedSignal;
    labelRect: { x: number; y: number; width: number; height: number } | null;
    labelText: string;
    showLabel: boolean;
  }

  const labelPlans: LabelPlan[] = [];
  const assignedLabels = new Map<number, LabelPlan>();

  // Process strong signals first (priority for label placement)
  const strongIndices = merged
    .map((_, i) => i)
    .filter((i) => merged[i].strength === "strong")
    .sort((a, b) => merged[a].x - merged[b].x);

  for (const idx of strongIndices) {
    const m = merged[idx];
    const isBuy = m.direction === "up";

    // Build compact label text
    let labelText: string;
    const fmtCustom = (text: string) => m.customReasons?.has(text) ? `自定义[${text}]` : text;
    if (m.count >= 3) {
      labelText = fmtCustom(`${m.reasons[0]} ×${m.count}`);
    } else if (m.count === 2) {
      const combined = m.reasons.slice(0, 2).join("/");
      labelText = fmtCustom(combined.length > 6 ? `${m.reasons[0]}+1` : combined);
    } else {
      labelText = fmtCustom(m.reasons[0]);
    }

    // Estimate text width
    const labelFontSize = 8;
    let textWidth = 0;
    for (const ch of labelText) {
      textWidth += ch.charCodeAt(0) > 127 ? labelFontSize : labelFontSize * 0.55;
    }
    const padX = 4;
    const labelW = textWidth + padX * 2;
    const labelH = 14;

    const markerOffset = 14;
    const labelGap = 4;
    let labelY: number;
    if (isBuy) {
      labelY = m.y + markerOffset + labelGap;
    } else {
      labelY = m.y - markerOffset - labelGap - labelH;
    }

    let labelRect = { x: m.x - labelW / 2, y: labelY, width: labelW, height: labelH };

    let placed = false;
    if (!overlapsAny(labelRect, labelRects)) {
      placed = true;
    } else {
      const shifted = { ...labelRect, x: labelRect.x + labelRect.width * 0.6 };
      if (!overlapsAny(shifted, labelRects)) {
        labelRect = shifted;
        placed = true;
      } else {
        const shiftedL = { ...labelRect, x: labelRect.x - labelRect.width * 0.6 };
        if (!overlapsAny(shiftedL, labelRects)) {
          labelRect = shiftedL;
          placed = true;
        }
      }
    }

    // Try shorter label if still not placed
    if (!placed) {
      const sfmt = (text: string) => m.customReasons?.has(text) ? `自定义[${text}]` : text;
      const shortText = m.count > 1 ? sfmt(`${m.reasons[0]}×${m.count}`) : sfmt(m.reasons[0].slice(0, 4));
      let sw = 0;
      for (const ch of shortText) sw += ch.charCodeAt(0) > 127 ? labelFontSize : labelFontSize * 0.55;
      const shortW = sw + padX * 2;
      const shortRect = { x: m.x - shortW / 2, y: labelY, width: shortW, height: labelH };
      if (!overlapsAny(shortRect, labelRects)) {
        labelRect = shortRect;
        labelText = shortText;
        placed = true;
      }
    }

    if (placed) {
      labelRects.push(labelRect);
    }

    assignedLabels.set(idx, { merged: m, labelRect: placed ? labelRect : null, labelText, showLabel: placed });
  }

  // Medium and weak signals: dot only, no labels
  for (let i = 0; i < merged.length; i++) {
    if (assignedLabels.has(i)) continue;
    assignedLabels.set(i, { merged: merged[i], labelRect: null, labelText: "", showLabel: false });
  }

  // Build final label plans in original order
  for (let i = 0; i < merged.length; i++) {
    labelPlans.push(assignedLabels.get(i)!);
  }

  // ── Step 4: Render ──
  // Color schemes by strength:
  //   strong: direction color (red=buy, green=sell, amber=stoploss) — triangle + label
  //   medium: amber/orange tones — dot + count badge
  //   weak: gray — dot only

  // Helper: toggle expand state for a badge
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Helper: render expandable count badge (shared by strong & medium)
  // Returns { badgeSvg, bubbleSvg } — badgeSvg is the circle, bubbleSvg is the expanded popup (rendered on top layer)
  const renderCountBadge = (m: MergedSignal, badgeCx: number, badgeCy: number, badgeColor: string, badgeTextColor: string): { badgeSvg: React.ReactNode; bubbleSvg: React.ReactNode } => {
    if (m.count <= 1) return { badgeSvg: null, bubbleSvg: null };
    const isExpanded = expandedIds.has(m.id);
    const badgeR = 6;

    // Collapsed badge
    const badgeSvg = (
      <g style={{ cursor: "pointer" }} onClick={() => toggleExpand(m.id)}>
        <circle cx={badgeCx} cy={badgeCy} r={badgeR} fill={badgeColor} stroke="white" strokeWidth={0.6} />
        <text x={badgeCx} y={badgeCy} textAnchor="middle" dominantBaseline="middle" fill={badgeTextColor} fontSize={7} fontWeight="bold">
          {m.count}
        </text>
      </g>
    );

    // Expanded bubble — rendered separately on top layer
    if (!isExpanded) return { badgeSvg, bubbleSvg: null };

    const lineHeight = 12;
    const fontSize = 8;
    const padX = 5;
    const padY = 4;
    const lines = m.reasons.map(r => m.customReasons?.has(r) ? `自定义[${r}]` : r);
    const maxTextWidth = Math.max(...lines.map(line => {
      let w = 0;
      for (const ch of line) w += ch.charCodeAt(0) > 127 ? fontSize : fontSize * 0.55;
      return w;
    }));
    const bubbleW = maxTextWidth + padX * 2 + 6; // +6 for bullet
    const bubbleH = lines.length * lineHeight + padY * 2;
    const bubbleX = badgeCx + badgeR + 4;
    const bubbleY = badgeCy - bubbleH / 2;

    const bubbleSvg = (
      <g key={`bubble-${m.id}`} style={{ cursor: "pointer" }} onClick={() => toggleExpand(m.id)}>
        {/* Connector line */}
        <line x1={badgeCx + badgeR} y1={badgeCy} x2={bubbleX} y2={badgeCy} stroke={badgeColor} strokeWidth={0.5} strokeDasharray="2 1" opacity={0.5} />
        {/* Bubble background */}
        <rect x={bubbleX} y={bubbleY} width={bubbleW} height={bubbleH} rx={4} fill="white" fillOpacity={0.97} stroke={badgeColor} strokeWidth={0.8} />
        {/* Reason lines */}
        {lines.map((reason, ri) => (
          <text
            key={ri}
            x={bubbleX + padX + 4}
            y={bubbleY + padY + ri * lineHeight + lineHeight / 2}
            dominantBaseline="middle"
            fill="#1f2937"
            fontSize={fontSize}
            fontWeight={ri === 0 ? "600" : "400"}
          >
            <tspan fill={badgeColor} fontSize={6}>● </tspan>
            {reason}
          </text>
        ))}
      </g>
    );

    return { badgeSvg, bubbleSvg };
  };

  // ── Step 4: Render ──
  // Split into two layers: signal markers (bottom) and expanded bubbles (top)
  // This ensures expanded bubbles are never obscured by subsequent signal elements
  const bubbleElements: React.ReactNode[] = [];

  const signalElements = labelPlans.map((plan, i) => {
    const m = plan.merged;
    const isBuy = m.direction === "up";
    const isStoploss = m.type === "stoploss";

    // ── Strength-based color scheme ──
    // Custom factors use purple/violet theme to distinguish from built-in signals
    let markerColor: string;
    let labelBgColor: string;
    let badgeColor: string;
    let badgeTextColor: string;

    if (m.isCustom) {
      // Custom factor: purple/violet theme regardless of strength
      if (m.strength === "strong") {
        markerColor = isBuy ? "#8b5cf6" : "#a78bfa";     // violet-500 / violet-400
        labelBgColor = isBuy ? "#5b21b6" : "#6d28d9";    // violet-800 / violet-700
        badgeColor = markerColor;
        badgeTextColor = "white";
      } else if (m.strength === "medium") {
        markerColor = "#c084fc";                          // violet-400
        badgeColor = markerColor;
        badgeTextColor = "white";
      } else {
        markerColor = "#a78bfa";                          // violet-400 lighter
        badgeColor = "#a78bfa";
        badgeTextColor = "white";
      }
    } else if (m.strength === "strong") {
      markerColor = isStoploss ? "#f59e0b" : isBuy ? "#ef4444" : "#22c55e";
      labelBgColor = isStoploss ? "#92400e" : isBuy ? "#991b1b" : "#166534";
      badgeColor = markerColor;
      badgeTextColor = "white";
    } else if (m.strength === "medium") {
      markerColor = isStoploss ? "#d97706" : isBuy ? "#f97316" : "#06b6d4";
      badgeColor = markerColor;
      badgeTextColor = "white";
    } else {
      markerColor = "#9ca3af";
      badgeColor = "#9ca3af";
      badgeTextColor = "white";
    }

    // ── Render by strength level ──
    if (m.strength === "strong") {
      const markerSize = 6;
      const badgeCx = m.x + markerSize + 4;
      const badgeCy = isBuy ? m.y - markerSize * 0.3 : m.y + markerSize * 0.3;
      const { badgeSvg, bubbleSvg } = renderCountBadge(m, badgeCx, badgeCy, badgeColor, badgeTextColor);
      if (bubbleSvg) bubbleElements.push(bubbleSvg);
      return (
        <g key={`tl-sig-${m.originalIndex}-${i}`}>
          {/* Triangle marker */}
          {isStoploss ? (
            <polygon
              points={`${m.x},${m.y - markerSize} ${m.x + markerSize},${m.y} ${m.x},${m.y + markerSize} ${m.x - markerSize},${m.y}`}
              fill={markerColor}
              stroke="white"
              strokeWidth={0.8}
            />
          ) : isBuy ? (
            <polygon
              points={`${m.x},${m.y - markerSize} ${m.x - markerSize * 0.9},${m.y + markerSize * 0.6} ${m.x + markerSize * 0.9},${m.y + markerSize * 0.6}`}
              fill={markerColor}
              stroke="white"
              strokeWidth={0.8}
            />
          ) : (
            <polygon
              points={`${m.x},${m.y + markerSize} ${m.x - markerSize * 0.9},${m.y - markerSize * 0.6} ${m.x + markerSize * 0.9},${m.y - markerSize * 0.6}`}
              fill={markerColor}
              stroke="white"
              strokeWidth={0.8}
            />
          )}

          {/* Expandable count badge (collapsed only) */}
          {badgeSvg}

          {/* Text label */}
          {plan.showLabel && plan.labelRect && (
            <>
              <line
                x1={m.x}
                y1={isBuy ? m.y + markerSize : m.y - markerSize}
                x2={plan.labelRect.x + plan.labelRect.width / 2}
                y2={isBuy ? plan.labelRect.y : plan.labelRect.y + plan.labelRect.height}
                stroke={markerColor}
                strokeWidth={1}
                strokeDasharray="3 2"
                opacity={0.8}
              />
              <rect
                x={plan.labelRect.x - 1}
                y={plan.labelRect.y - 1}
                width={plan.labelRect.width + 2}
                height={plan.labelRect.height + 2}
                rx={4}
                fill="none"
                stroke="white"
                strokeWidth={1.5}
                strokeOpacity={0.3}
              />
              <rect
                x={plan.labelRect.x}
                y={plan.labelRect.y}
                width={plan.labelRect.width}
                height={plan.labelRect.height}
                rx={3}
                fill={labelBgColor}
                fillOpacity={0.92}
                stroke={m.isCustom ? "#c084fc" : markerColor}
                strokeWidth={m.isCustom ? 0.8 : 0.5}
                strokeDasharray={m.isCustom ? "2 1" : "none"}
                strokeOpacity={m.isCustom ? 1 : 0.4}
              />
              <text
                x={plan.labelRect.x + plan.labelRect.width / 2}
                y={plan.labelRect.y + plan.labelRect.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={8}
                fontWeight="600"
              >
                {plan.labelText}
              </text>
            </>
          )}
        </g>
      );
    } else if (m.strength === "medium") {
      const dotRadius = 6;
      const badgeCx = m.x + dotRadius + 4;
      const badgeCy = m.y - dotRadius + 1;
      const { badgeSvg, bubbleSvg } = renderCountBadge(m, badgeCx, badgeCy, badgeColor, badgeTextColor);
      if (bubbleSvg) bubbleElements.push(bubbleSvg);
      return (
        <g key={`tl-sig-${m.originalIndex}-${i}`}>
          <circle
            cx={m.x}
            cy={m.y}
            r={dotRadius}
            fill={markerColor}
            fillOpacity={0.85}
            stroke="white"
            strokeWidth={0.7}
          />
          {/* Direction indicator: tiny arrow inside dot */}
          {isBuy ? (
            <polygon
              points={`${m.x},${m.y - 2.5} ${m.x - 2},${m.y + 1} ${m.x + 2},${m.y + 1}`}
              fill="white"
              fillOpacity={0.9}
            />
          ) : (
            <polygon
              points={`${m.x},${m.y + 2.5} ${m.x - 2},${m.y - 1} ${m.x + 2},${m.y - 1}`}
              fill="white"
              fillOpacity={0.9}
            />
          )}
          {/* Expandable count badge (collapsed only) */}
          {badgeSvg}
        </g>
      );
    } else {
      // Weak: small gray dot, no badge, no label
      const dotRadius = 4;
      return (
        <g key={`tl-sig-${m.originalIndex}-${i}`}>
          <circle
            cx={m.x}
            cy={m.y}
            r={dotRadius}
            fill={markerColor}
            fillOpacity={0.65}
            stroke="white"
            strokeWidth={0.5}
          />
        </g>
      );
    }
  });

  return (
    <g>
      {/* Layer 1: All signal markers and labels */}
      {signalElements}
      {/* Layer 2: Expanded bubbles on top of everything */}
      {bubbleElements}
    </g>
  );
}

// ── Custom Percentage Y-Axis Tick (deep red/green color coding) ───

function PercentYTick(props: { x?: number; y?: number; payload?: { value?: number }; index?: number; visibleTicksCount?: number }) {
  const { x = 0, y = 0, payload } = props;
  const val = payload?.value ?? 0;
  const isPositive = val > 0.001;
  const isZero = Math.abs(val) <= 0.001;
  // Deep colors: red-600 for positive, green-600 for negative, muted for zero
  const fill = isZero ? "#6b7280" : isPositive ? "#dc2626" : "#16a34a";
  const text = isZero ? "0.00%" : val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
  return (
    <text x={x} y={y} textAnchor="end" dominantBaseline="middle" fill={fill} fontSize={10} fontWeight="600">
      {text}
    </text>
  );
}

// Mini panel uses a smaller version
function MiniPercentYTick(props: { x?: number; y?: number; payload?: { value?: number }; index?: number; visibleTicksCount?: number }) {
  const { x = 0, y = 0, payload } = props;
  const val = payload?.value ?? 0;
  const isPositive = val > 0.001;
  const isZero = Math.abs(val) <= 0.001;
  const fill = isZero ? "#6b7280" : isPositive ? "#dc2626" : "#16a34a";
  const text = isZero ? "0.00%" : val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
  return (
    <text x={x} y={y} textAnchor="end" dominantBaseline="middle" fill={fill} fontSize={8} fontWeight="600">
      {text}
    </text>
  );
}

// ── Compact Mini Timeline Panel (for index/sector overview) ───

function computeMiniMACD(items: TimelineItem[]): { time: string; dif: number | null; dea: number | null; macd: number | null }[] {
  if (items.length < 10) return items.map(d => ({ time: d.time, dif: null, dea: null, macd: null }));

  // 同花顺/通达信标准MACD (EMA first-value initialization)
  const prices = items.map(d => d.price);
  const macdResult = calculateMACD(prices);

  return items.map((d, i) => {
    const m = macdResult[i];
    if (isNaN(m.dif) || isNaN(m.dea) || isNaN(m.macd)) {
      return { time: d.time, dif: null, dea: null, macd: null };
    }
    return {
      time: d.time,
      dif: m.dif,
      dea: m.dea,
      macd: m.macd,
    };
  });
}

function MiniTimelinePanel({
  title,
  data,
  prevClose,
  badge,
}: {
  title: string;
  data: TimelineItem[];
  prevClose: number;
  badge?: React.ReactNode;
}) {
  // Build full-day template
  const { fullDayData, timeTicks } = useMemo(() => {
    if (data.length === 0) return { fullDayData: [], timeTicks: [] };

    const allTimes: string[] = [];
    for (let h = 9; h <= 11; h++) {
      const startM = h === 9 ? 30 : 0;
      const endM = h === 11 ? 30 : 59;
      for (let m = startM; m <= endM; m++) allTimes.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    for (let h = 13; h <= 15; h++) {
      const endM = h === 15 ? 0 : 59;
      for (let m = 0; m <= endM; m++) allTimes.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }

    const dataByTime = new Map<string, TimelineItem>();
    data.forEach(d => dataByTime.set(d.time, d));
    const lastActualIdx = data.length > 0 ? allTimes.indexOf(data[data.length - 1].time) : -1;

    const fullDay = allTimes.map((time, idx) => {
      const actual = dataByTime.get(time);
      const hasData = actual != null && idx <= lastActualIdx;
      if (hasData) {
        const safePrevClose = prevClose > 0 ? prevClose : data[0].price;
        const prevActual = (() => {
          for (let j = data.length - 1; j >= 0; j--) { if (data[j].time < time) return data[j]; }
          return null;
        })();
        return {
          idx, time,
          price: actual.price,
          avgPrice: actual.avgPrice,
          volume: actual.volume,
          changePercent: actual.changePercent,
          volUp: prevActual ? actual.price >= prevActual.price : actual.price >= safePrevClose,
          hasData: true,
        };
      }
      return {
        idx, time,
        price: undefined as number | undefined,
        avgPrice: undefined as number | undefined,
        volume: 0,
        changePercent: 0,
        volUp: true,
        hasData: false,
      };
    });

    const keyTimes = ["09:30", "10:30", "11:30", "13:00", "14:00", "15:00"];
    const ticks = keyTimes.map(t => allTimes.indexOf(t)).filter(i => i >= 0);

    return { fullDayData: fullDay, timeTicks: ticks };
  }, [data, prevClose]);

  // Compute MACD
  const macdData = useMemo(() => computeMiniMACD(data), [data]);
  const macdByTime = new Map(macdData.map(m => [m.time, m]));

  // Merge MACD into fullDayData
  const chartData = useMemo(() => fullDayData.map(d => ({
    ...d,
    dif: macdByTime.get(d.time)?.dif ?? undefined,
    dea: macdByTime.get(d.time)?.dea ?? undefined,
    macd: macdByTime.get(d.time)?.macd ?? undefined,
  })), [fullDayData, macdByTime]);

  if (data.length === 0) return null;

  const safePrevClose = prevClose > 0 ? prevClose : data[0].price;

  // Smart Y-axis (same as main chart)
  const allPrices = data.map(d => d.price);
  const allAvgPrices = data.filter(d => d.avgPrice != null).map(d => d.avgPrice!);
  const dataMin = Math.min(...allPrices, ...allAvgPrices);
  const dataMax = Math.max(...allPrices, ...allAvgPrices);
  const dataRange = dataMax - dataMin || safePrevClose * 0.001;
  const padding = Math.max(dataRange * 0.2, safePrevClose * 0.002);
  let yMin = dataMin - padding;
  let yMax = dataMax + padding;
  const prevCloseMargin = safePrevClose * 0.002;
  if (safePrevClose < yMin) yMin = safePrevClose - prevCloseMargin;
  else if (safePrevClose > yMax) yMax = safePrevClose + prevCloseMargin;

  const percentMin = ((yMin - safePrevClose) / safePrevClose) * 100;
  const percentMax = ((yMax - safePrevClose) / safePrevClose) * 100;

  const maxVolume = Math.max(...data.map(d => d.volume), 1);
  const barSize = chartData.length > 200 ? 1 : chartData.length > 100 ? 1.5 : 2;

  // MACD range
  const macdValues = macdData.flatMap(d => [d.dif, d.dea, d.macd]).filter((v): v is number => v != null);
  const macdMin = macdValues.length ? Math.min(...macdValues) : -1;
  const macdMax = macdValues.length ? Math.max(...macdValues) : 1;
  const macdPad = (macdMax - macdMin) * 0.1 || 0.1;

  // Last data info
  const lastItem = data[data.length - 1];
  const isUp = lastItem.changePercent >= 0;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2 text-xs">
        <span className="font-medium text-foreground">{title}</span>
        <span className={`font-bold tabular-nums text-xs ${isUp ? "text-red-500" : "text-green-500"}`}>
          {lastItem.price.toFixed(2)}
        </span>
        <span className={`tabular-nums text-[10px] ${isUp ? "text-red-500" : "text-green-500"}`}>
          {isUp ? "+" : ""}{lastItem.changePercent.toFixed(2)}%
        </span>
        {badge}
      </div>

      {/* Price Chart */}
      <ResponsiveContainer width="100%" height={120}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 45, left: 2, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.12} vertical={false} />
          <XAxis
            dataKey="idx" type="number" domain={[0, chartData.length - 1]}
            tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false} axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 0.3 }}
            interval={0} ticks={timeTicks}
            tickFormatter={(idx: number) => chartData[idx]?.time || ""}
          />
          <YAxis
            yAxisId="price" domain={[yMin, yMax]}
            tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false} axisLine={false} width={42}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          <YAxis
            yAxisId="percent" orientation="right" domain={[percentMin, percentMax]}
            tick={<MiniPercentYTick />}
            tickLine={false} axisLine={false} width={44}
          />
          <ReferenceLine yAxisId="price" y={prevClose} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" strokeWidth={0.4} />
          <Area yAxisId="price" type="monotone" dataKey="price" stroke="none" fill="#3b82f6" fillOpacity={0.06} connectNulls isAnimationActive={false} />
          <Line yAxisId="price" type="monotone" dataKey="price" stroke="#3b82f6" dot={false} strokeWidth={0.8} connectNulls isAnimationActive={false} />
          <Line yAxisId="price" type="monotone" dataKey="avgPrice" stroke="#eab308" dot={false} strokeWidth={0.6} strokeDasharray="3 2" connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Divider */}
      <div className="h-px bg-border/30" />

      {/* Volume */}
      <div className="flex items-center px-2 text-[7px] text-muted-foreground select-none pointer-events-none">
        <span className="font-medium">VOL</span>
      </div>
      <ResponsiveContainer width="100%" height={32}>
        <ComposedChart data={chartData} margin={{ top: 0, right: 45, left: 2, bottom: 0 }}>
          <XAxis dataKey="idx" type="number" domain={[0, chartData.length - 1]} tick={false} tickLine={false} axisLine={false} />
          <YAxis yAxisId="vol" domain={[0, maxVolume * 1.1]} tick={false} tickLine={false} axisLine={false} width={42} />
          <YAxis yAxisId="vol-r" orientation="right" domain={[0, maxVolume * 1.1]} tick={{ fontSize: 6, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={38} tickFormatter={(v: number) => formatVolume(v)} />
          <Bar yAxisId="vol-r" dataKey="volume" isAnimationActive={false} barSize={barSize}>
            {chartData.map((entry, index) => (
              <Cell key={`mv-${index}`} fill={entry.hasData ? (entry.volUp ? "#991b1b" : "#15803d") : "transparent"} fillOpacity={entry.hasData ? 1 : 0} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>

      {/* Divider */}
      <div className="h-px bg-border/30" />

      {/* MACD */}
      <div className="flex items-center gap-2 px-2 text-[7px] select-none pointer-events-none">
        <span className="font-medium text-muted-foreground">MACD</span>
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-1.5 h-0.5 bg-blue-600 rounded" />
          <span className="text-blue-600">DIF</span>
        </span>
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-1.5 h-0.5 bg-orange-600 rounded" />
          <span className="text-orange-600">DEA</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={36}>
        <ComposedChart data={chartData} margin={{ top: 0, right: 45, left: 2, bottom: 0 }}>
          <XAxis dataKey="idx" type="number" domain={[0, chartData.length - 1]} tick={false} tickLine={false} axisLine={false} />
          <YAxis yAxisId="macd" domain={[macdMin - macdPad, macdMax + macdPad]} tick={false} tickLine={false} axisLine={false} width={42} />
          <YAxis yAxisId="macd-r" orientation="right" domain={[macdMin - macdPad, macdMax + macdPad]} tick={{ fontSize: 6, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={38} tickFormatter={(v: number) => v.toFixed(3)} />
          <ReferenceLine yAxisId="macd-r" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" strokeWidth={0.3} />
          <Bar yAxisId="macd-r" dataKey="macd" isAnimationActive={false} barSize={barSize}>
            {chartData.map((entry, index) => (
              <Cell key={`mm-${index}`} fill={entry.macd != null && entry.macd >= 0 ? "#991b1b" : "#15803d"} fillOpacity={entry.macd != null ? 1 : 0} />
            ))}
          </Bar>
          <Line yAxisId="macd-r" type="monotone" dataKey="dif" stroke="#2563eb" dot={false} strokeWidth={0.8} connectNulls isAnimationActive={false} />
          <Line yAxisId="macd-r" type="monotone" dataKey="dea" stroke="#ea580c" dot={false} strokeWidth={0.8} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 同花顺风格 分时图 (Unified Three-Panel) ──────────

function TimeSharingPanel({
  data,
  prevClose,
  symbol,
  signals,
  macdData,
  visibleMinutes = 241,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  zoomIdx = 0,
  maxZoomIdx = 4,
  prevDayMA5,
  szIndexRegime,
  activeIndexKey,
  indexConfig,
  onCycleIndex,
  keyPriceLevels,
  panOffset = 0,
  onPanOffsetChange,
  sectorRegime,
  sectorInfo,
}: {
  data: TimelineItem[];
  prevClose: number;
  symbol: string;
  signals: (TSignal | null)[];
  macdData: { time: string; dif: number | null; dea: number | null; macd: number | null }[];
  visibleMinutes?: number;
  onZoomIn?: (cursorRatio?: number) => void;
  onZoomOut?: (cursorRatio?: number) => void;
  onZoomReset?: () => void;
  zoomIdx?: number;
  maxZoomIdx?: number;
  prevDayMA5?: number | null;
  szIndexRegime?: RegimeDetail | null;
  activeIndexKey?: string;
  indexConfig?: Record<string, { symbol: string; label: string; shortLabel: string }>;
  onCycleIndex?: () => void;
  keyPriceLevels?: { price: number; name: string; type: "support" | "resistance" }[];
  panOffset?: number;
  onPanOffsetChange?: (offset: number) => void;
  sectorRegime?: RegimeDetail | null;
  sectorInfo?: { code: string; name: string } | null;
}) {
  // ── Build full-day timeline template (240 minutes total) ──
  // A-share trading day: 09:30-11:30 (120min) + 13:00-15:00 (120min)
  const { fullDayData, timeTicks } = useMemo(() => {
    if (data.length === 0) return { fullDayData: [], timeTicks: [] };

    // Generate all minute times for the full trading day
    const allTimes: string[] = [];
    // Morning session: 09:30 ~ 11:30
    for (let h = 9; h <= 11; h++) {
      const startM = h === 9 ? 30 : 0;
      const endM = h === 11 ? 30 : 59;
      for (let m = startM; m <= endM; m++) {
        allTimes.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    // Afternoon session: 13:00 ~ 15:00
    for (let h = 13; h <= 15; h++) {
      const endM = h === 15 ? 0 : 59;
      for (let m = 0; m <= endM; m++) {
        allTimes.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }

    // Build signal map by time
    const signalByTime = new Map<string, TSignal>();
    signals.forEach((s, i) => {
      if (s && data[i]) signalByTime.set(data[i].time, s);
    });

    // Build MACD map by time
    const macdByTime = new Map<string, { dif: number; dea: number; macd: number }>();
    for (const m of macdData) {
      if (m.dif != null && m.dea != null && m.macd != null) {
        macdByTime.set(m.time, { dif: m.dif, dea: m.dea, macd: m.macd });
      }
    }

    // Build actual data map by time
    const dataByTime = new Map<string, TimelineItem>();
    data.forEach((d) => dataByTime.set(d.time, d));

    // Merge: fill full day, actual data where available, null placeholders elsewhere
    const lastActualIdx = data.length > 0 ? allTimes.indexOf(data[data.length - 1].time) : -1;
    const fullDay = allTimes.map((time, idx) => {
      const actual = dataByTime.get(time);
      const hasData = actual != null;
      // Only show data up to the last actual time (no future data)
      const isFuture = idx > lastActualIdx && lastActualIdx >= 0;
      if (hasData && !isFuture) {
        const prevActual = (() => {
          // Find the previous data point for volUp calc
          for (let j = data.length - 1; j >= 0; j--) {
            if (data[j].time < time) return data[j];
          }
          return null;
        })();
        const safePrevClose = prevClose > 0 ? prevClose : data[0].price;
        return {
          idx,
          time,
          price: actual.price,
          avgPrice: actual.avgPrice,
          volume: actual.volume,
          changePercent: actual.changePercent,
          volUp: prevActual ? actual.price >= prevActual.price : actual.price >= safePrevClose,
          tSignal: signalByTime.get(time) || undefined,
          dif: macdByTime.get(time)?.dif ?? undefined,
          dea: macdByTime.get(time)?.dea ?? undefined,
          macd: macdByTime.get(time)?.macd ?? undefined,
          hasData: true,
        };
      }
      // Empty slot (no data yet or future)
      return {
        idx,
        time,
        price: undefined as number | undefined,
        avgPrice: undefined as number | undefined,
        volume: 0,
        changePercent: 0,
        volUp: true,
        tSignal: undefined,
        dif: undefined as number | undefined,
        dea: undefined as number | undefined,
        macd: undefined as number | undefined,
        hasData: false,
      };
    });

    // Key time ticks for X-axis labels
    const keyTimes = ["09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00"];
    const ticks = keyTimes.map((t) => allTimes.indexOf(t)).filter((i) => i >= 0);

    return { fullDayData: fullDay, timeTicks: ticks };
  }, [data, prevClose, signals, macdData]);

  // ── Crosshair state: shared across all three panels ──
  const [crosshairIdx, setCrosshairIdx] = useState<number | null>(null);

  // ── Drag-to-pan & scroll-to-pan state ──
  const dragRef = useRef<{ startX: number; startPanOffset: number; isDragging: boolean }>({ startX: 0, startPanOffset: 0, isDragging: false });
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Refs for stable event handlers
  const panOffsetRef = useRef(panOffset);
  const visibleMinutesRef = useRef(visibleMinutes);
  const fullDayDataRef = useRef(fullDayData);
  const onPanOffsetChangeRef = useRef(onPanOffsetChange);
  const onZoomInRef = useRef(onZoomIn);
  const onZoomOutRef = useRef(onZoomOut);
  const zoomIdxRef = useRef(zoomIdx);
  const maxZoomIdxRef = useRef(maxZoomIdx);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
  useEffect(() => { visibleMinutesRef.current = visibleMinutes; }, [visibleMinutes]);
  useEffect(() => { fullDayDataRef.current = fullDayData; }, [fullDayData]);
  useEffect(() => { onPanOffsetChangeRef.current = onPanOffsetChange; }, [onPanOffsetChange]);
  useEffect(() => { onZoomInRef.current = onZoomIn; }, [onZoomIn]);
  useEffect(() => { onZoomOutRef.current = onZoomOut; }, [onZoomOut]);
  useEffect(() => { zoomIdxRef.current = zoomIdx; }, [zoomIdx]);
  useEffect(() => { maxZoomIdxRef.current = maxZoomIdx; }, [maxZoomIdx]);

  // ── Drag-to-pan & scroll-to-pan (stable native events via ref pattern) ──
  useEffect(() => {
    // Pan helper — defined inside effect to avoid memoization issues
    const applyPanOffset = (rawOffset: number) => {
      const fdd = fullDayDataRef.current;
      const vm = visibleMinutesRef.current;
      const lastIdx = fdd.reduce((last: number, item: { hasData: boolean }, idx: number) => (item.hasData ? idx : last), -1);
      const maxOffset = Math.max(0, lastIdx - vm + 1);
      onPanOffsetChangeRef.current?.(Math.max(0, Math.min(rawOffset, maxOffset)));
    };

    const container = chartContainerRef.current;
    if (!container) return;

    const isZoomed = () => visibleMinutesRef.current < fullDayDataRef.current.length;

    const onMouseDown = (e: MouseEvent) => {
      // Left-click drag when zoomed, any click drag when not
      if (e.button !== 0) return; // only left-click
      if (!isZoomed()) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startPanOffset: panOffsetRef.current, isDragging: true };
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      e.preventDefault();
      const dx = e.clientX - dragRef.current.startX;
      const containerWidth = container.clientWidth || 600;
      const vm = visibleMinutesRef.current;
      const estimatedPoints = Math.min(vm, fullDayDataRef.current.length);
      const pixelsPerPoint = containerWidth / estimatedPoints;
      const pointDelta = Math.round(dx / pixelsPerPoint);
      // Drag right → see newer data → decrease offset; Drag left → see older data → increase offset
      const newOffset = dragRef.current.startPanOffset - pointDelta;
      applyPanOffset(newOffset);
    };

    const onMouseUp = () => {
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    const onContextMenu = (e: Event) => {
      if (dragRef.current.isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Scroll wheel: zoom in/out; Shift+scroll or horizontal scroll: pan
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Shift+scroll or horizontal scroll → pan (when zoomed)
      if (e.shiftKey || e.deltaX !== 0) {
        if (!isZoomed()) return;
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const scrollStep = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 40));
        const newOffset = panOffsetRef.current + scrollStep;
        applyPanOffset(newOffset);
        return;
      }

      // Normal vertical scroll → zoom in/out centered on cursor position
      const rect = container.getBoundingClientRect();
      const cursorRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      // deltaY < 0 (scroll up) → zoom in, deltaY > 0 (scroll down) → zoom out
      if (e.deltaY < 0) {
        // Zoom in
        if (zoomIdxRef.current < (maxZoomIdxRef.current ?? 4)) {
          onZoomInRef.current?.(cursorRatio);
        }
      } else if (e.deltaY > 0) {
        // Zoom out
        if (zoomIdxRef.current > 0) {
          onZoomOutRef.current?.(cursorRatio);
        }
      }
    };

    container.addEventListener('mousedown', onMouseDown, true);
    container.addEventListener('contextmenu', onContextMenu, true);
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('contextmenu', onContextMenu, true);
      container.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []); // empty deps — stable listeners via refs

  if (data.length === 0) return null;

  // ── Zoom: slice fullDayData to show only visibleMinutes ──
  // Find the last data point with actual data
  const lastDataIdx = fullDayData.reduce((last, item, idx) => (item.hasData ? idx : last), -1);
  const totalSlots = fullDayData.length;

  // Calculate the visible range
  let zoomData: typeof fullDayData;
  let xDomain: [number, number];
  let zoomTimeTicks: number[];

  if (visibleMinutes >= totalSlots || lastDataIdx < 0) {
    // Full day view (default)
    zoomData = fullDayData;
    xDomain = [0, totalSlots - 1];
    zoomTimeTicks = timeTicks;
  } else {
    // Zoomed in: show `visibleMinutes` minutes, offset by panOffset from the latest data
    const maxPanStart = Math.max(0, lastDataIdx - visibleMinutes + 1);
    const baseEndIdx = lastDataIdx;
    // panOffset > 0 means panning to the left (seeing earlier data)
    const endIdx = Math.min(baseEndIdx, Math.max(visibleMinutes - 1, baseEndIdx - panOffset));
    const startIdx = Math.max(0, endIdx - visibleMinutes + 1);
    zoomData = fullDayData.slice(startIdx, endIdx + 1);
    // Re-index data so idx starts from 0
    zoomData = zoomData.map((item, i) => ({ ...item, idx: i }));
    xDomain = [0, zoomData.length - 1];

    // Generate time ticks for the zoomed range
    const tickInterval = zoomData.length <= 60 ? 10 : zoomData.length <= 120 ? 20 : 30;
    zoomTimeTicks = [];
    for (let i = 0; i < zoomData.length; i += tickInterval) {
      zoomTimeTicks.push(i);
    }
    // Always include last point
    if (zoomTimeTicks[zoomTimeTicks.length - 1] !== zoomData.length - 1) {
      zoomTimeTicks.push(zoomData.length - 1);
    }
  }

  const isZoomed = visibleMinutes < totalSlots;

  // ── Crosshair item (must be after zoomData is computed) ──
  const crosshairItem = crosshairIdx != null && crosshairIdx >= 0 && crosshairIdx < zoomData.length
    ? zoomData[crosshairIdx]
    : null;

  // Smart Y-axis auto-scaling: adapt to actual data range instead of always centering on prevClose
  // This makes fluctuations more visible when price only moves in one direction
  const safePrevClose = prevClose > 0 ? prevClose : data[0].price;

  // Collect actual visible prices from zoomData (not full data)
  const visiblePrices = zoomData.filter(d => d.hasData && d.price != null).map(d => d.price!);
  const visibleAvgPrices = zoomData.filter(d => d.hasData && d.avgPrice != null).map(d => d.avgPrice!);

  // Fallback to full data range if no visible prices
  const allPrices = visiblePrices.length > 0 ? visiblePrices : data.map((d) => d.price);
  const allAvgPrices = visibleAvgPrices.length > 0 ? visibleAvgPrices : data.filter(d => d.avgPrice != null).map(d => d.avgPrice!);

  const dataMin = Math.min(...allPrices, ...allAvgPrices);
  const dataMax = Math.max(...allPrices, ...allAvgPrices);
  const dataRange = dataMax - dataMin || safePrevClose * 0.001;

  // Add proportional padding (20% on each side, with minimum)
  const padding = Math.max(dataRange * 0.2, safePrevClose * 0.002);

  let yMin = dataMin - padding;
  let yMax = dataMax + padding;

  // Ensure prevClose (昨收价) reference line is always visible at the edge
  // But don't extend the range too far just to center on it
  const prevCloseMargin = safePrevClose * 0.002;
  if (safePrevClose < yMin) {
    // All data is above prevClose: extend yMin to include prevClose
    yMin = safePrevClose - prevCloseMargin;
  } else if (safePrevClose > yMax) {
    // All data is below prevClose: extend yMax to include prevClose
    yMax = safePrevClose + prevCloseMargin;
  }

  // Calculate percent range (aligned with price axis)
  const percentMin = ((yMin - safePrevClose) / safePrevClose) * 100;
  const percentMax = ((yMax - safePrevClose) / safePrevClose) * 100;

  // Count signals
  const buySignals = signals.filter((s) => s?.type === "buy").length;
  const sellSignals = signals.filter((s) => s?.type === "sell").length;
  const stoplossSignals = signals.filter((s) => s?.type === "stoploss").length;

  // Volume range
  const maxVolume = Math.max(...data.map((d) => d.volume), 1);

  // MACD range
  const macdValues = macdData.flatMap((d) => [d.dif, d.dea, d.macd]).filter((v) => v != null) as number[];
  const macdMin = macdValues.length ? Math.min(...macdValues) : -1;
  const macdMax = macdValues.length ? Math.max(...macdValues) : 1;
  const macdPad = (macdMax - macdMin) * 0.1 || 0.1;

  // Current price info for header display
  const lastItem = data[data.length - 1];
  const lastSignal = (() => {
    for (let i = signals.length - 1; i >= 0; i--) {
      if (signals[i]) return signals[i];
    }
    return null;
  })();

  // Bar size for volume/MACD based on zoomed data count
  const barSize = zoomData.length > 200 ? 1 : zoomData.length > 100 ? 1.5 : zoomData.length > 60 ? 2 : 3;

  return (
    <div
      ref={chartContainerRef}
      className="bg-card rounded-lg border border-border overflow-hidden"
    >
      {/* Header - 同花顺 style info bar */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-3 text-xs flex-wrap">
        <span className="font-medium text-sm text-foreground">{symbol}</span>
        <span className={`font-bold tabular-nums ${lastItem.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
          {lastItem.price.toFixed(2)}
        </span>
        <span className={`tabular-nums ${lastItem.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
          {lastItem.changePercent >= 0 ? "+" : ""}{lastItem.changePercent.toFixed(2)}%
        </span>
        <div className="h-3 w-px bg-border" />
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-blue-500 rounded" />
          <span className="text-muted-foreground">价格</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-yellow-500 rounded" style={{ borderBottom: "1px dashed #eab308" }} />
          <span className="text-muted-foreground">均价</span>
        </span>
        {prevDayMA5 != null && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-[2px] bg-yellow-500 rounded" style={{ borderBottom: "2px dashed #eab308", opacity: 0.9 }} />
            <span className="text-[10px] text-yellow-500 font-medium">MA5</span>
          </span>
        )}

        <span className="flex items-center gap-1">
          <span className="inline-block w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-red-500" />
          <span className="text-[9px] text-red-500">强</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="text-[9px] text-orange-500">中</span>
          <span className="inline-block w-1 h-1 rounded-full bg-gray-400" />
          <span className="text-[9px] text-gray-400">弱</span>
        </span>
        {/* Support/Resistance legend */}
        {keyPriceLevels && keyPriceLevels.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5">
              <span className="inline-block w-4 h-0 border-t-[2px] border-dashed border-green-600" />
              <span className="text-[10px] text-green-600 font-medium">支撑</span>
            </span>
            <span className="flex items-center gap-0.5">
              <span className="inline-block w-4 h-0 border-t-[2px] border-dashed border-red-600" />
              <span className="text-[10px] text-red-600 font-medium">压力</span>
            </span>
          </span>
        )}
        {buySignals > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            ▲ 买{buySignals}
          </span>
        )}
        {sellSignals > 0 && (
          <span className="flex items-center gap-1 text-green-500">
            ▼ 卖{sellSignals}
          </span>
        )}
        {stoplossSignals > 0 && (
          <span className="flex items-center gap-1 text-yellow-500">
            ◆ 止损{stoplossSignals}
          </span>
        )}
        {/* Market Regime Badge - prominent + T-mode recommendation */}
        {(() => {
          const detail = detectMarketRegimeDetail(data, prevClose);
          const regimeConfig: Record<string, { bg: string; text: string; icon: string }> = {
            "上升通道": { bg: "bg-red-600/20 border-red-600/40", text: "text-red-700 dark:text-red-300", icon: "↑" },
            "下跌趋势": { bg: "bg-green-600/20 border-green-600/40", text: "text-green-700 dark:text-green-300", icon: "↓" },
            "震荡市":   { bg: "bg-emerald-600/20 border-emerald-600/40", text: "text-emerald-700 dark:text-emerald-300", icon: "↔" },
            "横盘末期": { bg: "bg-yellow-600/20 border-yellow-600/40", text: "text-yellow-700 dark:text-yellow-300", icon: "→" },
          };
          const cfg = regimeConfig[detail.regime] || regimeConfig["震荡市"];

          // T-mode recommendation based on regime
          const tModeConfig: Record<string, { label: string; bg: string; text: string; tip: string }> = {
            "上升通道": { label: "正T/反T", bg: "bg-orange-500/10 border-orange-500/25", text: "text-orange-600 dark:text-orange-400", tip: "偏强市场：正T为主（冲高卖出→回落买回），也可反T（低吸→冲高卖出），T仓≤20%，买回要快" },
            "下跌趋势": { label: "仅正T", bg: "bg-red-500/10 border-red-500/25", text: "text-red-600 dark:text-red-400", tip: "偏弱市场：仅正T卖出（冲高卖出→回落买回），不做反T，T仓≤15%，严格止损" },
            "震荡市":   { label: "正T", bg: "bg-blue-500/10 border-blue-500/25", text: "text-blue-600 dark:text-blue-400", tip: "震荡行情：最适合做正T（高抛低吸），T仓30-40%，差价≥1.5%再操作" },
            "横盘末期": { label: "观望", bg: "bg-gray-500/10 border-gray-500/25", text: "text-gray-600 dark:text-gray-400", tip: "方向不明：减少做T频率，等待趋势突破再操作" },
          };
          const tCfg = tModeConfig[detail.regime] || tModeConfig["震荡市"];

          return (
            <>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
                title={detail.description}
              >
                <span>{cfg.icon}</span>
                <span>{detail.regime}</span>
                <span className="opacity-60">{detail.confidence}%</span>
              </span>
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${tCfg.bg} ${tCfg.text}`}
                title={tCfg.tip}
              >
                <span>▸</span>
                <span>{tCfg.label}</span>
              </span>
            </>
          );
        })()}
        {/* Market Index Regime Badge - click to cycle 深/沪/创 */}
        {szIndexRegime && (() => {
          const regimeConfig: Record<string, { bg: string; text: string; icon: string }> = {
            "上升通道": { bg: "bg-red-600/20 border-red-600/40", text: "text-red-700 dark:text-red-300", icon: "↑" },
            "下跌趋势": { bg: "bg-green-600/20 border-green-600/40", text: "text-green-700 dark:text-green-300", icon: "↓" },
            "震荡市":   { bg: "bg-emerald-600/20 border-emerald-600/40", text: "text-emerald-700 dark:text-emerald-300", icon: "↔" },
            "横盘末期": { bg: "bg-yellow-600/20 border-yellow-600/40", text: "text-yellow-700 dark:text-yellow-300", icon: "→" },
          };
          const cfg = regimeConfig[szIndexRegime.regime] || regimeConfig["震荡市"];
          const idxInfo = indexConfig?.[activeIndexKey || "sz"];
          const shortLabel = idxInfo?.shortLabel || "深";
          const fullLabel = idxInfo?.label || "深证成指";
          return (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold cursor-pointer select-none hover:opacity-80 active:scale-95 transition-all ${cfg.bg} ${cfg.text}`}
              title={`${fullLabel}: ${szIndexRegime.description}\n点击切换指数`}
              onClick={onCycleIndex}
            >
              <span className="opacity-80">{shortLabel}</span>
              <span>{cfg.icon}</span>
              <span>{szIndexRegime.regime}</span>
              <span className="opacity-60">{szIndexRegime.confidence}%</span>
            </span>
          );
        })()}
        {/* Sector Regime Badge - shows industry sector trend */}
        {sectorRegime && sectorInfo && (() => {
          const regimeConfig: Record<string, { bg: string; text: string; icon: string }> = {
            "上升通道": { bg: "bg-red-600/20 border-red-600/40", text: "text-red-700 dark:text-red-300", icon: "↑" },
            "下跌趋势": { bg: "bg-green-600/20 border-green-600/40", text: "text-green-700 dark:text-green-300", icon: "↓" },
            "震荡市":   { bg: "bg-emerald-600/20 border-emerald-600/40", text: "text-emerald-700 dark:text-emerald-300", icon: "↔" },
            "横盘末期": { bg: "bg-yellow-600/20 border-yellow-600/40", text: "text-yellow-700 dark:text-yellow-300", icon: "→" },
          };
          const cfg = regimeConfig[sectorRegime.regime] || regimeConfig["震荡市"];
          // Truncate sector name for display (max 4 chars)
          const shortName = sectorInfo.name.length > 4 ? sectorInfo.name.slice(0, 4) : sectorInfo.name;
          return (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}
              title={`${sectorInfo.name}板块: ${sectorRegime.description}\n板块走势与个股信号方向一致时增强，反向时降级`}
            >
              <span className="opacity-80">{shortName}</span>
              <span>{cfg.icon}</span>
              <span>{sectorRegime.regime}</span>
              <span className="opacity-60">{sectorRegime.confidence}%</span>
            </span>
          );
        })()}
        {lastSignal && (
          <Badge variant={lastSignal.type === "buy" ? "default" : lastSignal.type === "stoploss" ? "outline" : "destructive"} className="text-[10px] h-5">
            {lastSignal.type === "buy" ? "买入" : lastSignal.type === "stoploss" ? "止损" : "卖出"} · {lastSignal.reason}
          </Badge>
        )}
        {/* Time Window Indicator */}
        {(() => {
          const lastTime = data[data.length - 1]?.time;
          if (lastTime) {
            const tw = getTimeWindow(lastTime);
            const twColor = tw === "开盘观察" || tw === "尾盘不操作" ? "text-muted-foreground" :
                            tw.includes("卖出") ? "text-green-500" : "text-red-500";
            return (
              <span className={`text-[10px] ${twColor}`}>
                {tw}
              </span>
            );
          }
          return null;
        })()}
        {/* Crosshair data display */}
        {crosshairItem?.hasData && (() => {
          const pct = crosshairItem.changePercent;
          const isUp = pct >= 0;
          return (
            <span className="flex items-center gap-2 text-[10px] tabular-nums">
              <span className="text-muted-foreground">{crosshairItem.time}</span>
              <span className={isUp ? "text-red-600" : "text-green-600"}>{crosshairItem.price?.toFixed(2)}</span>
              <span className={isUp ? "text-red-600" : "text-green-600"}>{isUp ? "+" : ""}{pct?.toFixed(2)}%</span>
              {crosshairItem.volume > 0 && (
                <span className="text-muted-foreground">Vol {formatVolume(crosshairItem.volume)}</span>
              )}
              {crosshairItem.dif != null && (
                <span className="text-blue-600">DIF {crosshairItem.dif.toFixed(3)}</span>
              )}
              {crosshairItem.dea != null && (
                <span className="text-orange-600">DEA {crosshairItem.dea.toFixed(3)}</span>
              )}
              {crosshairItem.macd != null && (
                <span className={crosshairItem.macd >= 0 ? "text-red-600" : "text-green-600"}>MACD {crosshairItem.macd.toFixed(3)}</span>
              )}
            </span>
          );
        })()}
        {/* Zoom Controls - timeline panel */}
        <div className="ml-auto flex items-center gap-1">
          {isZoomed && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                const maxOffset = Math.max(0, lastDataIdx - visibleMinutes + 1);
                const step = Math.max(1, Math.round(visibleMinutes * 0.3));
                onPanOffsetChange?.(Math.min((panOffset || 0) + step, maxOffset));
              }}
              disabled={(panOffset || 0) >= Math.max(0, lastDataIdx - visibleMinutes + 1)}
              title="向左平移（查看更早数据）"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onZoomIn}
            disabled={zoomIdx >= maxZoomIdx}
            title="放大（减少时间范围）"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground tabular-nums min-w-[40px] text-center">
            {isZoomed ? `${visibleMinutes}分` : "全天"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onZoomOut}
            disabled={zoomIdx <= 0}
            title="缩小（增加时间范围）"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          {isZoomed && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                const step = Math.max(1, Math.round(visibleMinutes * 0.3));
                onPanOffsetChange?.(Math.max(0, (panOffset || 0) - step));
              }}
              disabled={(panOffset || 0) <= 0}
              title="向右平移（查看最新数据）"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {isZoomed && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={onZoomReset}
              title="重置为全天视图"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* ─── Panel 1: Price Chart ─── */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={isZoomed ? 420 : 360}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 36, right: 58, left: 2, bottom: 16 }}
            onMouseMove={(state: any) => {
              if (state?.activeTooltipIndex != null) {
                setCrosshairIdx(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setCrosshairIdx(null)}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.15}
              vertical={false}
            />
            <XAxis
              dataKey="idx"
              type="number"
              domain={xDomain}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 0.5 }}
              interval={0}
              ticks={zoomTimeTicks}
              tickFormatter={(idx: number) => {
                const item = zoomData[idx];
                return item?.time || "";
              }}
            />
            <YAxis
              yAxisId="price"
              domain={[yMin, yMax]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={55}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <YAxis
              yAxisId="percent"
              orientation="right"
              domain={[percentMin, percentMax]}
              tick={false}
              tickLine={false}
              axisLine={false}
              width={1}
            />
            <Tooltip content={<TimelineTooltip />} cursor={false} wrapperStyle={{ background: 'transparent', border: 'none' }} />
            {/* Percent labels on right edge of plot area - aligned with MA5 / reference line labels */}
            <Customized component={(props: any) => {
              const yAxisMap = props.yAxisMap;
              if (!yAxisMap) return null;
              const yAxis = yAxisMap.price;
              if (!yAxis || !yAxis.scale) return null;
              const yScale = yAxis.scale;
              // Use offset to get exact plot area dimensions for label positioning
              // This ensures percentage labels align with ReferenceLine labels (MA5, etc.)
              const offset = props.offset;
              if (!offset) return null;
              // Position labels at the right edge of plot area + small padding
              // recharts ReferenceLine with position="right" places labels at ~plotAreaRight + 5
              const labelX = offset.left + offset.width + 5;
              // Generate percent labels at evenly spaced Y positions
              const priceTicks: number[] = [];
              const tickStep = (yMax - yMin) / 5;
              for (let i = 0; i <= 5; i++) {
                priceTicks.push(yMin + tickStep * i);
              }
              return (
                <g>
                  {priceTicks.map((price, i) => {
                    const yPx = yScale(price);
                    const pct = ((price - safePrevClose) / safePrevClose) * 100;
                    const isZero = Math.abs(pct) < 0.01;
                    const fill = isZero ? "#6b7280" : pct > 0 ? "#dc2626" : "#16a34a";
                    const text = isZero ? "" : pct > 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
                    if (!text) return null;
                    return (
                      <text
                        key={`pct-${i}`}
                        x={labelX}
                        y={yPx}
                        textAnchor="start"
                        dominantBaseline="middle"
                        fill={fill}
                        fontSize={9}
                        fontWeight="600"
                        opacity={0.8}
                      >
                        {text}
                      </text>
                    );
                  })}
                </g>
              );
            }} />
            <ReferenceLine
              yAxisId="price"
              y={safePrevClose}
              stroke="#6b7280"
              strokeWidth={1.2}
              strokeOpacity={0.8}
              label={{
                value: "0%",
                position: "right" as const,
                fill: "#6b7280",
                fontSize: 11,
                fontWeight: 700,
              }}
            />
            {/* Today's MA lines as dashed references */}
            {prevDayMA5 != null && prevDayMA5 >= yMin && prevDayMA5 <= yMax && (
              <ReferenceLine
                yAxisId="price"
                y={prevDayMA5}
                stroke="#eab308"
                strokeDasharray="8 4"
                strokeWidth={1.2}
                strokeOpacity={0.9}
                label={{ value: `MA5 ${prevDayMA5.toFixed(2)}`, position: "right", fill: "#eab308", fontSize: 10, fillOpacity: 1 }}
              />
            )}

            {/* Support & Resistance Levels as dashed lines */}
            {keyPriceLevels?.filter(l => l.price >= yMin && l.price <= yMax).map((level, li) => {
              // Support = green tones, Resistance = red/orange tones
              // Skip 昨收价 (already drawn as the main reference line above)
              if (level.name === "昨收价") return null;
              // Skip 涨停/跌停 (usually far out of visible range, too distracting)
              if (level.name.startsWith("涨停") || level.name.startsWith("跌停")) return null;
              // Skip 整数关口 (user requested to hide)
              if (level.name.includes("整数关")) return null;
              // Skip Fibonacci回撤位 (user requested to hide)
              if (level.name.startsWith("Fib")) return null;
              const isSupport = level.type === "support";
              const lineColor = isSupport ? "#16a34a" : "#dc2626";  // green-600 / red-600 (stronger)
              return (
                <ReferenceLine
                  key={`keylevel-${li}`}
                  yAxisId="price"
                  y={level.price}
                  stroke={lineColor}
                  strokeDasharray="6 4"
                  strokeWidth={1.4}
                  strokeOpacity={0.85}
                  label={{
                    value: `${isSupport ? "▲" : "▼"}${level.name}`,
                    position: "right" as const,
                    fill: lineColor,
                    fontSize: 8,
                    fillOpacity: 0.9,
                  }}
                />
              );
            })}
            {/* Lunch break vertical divider between 11:30 and 13:00 */}
            {!isZoomed && (() => {
              const lunchIdx = Math.floor(zoomData.length / 2);
              if (lunchIdx > 0) {
                return (
                  <ReferenceLine
                    yAxisId="price"
                    x={lunchIdx}
                    stroke="hsl(var(--border))"
                    strokeWidth={0.5}
                    strokeDasharray="2 4"
                  />
                );
              }
              return null;
            })()}
            {/* Area fill below price line - 同花顺 style */}
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="none"
              fill="#3b82f6"
              fillOpacity={0.06}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={isZoomed ? 1.5 : 1}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="avgPrice"
              stroke="#eab308"
              dot={false}
              strokeWidth={isZoomed ? 1.2 : 0.8}
              strokeDasharray="3 2"
              connectNulls
              isAnimationActive={false}
            />
            {/* Crosshair vertical line - shared across panels */}
            {crosshairIdx != null && crosshairItem?.hasData && (
              <ReferenceLine yAxisId="price" x={crosshairIdx} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="3 3" />
            )}
            <Customized component={TimelineSignalRenderer} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ─── Divider ─── */}
      <div className="h-px bg-border/50" />

      {/* ─── Panel 2: Volume Chart ─── */}
      <div>
        <div className="flex items-center gap-2 px-2 py-0.5 text-[9px] select-none pointer-events-none">
          <span className="text-muted-foreground font-medium">VOL</span>
        </div>
        <ResponsiveContainer width="100%" height={68}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 0, right: 9, left: 2, bottom: 0 }}
            onMouseMove={(state: any) => {
              if (state?.activeTooltipIndex != null) {
                setCrosshairIdx(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setCrosshairIdx(null)}
          >
            <XAxis dataKey="idx" type="number" domain={xDomain} tick={false} tickLine={false} axisLine={false} />
            {/* Hidden left YAxis to align with price chart */}
            <YAxis
              yAxisId="vol-left"
              domain={[0, maxVolume * 1.1]}
              tick={false}
              tickLine={false}
              axisLine={false}
              width={55}
            />
            <YAxis
              yAxisId="vol-right"
              orientation="right"
              domain={[0, maxVolume * 1.1]}
              tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={(v: number) => formatVolume(v)}
            />
            <Tooltip content={<TimelineVolumeTooltip />} cursor={false} wrapperStyle={{ background: 'transparent', border: 'none' }} />
            {/* Lunch break vertical divider */}
            {!isZoomed && <ReferenceLine yAxisId="vol-right" x={Math.floor(zoomData.length / 2)} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="2 4" />}
            <Bar
              yAxisId="vol-right"
              dataKey="volume"
              isAnimationActive={false}
              barSize={barSize}
            >
              {zoomData.map((entry, index) => (
                <Cell
                  key={`tl-vol-${index}`}
                  fill={entry.hasData ? (entry.volUp ? "#991b1b" : "#15803d") : "transparent"}
                  fillOpacity={entry.hasData ? 1 : 0}
                />
              ))}
            </Bar>
            {/* Crosshair vertical line - shared across panels */}
            {crosshairIdx != null && crosshairItem?.hasData && (
              <ReferenceLine yAxisId="vol-right" x={crosshairIdx} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="3 3" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ─── Divider ─── */}
      <div className="h-px bg-border/50" />

      {/* ─── Panel 3: MACD Chart ─── */}
      <div>
        <div className="flex items-center gap-2 px-2 py-0.5 text-[9px] select-none pointer-events-none">
          <span className="text-muted-foreground font-medium">MACD</span>
          <span className="flex items-center gap-0.5">
            <span className="inline-block w-2 h-0.5 bg-blue-600 rounded" />
            <span className="text-blue-600">DIF</span>
          </span>
          <span className="flex items-center gap-0.5">
            <span className="inline-block w-2 h-0.5 bg-orange-600 rounded" />
            <span className="text-orange-600">DEA</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={78}>
          <ComposedChart
            data={zoomData}
            margin={{ top: 0, right: 9, left: 2, bottom: 0 }}
            onMouseMove={(state: any) => {
              if (state?.activeTooltipIndex != null) {
                setCrosshairIdx(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setCrosshairIdx(null)}
          >
            <XAxis
              dataKey="idx"
              type="number"
              domain={xDomain}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 0.5 }}
              interval={0}
              ticks={zoomTimeTicks}
              tickFormatter={(idx: number) => {
                const item = zoomData[idx];
                return item?.time || "";
              }}
            />
            {/* Hidden left YAxis to align with price chart */}
            <YAxis
              yAxisId="macd-left"
              domain={[macdMin - macdPad, macdMax + macdPad]}
              tick={false}
              tickLine={false}
              axisLine={false}
              width={55}
            />
            <YAxis
              yAxisId="macd-right"
              orientation="right"
              domain={[macdMin - macdPad, macdMax + macdPad]}
              tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={(v: number) => v.toFixed(3)}
            />
            <Tooltip content={<TimelineMACDTooltip />} cursor={false} wrapperStyle={{ background: 'transparent', border: 'none' }} />
            <ReferenceLine yAxisId="macd-right" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" strokeWidth={0.5} />
            {/* Lunch break vertical divider */}
            {!isZoomed && <ReferenceLine yAxisId="macd-right" x={Math.floor(zoomData.length / 2)} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="2 4" />}
            <Bar
              yAxisId="macd-right"
              dataKey="macd"
              isAnimationActive={false}
              barSize={barSize}
            >
              {zoomData.map((entry, index) => (
                <Cell
                  key={`tl-macd-${index}`}
                  fill={entry.macd != null && entry.macd >= 0 ? "#991b1b" : "#15803d"}
                  fillOpacity={entry.macd != null ? 1 : 0}
                />
              ))}
            </Bar>
            <Line
              yAxisId="macd-right"
              type="monotone"
              dataKey="dif"
              stroke="#2563eb"
              dot={false}
              strokeWidth={1.2}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="macd-right"
              type="monotone"
              dataKey="dea"
              stroke="#ea580c"
              dot={false}
              strokeWidth={1.2}
              connectNulls
              isAnimationActive={false}
            />
            {/* Crosshair vertical line - shared across panels */}
            {crosshairIdx != null && crosshairItem?.hasData && (
              <ReferenceLine yAxisId="macd-right" x={crosshairIdx} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="3 3" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Strategy Admin Panel ───────────────────────────────

interface StrategyData {
  version: string;
  name: string;
  basedOn?: string;
  description: string;
  corePhilosophy?: string;
  basicPrinciples?: { id: number; name: string; desc: string }[];
  selectionCriteria?: {
    required: { name: string; desc: string }[];
    exclude: { name: string; reason: string }[];
  };
  indicators: Record<string, any>;
  timelineSignals: {
    name: string;
    description: string;
    rules: any[];
    postProcess: { name: string; description: string; rule: string };
    timeWindowFilter?: { name: string; description: string };
    spreadFloor?: { name: string; description: string; rules: { spread: string; action: string }[] };
  };
  timeWindows?: { period: string; feature: string; action: string; actionType: string }[];
  stopLossRules?: { scenario: string; rule: string }[];
  marketRegimes?: { regime: string; suitability: string; strategy: string; expectedReturn: string }[];
  positionManagement?: {
    basePosition: { label: string; range: string; rule: string };
    tPosition: { label: string; range: string; rule: string };
    singleTQuantity: { basePosition: string; tQuantity: string; note: string }[];
    dailyLimit: { maxCount: number; rule: string };
  };
  klineSignals: { name: string; description: string; rules: any[] };
  dataSources: Record<string, any>;
  logicFlow: {
    name: string;
    steps: { step: number; name: string; description: string }[];
    decisionTree: { question: string; yes: string; no: string }[];
  };
  riskControl: {
    name: string;
    rules: { key: string; label: string; description: string; value?: any; unit?: string; values?: string[] }[];
  };
  dbFactors: any[];
  dbLogicSteps: any[];
}

// ── Custom Factors Tab Component ──────────────────────────

interface CustomFactorCondition {
  key: string;          // 条件标识
  label: string;        // 条件名称
  description: string;  // 条件描述
  category: "price" | "volume" | "indicator" | "trend" | "time" | "pattern";  // 分类
}

interface CustomFactorDefinition {
  id: string;
  name: string;
  description: string;
  signalType: "buy" | "sell";
  tMode: "正T" | "反T";
  strength: "strong" | "medium" | "weak";
  conditions: CustomFactorCondition[];
  enabled: boolean;
  isBuiltIn: boolean;   // 是否内置因子
  dataSource: "分时线";  // 数据来源
}

// 预定义条件库（用户可组合）
const CONDITION_LIBRARY: CustomFactorCondition[] = [
  // ── 价格形态 ──
  { key: "pulse_drop", label: "脉冲下跌", description: "短时间内价格快速下跌超过1%，形成脉冲低点", category: "price" },
  { key: "pulse_rise", label: "脉冲拉升", description: "短时间内价格快速上涨超过1%，形成脉冲高点", category: "price" },
  { key: "price_above_vwap", label: "价格在均线上方", description: "当前价格高于VWAP均价线", category: "price" },
  { key: "price_below_vwap", label: "价格在均线下方", description: "当前价格低于VWAP均价线", category: "price" },
  { key: "vwap_cross_up", label: "上穿均线", description: "价格从均线下方突破到上方", category: "price" },
  { key: "vwap_cross_down", label: "下穿均线", description: "价格从均线上方跌破到下方", category: "price" },
  { key: "new_high", label: "创日内新高", description: "当前价格突破今日全部成交的最高价", category: "price" },
  { key: "new_low", label: "创日内新低", description: "当前价格跌破今日全部成交的最低价", category: "price" },
  { key: "bounce_from_low", label: "低位反弹", description: "从日内低点反弹超过1%，多方发力", category: "price" },
  { key: "pullback_from_high", label: "高位回落", description: "从日内高点回落超过1%，空方施压", category: "price" },
  { key: "three_black_crows", label: "三连阴", description: "连续3根分钟线收跌，短期空头加速", category: "price" },
  { key: "three_white_soldiers", label: "三连阳", description: "连续3根分钟线收涨，短期多头加速", category: "price" },
  { key: "five_bar_drop", label: "五连阴", description: "连续5根分钟线收跌，空头强势加速", category: "price" },
  { key: "five_bar_rise", label: "五连阳", description: "连续5根分钟线收涨，多头强势加速", category: "price" },
  { key: "double_bottom", label: "双底形态", description: "价格在相近位置形成两个低点，支撑确认", category: "price" },
  { key: "prev_close_support", label: "昨收价支撑", description: "价格回到昨收盘价附近企稳（±0.3%）", category: "price" },
  { key: "prev_close_resistance", label: "昨收价压力", description: "价格从下方接近昨收价受阻回落", category: "price" },
  { key: "late_drop", label: "尾盘急跌", description: "14:00后价格快速下跌，可能次日反弹", category: "price" },
  { key: "late_rally", label: "尾盘拉升", description: "14:00后价格快速上涨，可能次日回调", category: "price" },
  { key: "vwap_touch_below", label: "触及均线回落", description: "价格从下方触及VWAP后未能突破回落", category: "price" },
  { key: "vwap_touch_above", label: "触及均线反弹", description: "价格从上方触及VWAP后获得支撑反弹", category: "price" },
  { key: "price_gap_up", label: "向上跳空", description: "当前分钟价格跳高0.5%以上且放量", category: "price" },
  { key: "price_gap_down", label: "向下跳空", description: "当前分钟价格跳低0.5%以上且放量", category: "price" },
  { key: "price_acceleration_up", label: "加速上涨", description: "每分钟涨幅递增，多头动能加强", category: "price" },
  { key: "price_acceleration_down", label: "加速下跌", description: "每分钟跌幅递增，空头动能加强", category: "price" },
  { key: "range_breakout_up", label: "区间向上突破", description: "价格突破近20分钟价格区间上沿且放量", category: "price" },
  { key: "range_breakout_down", label: "区间向下突破", description: "价格跌破近20分钟价格区间下沿且放量", category: "price" },

  // ── 量能特征 ──
  { key: "vol_shrink", label: "量能萎缩", description: "成交量显著缩小至均量的50%以下，抛压/买压衰竭", category: "volume" },
  { key: "vol_expand", label: "放量", description: "成交量显著放大至均量的2倍以上，资金活跃", category: "volume" },
  { key: "vol_sudden_spike", label: "突放巨量", description: "成交量瞬间放大至均量5倍以上，异动明显", category: "volume" },
  { key: "vol_dry_up", label: "地量", description: "成交量降至均量20%以下，交投极度清淡", category: "volume" },
  { key: "vol_climax", label: "天量", description: "成交量创日内新高，多空激烈交锋", category: "volume" },
  { key: "volume_price_divergence", label: "量价背离", description: "价格创新高但量缩/价格创新低但量缩", category: "volume" },
  { key: "vol_increasing", label: "量能递增", description: "连续3分钟成交量逐步放大，动能增强", category: "volume" },
  { key: "vol_decreasing", label: "量能递减", description: "连续3分钟成交量逐步缩小，动能衰减", category: "volume" },
  { key: "vol_climax_shrink", label: "天量后缩量", description: "刚出现天量后立刻缩量，脉冲可能结束", category: "volume" },
  { key: "vol_gradual_increase", label: "温和放量", description: "连续5分钟成交量温和递增（1-1.5倍），健康放量", category: "volume" },
  { key: "vol_price_up_sync", label: "量价齐升", description: "价格上涨+量能放大，多头健康上涨", category: "volume" },
  { key: "vol_price_down_sync", label: "量价齐跌", description: "价格下跌+量能放大，空头强势下跌", category: "volume" },

  // ── 技术指标 ──
  { key: "vwap_deviation_high", label: "偏离均价过高", description: "价格偏离VWAP超过2%，存在回归压力", category: "indicator" },
  { key: "vwap_deviation_low", label: "偏离均价过低", description: "价格偏离VWAP超过-2%，存在反弹可能", category: "indicator" },
  { key: "rsi_oversold", label: "RSI超卖", description: "RSI指标低于30，短期超卖", category: "indicator" },
  { key: "rsi_overbought", label: "RSI超买", description: "RSI指标高于70，短期超买", category: "indicator" },
  { key: "rsi_mid_range", label: "RSI中性区间", description: "RSI在40-60之间，多空均衡，等待方向选择", category: "indicator" },
  { key: "rsi_rebound", label: "RSI超卖回升", description: "RSI从超卖区（<30）回升到30以上，反转信号", category: "indicator" },
  { key: "rsi_pullback", label: "RSI超买回落", description: "RSI从超买区（>70）回落到70以下，反转信号", category: "indicator" },
  { key: "boll_lower", label: "触及布林下轨", description: "价格触及布林带下轨，超卖信号", category: "indicator" },
  { key: "boll_upper", label: "触及布林上轨", description: "价格触及布林带上轨，超买信号", category: "indicator" },
  { key: "boll_squeeze", label: "布林带收窄", description: "布林带宽度收窄至2%以内，波动率降低，即将变盘", category: "indicator" },
  { key: "boll_middle_support", label: "布林中轨支撑", description: "价格回落到布林中轨附近获得支撑", category: "indicator" },
  { key: "macd_golden", label: "MACD金叉", description: "DIF上穿DEA，短期多头信号", category: "indicator" },
  { key: "macd_dead", label: "MACD死叉", description: "DIF下穿DEA，短期空头信号", category: "indicator" },
  { key: "macd_above_zero", label: "MACD零轴上方", description: "DIF和DEA均在零轴上方，多头市场", category: "indicator" },
  { key: "macd_below_zero", label: "MACD零轴下方", description: "DIF和DEA均在零轴下方，空头市场", category: "indicator" },
  { key: "macd_histogram_shrink", label: "MACD柱缩短", description: "MACD红绿柱长度缩短，动能衰减，可能变盘", category: "indicator" },
  { key: "macd_golden_zero", label: "MACD零轴金叉", description: "零轴附近金叉，更强势的多头信号", category: "indicator" },

  // ── 趋势判断 ──
  { key: "vwap_flat", label: "均线走平", description: "VWAP均价线斜率趋近于零，方向不明朗", category: "trend" },
  { key: "vwap_up", label: "均线上行", description: "VWAP均价线斜率为正，趋势向上", category: "trend" },
  { key: "vwap_down", label: "均线下行", description: "VWAP均价线斜率为负，趋势向下", category: "trend" },
  { key: "trend_reversal_up", label: "趋势反转向上", description: "下跌趋势后VWAP拐头向上，可能转多", category: "trend" },
  { key: "trend_reversal_down", label: "趋势反转向下", description: "上涨趋势后VWAP拐头向下，可能转空", category: "trend" },
  { key: "consolidation", label: "缩量横盘", description: "价格窄幅盘整+成交量萎缩，等待方向突破", category: "trend" },
  { key: "ma5_cross_up", label: "上穿5分钟均线", description: "价格上穿近5分钟均价线，短线转多", category: "trend" },
  { key: "ma5_cross_down", label: "下穿5分钟均线", description: "价格下穿近5分钟均价线，短线转空", category: "trend" },
  { key: "higher_low", label: "底部抬高", description: "近20分钟内低点逐步抬高，多头格局", category: "trend" },
  { key: "lower_high", label: "顶部降低", description: "近20分钟内高点逐步降低，空头格局", category: "trend" },

  // ── 时间窗口 ──
  { key: "first_15min", label: "开盘15分钟", description: "9:30-9:45，波动最剧烈，方向不明慎入", category: "time" },
  { key: "first_30min", label: "开盘30分钟", description: "9:30-10:00，开盘博弈剧烈，方向初现", category: "time" },
  { key: "morning_peak", label: "早盘高峰", description: "10:00-11:00，早盘主要交易时段", category: "time" },
  { key: "mid_day", label: "盘中平稳期", description: "10:30-11:20及13:30-14:00，走势相对平稳", category: "time" },
  { key: "pre_lunch", label: "午前尾段", description: "11:00-11:30，午前平仓/建仓时段", category: "time" },
  { key: "lunch_gap", label: "午后首5分钟", description: "13:00-13:05，午间方向确认关键期", category: "time" },
  { key: "afternoon_open", label: "午后开盘", description: "13:00-13:30，午后方向确认时段", category: "time" },
  { key: "afternoon_peak", label: "午后高峰", description: "13:30-14:30，午后主要交易时段", category: "time" },
  { key: "late_session", label: "尾盘时段", description: "14:30-15:00，尾盘资金博弈最激烈", category: "time" },
  { key: "last_15min", label: "收盘前15分钟", description: "14:45-15:00，尾盘异动高发期", category: "time" },

  // ── 综合形态 ──
  { key: "v_shape_bottom", label: "V型反转", description: "急跌后快速反弹，形成V型底部，强反转信号", category: "pattern" },
  { key: "inverted_v_top", label: "倒V型反转", description: "急涨后快速回落，形成倒V型顶部，强反转信号", category: "pattern" },
];

// 内置自定义因子
const BUILT_IN_CUSTOM_FACTORS: CustomFactorDefinition[] = [
  {
    id: "factor_31",
    name: "脉冲缩量企稳",
    description: "脉冲下跌后卖出量能萎缩+VWAP走平 → 强买回信号。现象：股价脉冲下跌，经过一段走势后卖出量能萎缩，均线走平，视为强烈的买入信号。",
    signalType: "buy",
    tMode: "正T",
    strength: "strong",
    conditions: [
      { key: "pulse_drop", label: "脉冲下跌", description: "短时间内价格快速下跌超过1%", category: "price" },
      { key: "vol_shrink", label: "量能萎缩", description: "成交量缩小至均量的50%以下", category: "volume" },
      { key: "vwap_flat", label: "均线走平", description: "VWAP均价线斜率趋近于零", category: "trend" },
    ],
    enabled: true,
    isBuiltIn: true,
    dataSource: "分时线",
  },
  {
    id: "factor_32",
    name: "脉冲拉升缩量滞涨",
    description: "脉冲拉升后买入量能萎缩+VWAP走平 → 强卖出信号。现象：股价脉冲拉升，经过一段走势后买入量能萎缩，均线走平，视为强烈的卖出信号。",
    signalType: "sell",
    tMode: "正T",
    strength: "strong",
    conditions: [
      { key: "pulse_rise", label: "脉冲拉升", description: "短时间内价格快速上涨超过1%", category: "price" },
      { key: "vol_shrink", label: "量能萎缩", description: "成交量缩小至均量的50%以下", category: "volume" },
      { key: "vwap_flat", label: "均线走平", description: "VWAP均价线斜率趋近于零", category: "trend" },
    ],
    enabled: true,
    isBuiltIn: true,
    dataSource: "分时线",
  },
  {
    id: "factor_33",
    name: "缩量横盘突破",
    description: "缩量窄幅盘整后价格向上突破 → 强买信号。现象：股价窄幅横盘整理，成交量持续萎缩，突然放量突破盘整区间上沿。",
    signalType: "buy",
    tMode: "反T",
    strength: "strong",
    conditions: [
      { key: "consolidation", label: "缩量横盘", description: "价格窄幅盘整+成交量萎缩", category: "trend" },
      { key: "vol_expand", label: "放量", description: "成交量显著放大", category: "volume" },
      { key: "vwap_cross_up", label: "上穿均线", description: "价格从均线下方突破到上方", category: "price" },
    ],
    enabled: true,
    isBuiltIn: true,
    dataSource: "分时线",
  },
  {
    id: "factor_34",
    name: "放量突破均线",
    description: "成交量放大+价格从均线下方突破到上方 → 强买信号。现象：股价在均线下方运行一段时间后，伴随成交量放大突破均线。",
    signalType: "buy",
    tMode: "反T",
    strength: "strong",
    conditions: [
      { key: "price_below_vwap", label: "价格在均线下方", description: "当前价格低于VWAP均价线", category: "price" },
      { key: "vol_expand", label: "放量", description: "成交量显著放大", category: "volume" },
      { key: "vwap_cross_up", label: "上穿均线", description: "价格从均线下方突破到上方", category: "price" },
    ],
    enabled: true,
    isBuiltIn: true,
    dataSource: "分时线",
  },
];

const CUSTOM_FACTORS_STORAGE_KEY = "customFactors_v1";

function CustomFactorsTab() {
  // Initialize with defaults to avoid hydration mismatch (localStorage read after mount)
  const [customFactors, setCustomFactors] = useState<CustomFactorDefinition[]>(BUILT_IN_CUSTOM_FACTORS);
  // Read from localStorage after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_FACTORS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CustomFactorDefinition[];
        const builtInIds = BUILT_IN_CUSTOM_FACTORS.map(f => f.id);
        const userFactors = parsed.filter(f => !builtInIds.includes(f.id));
        const mergedBuiltIn = BUILT_IN_CUSTOM_FACTORS.map(bf => {
          const savedBf = parsed.find(f => f.id === bf.id);
          if (savedBf) return { ...bf, enabled: savedBf.enabled };
          return bf;
        });
        // Use microtask to avoid lint warning about setState in effect
        queueMicrotask(() => setCustomFactors([...mergedBuiltIn, ...userFactors]));
      }
    } catch {}
  }, []);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingFactorId, setEditingFactorId] = useState<string | null>(null);
  const [newFactorName, setNewFactorName] = useState("");
  const [newFactorDesc, setNewFactorDesc] = useState("");
  const [newFactorSignal, setNewFactorSignal] = useState<"buy" | "sell">("buy");
  const [newFactorTMode, setNewFactorTMode] = useState<"正T" | "反T">("正T");
  const [newFactorStrength, setNewFactorStrength] = useState<"strong" | "medium" | "weak">("strong");
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [expandedFactorId, setExpandedFactorId] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState<string>("all");

  // 保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_FACTORS_STORAGE_KEY, JSON.stringify(customFactors));
    } catch {}
  }, [customFactors]);

  const toggleFactor = (id: string) => {
    setCustomFactors(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  const deleteFactor = (id: string) => {
    const factor = customFactors.find(f => f.id === id);
    if (factor?.isBuiltIn) return;
    setCustomFactors(prev => prev.filter(f => f.id !== id));
  };

  const startEditFactor = (id: string) => {
    const factor = customFactors.find(f => f.id === id);
    if (!factor || factor.isBuiltIn) return;
    setEditingFactorId(id);
    setNewFactorName(factor.name);
    setNewFactorDesc(factor.description);
    setNewFactorSignal(factor.signalType);
    setNewFactorTMode(factor.tMode);
    setNewFactorStrength(factor.strength);
    setSelectedConditions(factor.conditions.map(c => c.key));
    setShowAddForm(true);
    setExpandedFactorId(null);
  };

  const resetForm = () => {
    setNewFactorName("");
    setNewFactorDesc("");
    setNewFactorSignal("buy");
    setNewFactorTMode("正T");
    setNewFactorStrength("strong");
    setSelectedConditions([]);
    setShowAddForm(false);
    setEditingFactorId(null);
    setConditionFilter("all");
  };

  const addFactor = () => {
    if (!newFactorName.trim() || selectedConditions.length === 0) return;
    const conditions = selectedConditions.map(key => CONDITION_LIBRARY.find(c => c.key === key)!).filter(Boolean);

    if (editingFactorId) {
      // 编辑模式：更新现有因子
      setCustomFactors(prev => prev.map(f => f.id === editingFactorId ? {
        ...f,
        name: newFactorName.trim(),
        description: newFactorDesc.trim() || `自定义因子：${newFactorName}`,
        signalType: newFactorSignal,
        tMode: newFactorTMode,
        strength: newFactorStrength,
        conditions,
      } : f));
    } else {
      // 新增模式
      const newFactor: CustomFactorDefinition = {
        id: `factor_custom_${Date.now()}`,
        name: newFactorName.trim(),
        description: newFactorDesc.trim() || `自定义因子：${newFactorName}`,
        signalType: newFactorSignal,
        tMode: newFactorTMode,
        strength: newFactorStrength,
        conditions,
        enabled: true,
        isBuiltIn: false,
        dataSource: "分时线",
      };
      setCustomFactors(prev => [...prev, newFactor]);
    }
    resetForm();
  };

  const toggleCondition = (key: string) => {
    setSelectedConditions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const categoryLabels: Record<string, string> = {
    price: "价格形态",
    volume: "量能特征",
    indicator: "技术指标",
    trend: "趋势判断",
    time: "时间窗口",
    pattern: "综合形态",
  };
  const categoryColors: Record<string, string> = {
    price: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    volume: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    indicator: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    trend: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    time: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    pattern: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  };

  const filteredConditions = conditionFilter === "all"
    ? CONDITION_LIBRARY
    : CONDITION_LIBRARY.filter(c => c.category === conditionFilter);

  const enabledCount = customFactors.filter(f => f.enabled).length;
  const builtInFactors = customFactors.filter(f => f.isBuiltIn);
  const userFactors = customFactors.filter(f => !f.isBuiltIn);

  return (
    <div className="space-y-4">
      {/* 标题区域 */}
      <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-bold">自定义因子 — 分时线策略组合器</span>
          <Badge variant="outline" className="text-[10px] h-5 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300">
            v3.8
          </Badge>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">
            已启用 {enabledCount}/{customFactors.length}
          </Badge>
        </div>
        <div className="text-xs text-foreground/80">
          自定义因子是基于<span className="font-bold text-violet-600 dark:text-violet-400">分时线（日内1分钟数据）</span>的策略组合。
          您可以将多个条件（价格形态、量能特征、技术指标、趋势判断）自由组合，创建属于自己的交易信号因子。
          每个因子的所有条件必须同时满足才会触发信号，<strong className="text-emerald-600 dark:text-emerald-400">信号会实时显示在分时图上</strong>。
        </div>
      </div>

      {/* 数据源提示 */}
      <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 flex items-start gap-2">
        <Activity className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
          <span className="font-bold">重要提示：</span>
          自定义因子作用于<span className="font-bold">分时线数据</span>（日内每分钟的价格和成交量），而非K线数据。
          分时线能够捕捉更细腻的日内脉冲、缩量、均线走平等微观特征，是做T操作的核心数据源。
          因子信号将显示在分时图上，帮助您精准把握日内高低点。
        </div>
      </div>

      {/* 内置自定义因子 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">内置自定义因子</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{builtInFactors.length}个</Badge>
        </div>
        <div className="space-y-2">
          {builtInFactors.map(factor => (
            <div key={factor.id} className="rounded-lg border border-border overflow-hidden">
              {/* 因子标题行 */}
              <div
                className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedFactorId(expandedFactorId === factor.id ? null : factor.id)}
              >
                {/* 启用开关 */}
                <button
                  className={`shrink-0 w-8 h-4.5 rounded-full transition-colors relative ${factor.enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
                  onClick={(e) => { e.stopPropagation(); toggleFactor(factor.id); }}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${factor.enabled ? "left-4" : "left-0.5"}`} />
                </button>

                {/* 信号类型图标 */}
                <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center ${factor.signalType === "buy" ? "bg-red-100 dark:bg-red-950/50" : "bg-green-100 dark:bg-green-950/50"}`}>
                  {factor.signalType === "buy" ? (
                    <ArrowUpRight className="h-3 w-3 text-red-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-green-500" />
                  )}
                </div>

                {/* 因子名称和标签 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">{factor.name}</span>
                    <Badge className={`text-[9px] h-4 px-1 ${factor.strength === "strong" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.strength === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                      {factor.strength === "strong" ? "强" : factor.strength === "medium" ? "中" : "弱"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.tMode}</Badge>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                      {factor.dataSource}
                    </Badge>
                    {factor.enabled && (
                      <Badge className="text-[8px] h-4 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 animate-pulse">
                        ● 检测中
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 条件数和展开箭头 */}
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.conditions.length}条件</Badge>
                  {expandedFactorId === factor.id ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* 展开详情 */}
              {expandedFactorId === factor.id && (
                <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border">
                  <div className="text-[10px] text-muted-foreground mt-2">{factor.description}</div>
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-medium text-foreground/80">条件组合（全部满足才触发）：</div>
                    {factor.conditions.map((cond, ci) => (
                      <div key={ci} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                        <span className={`shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded ${categoryColors[cond.category]}`}>
                          {categoryLabels[cond.category]}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[10px] font-medium">{cond.label}</div>
                          <div className="text-[9px] text-muted-foreground">{cond.description}</div>
                        </div>
                        {ci < factor.conditions.length - 1 && (
                          <span className="shrink-0 text-[8px] text-muted-foreground self-center ml-auto">AND</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* 信号输出 */}
                  <div className="p-2 rounded bg-muted/50 flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground">触发信号：</span>
                    <Badge variant={factor.signalType === "buy" ? "default" : "destructive"} className="text-[9px] h-4">
                      {factor.signalType === "buy" ? "买入" : "卖出"}
                    </Badge>
                    <Badge className={`text-[9px] h-4 ${factor.strength === "strong" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.strength === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                      {factor.strength === "strong" ? "强信号" : factor.strength === "medium" ? "中信号" : "弱信号"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] h-4">{factor.tMode}</Badge>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 用户自定义因子 */}
      {userFactors.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium">我的自定义因子</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">{userFactors.length}个</Badge>
          </div>
          <div className="space-y-2">
            {userFactors.map(factor => (
              <div key={factor.id} className="rounded-lg border border-border overflow-hidden">
                {/* 因子标题行 */}
                <div
                  className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedFactorId(expandedFactorId === factor.id ? null : factor.id)}
                >
                  <button
                    className={`shrink-0 w-8 h-4.5 rounded-full transition-colors relative ${factor.enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
                    onClick={(e) => { e.stopPropagation(); toggleFactor(factor.id); }}
                  >
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${factor.enabled ? "left-4" : "left-0.5"}`} />
                  </button>
                  <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center ${factor.signalType === "buy" ? "bg-red-100 dark:bg-red-950/50" : "bg-green-100 dark:bg-green-950/50"}`}>
                    {factor.signalType === "buy" ? (
                      <ArrowUpRight className="h-3 w-3 text-red-500" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold">{factor.name}</span>
                      <Badge className={`text-[9px] h-4 px-1 ${factor.strength === "strong" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.strength === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {factor.strength === "strong" ? "强" : factor.strength === "medium" ? "中" : "弱"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.tMode}</Badge>
                      {factor.enabled && (
                        <Badge className="text-[8px] h-4 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 animate-pulse">
                          ● 检测中
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{factor.conditions.length}条件</Badge>
                    <button
                      className="shrink-0 h-5 w-5 rounded flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); startEditFactor(factor.id); }}
                    >
                      <Pencil className="h-3 w-3 text-blue-500" />
                    </button>
                    <button
                      className="shrink-0 h-5 w-5 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); deleteFactor(factor.id); }}
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </button>
                    {expandedFactorId === factor.id ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {expandedFactorId === factor.id && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border">
                    <div className="text-[10px] text-muted-foreground mt-2">{factor.description}</div>
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-medium text-foreground/80">条件组合（全部满足才触发）：</div>
                      {factor.conditions.map((cond, ci) => (
                        <div key={ci} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                          <span className={`shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded ${categoryColors[cond.category]}`}>
                            {categoryLabels[cond.category]}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[10px] font-medium">{cond.label}</div>
                            <div className="text-[9px] text-muted-foreground">{cond.description}</div>
                          </div>
                          {ci < factor.conditions.length - 1 && (
                            <span className="shrink-0 text-[8px] text-muted-foreground self-center ml-auto">AND</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="p-2 rounded bg-muted/50 flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground">触发信号：</span>
                      <Badge variant={factor.signalType === "buy" ? "default" : "destructive"} className="text-[9px] h-4">
                        {factor.signalType === "buy" ? "买入" : "卖出"}
                      </Badge>
                      <Badge className={`text-[9px] h-4 ${factor.strength === "strong" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : factor.strength === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                        {factor.strength === "strong" ? "强信号" : factor.strength === "medium" ? "中信号" : "弱信号"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4">{factor.tMode}</Badge>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 添加新因子按钮 */}
      {!showAddForm && (
        <button
          className="w-full p-3 rounded-lg border-2 border-dashed border-border hover:border-violet-300 hover:bg-violet-50/30 dark:hover:border-violet-700 dark:hover:bg-violet-950/10 transition-colors flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-4 w-4" />
          <span className="font-medium">新增自定义因子</span>
        </button>
      )}

      {/* 添加/编辑因子表单 */}
      {showAddForm && (
        <div className={`rounded-lg border p-4 space-y-3 ${editingFactorId ? "border-blue-200 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/10" : "border-violet-200 bg-violet-50/30 dark:border-violet-900/40 dark:bg-violet-950/10"}`}>
          <div className="flex items-center gap-2">
            {editingFactorId ? (
              <>
                <Pencil className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-bold">编辑自定义因子</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-bold">新增自定义因子</span>
              </>
            )}
            <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ml-auto ${editingFactorId ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"}`}>
              分时线
            </Badge>
          </div>

          {/* 因子名称 */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">因子名称 *</label>
            <Input
              value={newFactorName}
              onChange={(e) => setNewFactorName(e.target.value)}
              placeholder="例如：脉冲缩量企稳、双底反弹..."
              className="h-8 text-xs"
            />
          </div>

          {/* 因子描述 */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">因子描述</label>
            <Textarea
              value={newFactorDesc}
              onChange={(e) => setNewFactorDesc(e.target.value)}
              placeholder="描述此因子的触发逻辑和使用场景..."
              className="h-16 text-xs resize-none"
            />
          </div>

          {/* 信号配置 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">信号方向</label>
              <div className="flex gap-1">
                <button
                  className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorSignal === "buy" ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800" : "bg-muted/50 text-muted-foreground border border-border"}`}
                  onClick={() => setNewFactorSignal("buy")}
                >
                  买入
                </button>
                <button
                  className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorSignal === "sell" ? "bg-green-100 text-green-700 border border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-800" : "bg-muted/50 text-muted-foreground border border-border"}`}
                  onClick={() => setNewFactorSignal("sell")}
                >
                  卖出
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">做T模式</label>
              <div className="flex gap-1">
                <button
                  className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorTMode === "正T" ? "bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" : "bg-muted/50 text-muted-foreground border border-border"}`}
                  onClick={() => setNewFactorTMode("正T")}
                >
                  正T
                </button>
                <button
                  className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorTMode === "反T" ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" : "bg-muted/50 text-muted-foreground border border-border"}`}
                  onClick={() => setNewFactorTMode("反T")}
                >
                  反T
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">信号强度</label>
              <div className="flex gap-1">
                {(["strong", "medium", "weak"] as const).map(s => (
                  <button
                    key={s}
                    className={`flex-1 h-7 rounded text-[10px] font-medium transition-colors ${newFactorStrength === s ? (s === "strong" ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800" : s === "medium" ? "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" : "bg-gray-100 text-gray-700 border border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700") : "bg-muted/50 text-muted-foreground border border-border"}`}
                    onClick={() => setNewFactorStrength(s)}
                  >
                    {s === "strong" ? "强" : s === "medium" ? "中" : "弱"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 条件选择 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] font-medium text-muted-foreground">选择条件 *（至少1个）</label>
              {selectedConditions.length > 0 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">已选 {selectedConditions.length}个</Badge>
              )}
            </div>
            {/* 条件分类筛选 */}
            <div className="flex gap-1 mb-2">
              {["all", "price", "volume", "indicator", "trend", "time", "pattern"].map(cat => (
                <button
                  key={cat}
                  className={`h-5 px-2 rounded text-[9px] font-medium transition-colors ${conditionFilter === cat ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" : "bg-muted/50 text-muted-foreground"}`}
                  onClick={() => setConditionFilter(cat)}
                >
                  {cat === "all" ? "全部" : categoryLabels[cat]}
                </button>
              ))}
            </div>
            {/* 条件网格 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
              {filteredConditions.map(cond => {
                const isSelected = selectedConditions.includes(cond.key);
                return (
                  <button
                    key={cond.key}
                    className={`p-1.5 rounded border text-left transition-colors ${isSelected ? "border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30" : "border-border bg-card hover:bg-muted/30"}`}
                    onClick={() => toggleCondition(cond.key)}
                  >
                    <div className="flex items-center gap-1">
                      <span className={`shrink-0 text-[7px] font-bold px-1 py-0.5 rounded ${categoryColors[cond.category]}`}>
                        {categoryLabels[cond.category]?.slice(0, 2)}
                      </span>
                      <span className={`text-[10px] font-medium ${isSelected ? "text-violet-700 dark:text-violet-300" : ""}`}>
                        {cond.label}
                      </span>
                      {isSelected && (
                        <span className="ml-auto text-violet-500 text-[10px]">✓</span>
                      )}
                    </div>
                    <div className="text-[8px] text-muted-foreground mt-0.5 line-clamp-2">{cond.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 已选条件预览 */}
          {selectedConditions.length > 0 && (
            <div className="p-2 rounded bg-muted/30 space-y-1.5">
              <div className="text-[10px] font-medium text-foreground/80">条件组合预览：</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedConditions.map((key, i) => {
                  const cond = CONDITION_LIBRARY.find(c => c.key === key);
                  if (!cond) return null;
                  return (
                    <div key={key} className="flex items-center gap-1">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${categoryColors[cond.category]}`}>
                        {cond.label}
                      </span>
                      {i < selectedConditions.length - 1 && (
                        <span className="text-[8px] text-muted-foreground font-bold">+</span>
                      )}
                    </div>
                  );
                })}
                <span className="text-[9px] text-muted-foreground">→</span>
                <Badge variant={newFactorSignal === "buy" ? "default" : "destructive"} className="text-[9px] h-4">
                  {newFactorSignal === "buy" ? "买入" : "卖出"}
                </Badge>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!newFactorName.trim() || selectedConditions.length === 0}
              onClick={addFactor}
            >
              <Save className="h-3 w-3 mr-1" />
              {editingFactorId ? "更新因子" : "保存因子"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={resetForm}
            >
              {editingFactorId ? "取消编辑" : "取消"}
            </Button>
          </div>
        </div>
      )}

      {/* 条件库参考 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">分时线条件库参考</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{CONDITION_LIBRARY.length}个条件</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(["price", "volume", "indicator", "trend", "time", "pattern"] as const).map(cat => (
            <div key={cat} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${categoryColors[cat]}`}>
                  {categoryLabels[cat]}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {CONDITION_LIBRARY.filter(c => c.category === cat).length}个条件
                </span>
              </div>
              <div className="space-y-1">
                {CONDITION_LIBRARY.filter(c => c.category === cat).map(cond => (
                  <div key={cond.key} className="flex items-start gap-1.5 text-[9px]">
                    <span className="text-muted-foreground shrink-0">•</span>
                    <div>
                      <span className="font-medium">{cond.label}</span>
                      <span className="text-muted-foreground ml-1">{cond.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="p-2.5 rounded-lg border border-border bg-muted/30 text-[10px] text-muted-foreground space-y-1">
        <div className="font-medium text-foreground/80">使用说明：</div>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>自定义因子基于<strong>分时线</strong>（1分钟级别价格+成交量+VWAP均价线）数据检测</li>
          <li>每个因子的所有条件必须<strong>同时满足</strong>才会触发信号</li>
          <li>信号触发后会显示在分时图上，与其他策略信号合并展示</li>
          <li>内置因子（31-34）已集成到策略引擎中，启用/禁用即时生效</li>
          <li>用户新增的因子<strong className="text-emerald-600 dark:text-emerald-400">已支持自动检测</strong>，启用后会在分时图上实时显示信号</li>
          <li>建议：将高胜率的人工判断模式编码为自定义因子，逐步积累和优化</li>
        </ul>
      </div>
    </div>
  );
}

function StrategyAdminPanel({ onFactorsChanged }: { onFactorsChanged?: (factors: any[]) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [strategyData, setStrategyData] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);

  const fetchStrategy = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock/strategy");
      const data = await res.json();
      setStrategyData(data);
      // Notify parent of factor changes
      if (onFactorsChanged && data.dbFactors) {
        onFactorsChanged(data.dbFactors);
      }
    } catch (e) {
      console.error("Failed to fetch strategy data:", e);
    } finally {
      setLoading(false);
    }
  }, [onFactorsChanged]);

  useEffect(() => {
    if (isOpen && !strategyData) {
      fetchStrategy();
    }
  }, [isOpen, strategyData, fetchStrategy]);

  const handleInit = useCallback(async () => {
    setInitLoading(true);
    try {
      await fetch("/api/stock/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "init" }),
      });
      await fetchStrategy();
    } catch (e) {
      console.error("Failed to init strategy:", e);
    } finally {
      setInitLoading(false);
    }
  }, [fetchStrategy]);

  const handleToggleFactor = useCallback(async (id: string, enabled: boolean) => {
    try {
      await fetch("/api/stock/strategy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "factor", id, data: { enabled: !enabled } }),
      });
      if (strategyData) {
        const updatedFactors = strategyData.dbFactors.map((f: any) =>
          f.id === id ? { ...f, enabled: !enabled } : f
        );
        setStrategyData({
          ...strategyData,
          dbFactors: updatedFactors,
        });
        // Notify parent of factor changes
        if (onFactorsChanged) {
          onFactorsChanged(updatedFactors);
        }
      }
    } catch (e) {
      console.error("Failed to toggle factor:", e);
    }
  }, [strategyData, onFactorsChanged]);

  const handleDeleteFactor = useCallback(async (id: string) => {
    try {
      await fetch(`/api/stock/strategy?type=factor&id=${id}`, { method: "DELETE" });
      if (strategyData) {
        const updatedFactors = strategyData.dbFactors.filter((f: any) => f.id !== id);
        setStrategyData({
          ...strategyData,
          dbFactors: updatedFactors,
        });
        // Notify parent of factor changes
        if (onFactorsChanged) {
          onFactorsChanged(updatedFactors);
        }
      }
    } catch (e) {
      console.error("Failed to delete factor:", e);
    }
  }, [strategyData, onFactorsChanged]);

  const getCategoryColor = (category: string) => {
    switch (category.toUpperCase()) {
      case "MACD": return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800";
      case "VWAP": return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800";
      case "VOLUME": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
      case "VOLUME_PATTERN": return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800";
      case "MOMENTUM": return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800";
      case "STOPLOSS": return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800";
      case "DIVERGENCE": return "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800";
      case "SUPPORT": return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800";
      case "RSI": return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800";
      case "BOLL": return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-300 dark:border-fuchsia-800";
      case "TIME_WINDOW": return "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800";
      case "SPREAD": return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
      case "REGIME": return "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800";
      default: return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
    }
  };

  const getSignalBadge = (type: string) => {
    if (type === "buy") return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
    return "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800";
  };

  const getLogicCategoryIcon = (category: string) => {
    switch (category) {
      case "data": return <Database className="h-3.5 w-3.5" />;
      case "calc": case "macd": return <Cpu className="h-3.5 w-3.5" />;
      case "signal": return <Zap className="h-3.5 w-3.5" />;
      case "filter": return <Eye className="h-3.5 w-3.5" />;
      case "display": return <Eye className="h-3.5 w-3.5" />;
      case "system": return <RefreshCw className="h-3.5 w-3.5" />;
      default: return <GitBranch className="h-3.5 w-3.5" />;
    }
  };

  const getLogicCategoryColor = (category: string) => {
    switch (category) {
      case "data": return "bg-blue-500";
      case "calc": case "macd": return "bg-purple-500";
      case "vwap": return "bg-yellow-500";
      case "signal": return "bg-red-500";
      case "volume": return "bg-blue-500";
      case "momentum": return "bg-orange-500";
      case "filter": return "bg-emerald-500";
      case "strength": return "bg-amber-500";
      case "display": return "bg-cyan-500";
      case "output": return "bg-rose-500";
      case "system": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <Card className="mt-4">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left"
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            策略管理面板
            <Badge variant="outline" className="text-[10px] h-5 ml-1">
              {strategyData ? `v${strategyData.version}` : "--"}
            </Badge>
            <span className="ml-auto text-muted-foreground">
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </CardTitle>
        </CardHeader>
      </button>

      {isOpen && (
        <CardContent className="px-4 pb-4">
          {/* Action Bar */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={fetchStrategy}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleInit}
              disabled={initLoading}
            >
              <Save className={`h-3 w-3 mr-1 ${initLoading ? "animate-spin" : ""}`} />
              初始化默认参数
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {strategyData ? `${strategyData.dbFactors?.length || 0} 个因子 · ${strategyData.dbLogicSteps?.length || 0} 个逻辑步骤` : "加载中..."}
            </span>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8 mb-4 flex-wrap">
              <TabsTrigger value="overview" className="text-xs px-3 h-6">策略总纲</TabsTrigger>
              <TabsTrigger value="factors" className="text-xs px-3 h-6">因子参数</TabsTrigger>
              <TabsTrigger value="timewindow" className="text-xs px-3 h-6">时间窗口</TabsTrigger>
              <TabsTrigger value="logic" className="text-xs px-3 h-6">逻辑流程</TabsTrigger>
              <TabsTrigger value="position" className="text-xs px-3 h-6">仓位管理</TabsTrigger>
              <TabsTrigger value="risk" className="text-xs px-3 h-6">风控参数</TabsTrigger>
              <TabsTrigger value="datasource" className="text-xs px-3 h-6">数据源</TabsTrigger>
              <TabsTrigger value="regime" className="text-xs px-3 h-6">趋势识别</TabsTrigger>
              <TabsTrigger value="corelogic" className="text-xs px-3 h-6">核心逻辑</TabsTrigger>
              <TabsTrigger value="customfactors" className="text-xs px-3 h-6">自定义因子</TabsTrigger>
            </TabsList>

            {/* ── Tab: 策略总纲 ── */}
            {activeTab === "overview" && strategyData && (
              <div className="space-y-4">
                {/* Strategy Header */}
                <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                      v{strategyData.version}
                    </Badge>
                    <span className="text-sm font-bold">{strategyData.name}</span>
                  </div>
                  {strategyData.basedOn && (
                    <div className="text-[10px] text-muted-foreground mb-2">基于: {strategyData.basedOn}</div>
                  )}
                  {strategyData.corePhilosophy && (
                    <div className="text-xs text-foreground/80 italic border-l-2 border-emerald-400 pl-3">
                      {strategyData.corePhilosophy}
                    </div>
                  )}
                </div>

                {/* 5 Basic Principles */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">基本原则</div>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    {strategyData.basicPrinciples?.map((p) => (
                      <div key={p.id} className="p-2.5 rounded-lg border border-border bg-muted/30 text-center">
                        <div className="text-lg font-bold text-primary mb-1">{p.id}</div>
                        <div className="text-xs font-medium">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{p.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selection Criteria */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Required */}
                  <div className="p-3 rounded-lg border border-border">
                    <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" />
                      必要条件（全部满足才操作）
                    </div>
                    <div className="space-y-1.5">
                      {strategyData.selectionCriteria?.required.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px]">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-bold text-[8px]">✓</span>
                          <div>
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground ml-1">{c.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Exclude */}
                  <div className="p-3 rounded-lg border border-border">
                    <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                      <X className="h-3.5 w-3.5" />
                      排除条件（出现任一即不做T）
                    </div>
                    <div className="space-y-1.5">
                      {strategyData.selectionCriteria?.exclude.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px]">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 flex items-center justify-center font-bold text-[8px]">✗</span>
                          <div>
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground ml-1">{c.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Market Regimes */}
                {strategyData.marketRegimes && strategyData.marketRegimes.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">不同行情下的做T策略</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {strategyData.marketRegimes.map((m) => {
                        const colorMap: Record<string, string> = {
                          "震荡市": "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
                          "上升通道": "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
                          "下跌趋势": "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
                          "横盘末期": "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30",
                        };
                        const textColorMap: Record<string, string> = {
                          "震荡市": "text-emerald-700 dark:text-emerald-300",
                          "上升通道": "text-red-700 dark:text-red-300",
                          "下跌趋势": "text-green-700 dark:text-green-300",
                          "横盘末期": "text-yellow-700 dark:text-yellow-300",
                        };
                        return (
                          <div key={m.regime} className={`p-2.5 rounded-lg border ${colorMap[m.regime] || "border-border bg-muted/30"}`}>
                            <div className={`text-xs font-bold ${textColorMap[m.regime] || ""}`}>{m.regime}</div>
                            <div className="text-[10px] text-muted-foreground mt-1">{m.suitability}</div>
                            <div className="text-[10px] mt-1">{m.strategy}</div>
                            <div className="text-[10px] text-muted-foreground mt-1">预期: {m.expectedReturn}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Stop Loss Rules */}
                {strategyData.stopLossRules && strategyData.stopLossRules.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 mb-2 flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" />
                      止损规则
                    </div>
                    <div className="space-y-1.5">
                      {strategyData.stopLossRules.map((r, i) => (
                        <div key={i} className="p-2 rounded border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30 text-[10px]">
                          <span className="font-medium text-yellow-700 dark:text-yellow-300">{r.scenario}</span>
                          <span className="text-muted-foreground ml-2">{r.rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 时间窗口 ── */}
            {activeTab === "timewindow" && strategyData && (
              <div className="space-y-4">
                {/* Time Windows */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    日内操作时间段对照表
                  </div>
                  <div className="space-y-2">
                    {strategyData.timeWindows?.map((tw, i) => {
                      const actionColorMap: Record<string, string> = {
                        observe: "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30",
                        sell: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
                        buy: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
                      };
                      const actionTextColorMap: Record<string, string> = {
                        observe: "text-gray-600 dark:text-gray-400",
                        sell: "text-green-700 dark:text-green-300",
                        buy: "text-red-700 dark:text-red-300",
                      };
                      const actionIconMap: Record<string, string> = {
                        observe: "👁️",
                        sell: "📉",
                        buy: "📈",
                      };
                      return (
                        <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${actionColorMap[tw.actionType] || ""}`}>
                          <span className="text-lg shrink-0">{actionIconMap[tw.actionType] || "⏰"}</span>
                          <div className="shrink-0 w-24">
                            <span className="font-mono text-sm font-bold">{tw.period}</span>
                          </div>
                          <div className="flex-1">
                            <div className="text-xs">{tw.feature}</div>
                            <div className={`text-xs font-medium mt-0.5 ${actionTextColorMap[tw.actionType] || ""}`}>{tw.action}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Spread Floor Rules */}
                {strategyData.timelineSignals.spreadFloor && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">差价底线规则</div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[80px_1fr] gap-0 text-[10px] bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">
                        <span>差价比例</span>
                        <span>操作建议</span>
                      </div>
                      {strategyData.timelineSignals.spreadFloor.rules.map((r, i) => {
                        const levelColor = i === 0 ? "text-red-500" : i === 1 ? "text-orange-500" : i === 2 ? "text-yellow-600" : i === 3 ? "text-emerald-600" : "text-emerald-700";
                        return (
                          <div key={i} className="grid grid-cols-[80px_1fr] gap-0 text-[10px] px-3 py-1.5 border-t border-border/50 items-center">
                            <span className={`font-mono font-medium ${levelColor}`}>{r.spread}</span>
                            <span>{r.action}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 仓位管理 ── */}
            {activeTab === "position" && strategyData && strategyData.positionManagement && (
              <div className="space-y-4">
                {/* Position Split */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-lg border border-border bg-muted/30 text-center">
                    <div className="text-2xl font-bold text-primary">{strategyData.positionManagement.basePosition.range}</div>
                    <div className="text-xs font-medium mt-1">{strategyData.positionManagement.basePosition.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{strategyData.positionManagement.basePosition.rule}</div>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-muted/30 text-center">
                    <div className="text-2xl font-bold text-orange-500">{strategyData.positionManagement.tPosition.range}</div>
                    <div className="text-xs font-medium mt-1">{strategyData.positionManagement.tPosition.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{strategyData.positionManagement.tPosition.rule}</div>
                  </div>
                </div>

                {/* Single T Quantity Table */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">单次做T仓位对照表</div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-3 gap-0 text-[10px] bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground">
                      <span>底仓规模</span>
                      <span>单次T仓数量</span>
                      <span>说明</span>
                    </div>
                    {strategyData.positionManagement.singleTQuantity.map((q, i) => (
                      <div key={i} className="grid grid-cols-3 gap-0 text-[10px] px-3 py-1.5 border-t border-border/50 items-center">
                        <span className="font-mono">{q.basePosition}</span>
                        <span className="font-mono font-medium">{q.tQuantity}</span>
                        <span className="text-muted-foreground">{q.note}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily Limit */}
                <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
                  <div className="text-xs font-medium text-yellow-700 dark:text-yellow-300 mb-1">每日做T次数限制</div>
                  <div className="text-[10px]">
                    最多 <span className="font-bold">{strategyData.positionManagement.dailyLimit.maxCount}</span> 次做T
                    <span className="text-muted-foreground ml-2">{strategyData.positionManagement.dailyLimit.rule}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: 因子参数 ── */}
            {activeTab === "factors" && strategyData && (
              <div className="space-y-4">
                {/* Indicator Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.entries(strategyData.indicators).map(([key, ind]: [string, any]) => (
                    <div key={key} className="p-3 rounded-lg border border-border bg-muted/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={`text-[10px] h-5 ${getCategoryColor(key.toUpperCase())}`}>
                          {key.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-medium">{ind.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2">{ind.description}</p>
                      {ind.params && (
                        <div className="grid grid-cols-3 gap-1 text-[10px]">
                          {ind.params.map((p: any) => (
                            <div key={p.key} className="bg-background rounded px-1.5 py-1 text-center">
                              <div className="text-muted-foreground">{p.label}</div>
                              <div className="font-mono font-medium">{p.value}{p.unit && <span className="text-muted-foreground">{p.unit}</span>}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {ind.formulas && (
                        <div className="space-y-1 mt-2">
                          {ind.formulas.map((f: any) => (
                            <div key={f.name} className="text-[10px]">
                              <span className="font-medium text-foreground">{f.name}: </span>
                              <span className="font-mono text-muted-foreground">{f.formula}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Signal Rules Table */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {strategyData.timelineSignals.name} — {strategyData.timelineSignals.description}
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-[40px_80px_60px_50px_1fr_100px_80px_40px] gap-0 text-[10px] bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
                      <span>优先</span>
                      <span>名称</span>
                      <span>类别</span>
                      <span>方向</span>
                      <span>条件</span>
                      <span>强度规则</span>
                      <span>阈值</span>
                      <span>启用</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {strategyData.timelineSignals.rules.map((rule: any) => (
                        <div key={rule.id} className="grid grid-cols-[40px_80px_60px_50px_1fr_100px_80px_40px] gap-0 text-[10px] px-2 py-1.5 border-t border-border/50 hover:bg-muted/20 items-center">
                          <span className="font-mono text-muted-foreground">{rule.priority}</span>
                          <span className="font-medium">{rule.name}</span>
                          <span>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${getCategoryColor(
                              rule.name.includes("MACD") || rule.name.includes("DIF") ? "MACD" :
                              rule.name.includes("均价") || rule.name.includes("突破") ? "VWAP" :
                              rule.name.includes("放量") ? "VOLUME" :
                              rule.name.includes("RSI") ? "RSI" :
                              rule.name.includes("布林") ? "BOLL" :
                              rule.name.includes("连续缩量") || rule.name.includes("脉冲") ? "VOLUME_PATTERN" :
                              rule.name.includes("止损") ? "STOPLOSS" :
                              rule.name.includes("量价") || rule.name.includes("量缩") ? "DIVERGENCE" :
                              rule.name.includes("昨收") ? "SUPPORT" : "MOMENTUM"
                            )}`}>
                              {rule.name.includes("MACD") || rule.name.includes("DIF") ? "MACD" :
                               rule.name.includes("均价") || rule.name.includes("突破") ? "VWAP" :
                               rule.name.includes("放量") ? "量" :
                               rule.name.includes("RSI") ? "RSI" :
                               rule.name.includes("布林") ? "BOLL" :
                               rule.name.includes("连续缩量") || rule.name.includes("脉冲") ? "量态" :
                               rule.name.includes("止损") ? "止损" :
                               rule.name.includes("量价") || rule.name.includes("量缩") ? "背离" :
                               rule.name.includes("昨收") ? "支撑" : "动量"}
                            </Badge>
                          </span>
                          <span>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${rule.type === "stoploss" ? "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800" : getSignalBadge(rule.type)}`}>
                              {rule.type === "buy" ? "买" : rule.type === "stoploss" ? "止损" : "卖"}
                            </Badge>
                          </span>
                          <span className="font-mono text-muted-foreground truncate" title={rule.condition}>
                            {rule.condition}
                          </span>
                          <span className="text-muted-foreground">
                            {rule.strengthRules?.map((sr: any, si: number) => (
                              <span key={si}>
                                {si > 0 && " | "}
                                <span className={sr.strength === "strong" ? "text-red-500" : sr.strength === "weak" ? "text-yellow-600" : "text-orange-500"}>
                                  {sr.strength === "strong" ? "强" : sr.strength === "medium" ? "中" : "弱"}
                                </span>
                              </span>
                            ))}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {rule.threshold
                              ? Array.isArray(rule.threshold)
                                ? rule.threshold.map((t: any) => t.value).join("/")
                                : rule.threshold.value
                              : "--"}
                          </span>
                          <span className="text-center text-green-500">✓</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Post-process note */}
                  <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                    <EyeOff className="h-3 w-3" />
                    {strategyData.timelineSignals.postProcess.name}：{strategyData.timelineSignals.postProcess.description}
                  </div>
                </div>

                {/* DB Factors Table */}
                {strategyData.dbFactors && strategyData.dbFactors.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      数据库因子配置
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[40px_70px_55px_45px_1fr_70px_35px_35px] gap-0 text-[10px] bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
                        <span>优先</span>
                        <span>名称</span>
                        <span>类别</span>
                        <span>方向</span>
                        <span>描述</span>
                        <span>模式</span>
                        <span>启用</span>
                        <span>操作</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {strategyData.dbFactors.map((factor: any) => (
                          <div key={factor.id} className="grid grid-cols-[40px_70px_55px_45px_1fr_70px_35px_35px] gap-0 text-[10px] px-2 py-1.5 border-t border-border/50 hover:bg-muted/20 items-center">
                            <span className="font-mono text-muted-foreground">{factor.priority}</span>
                            <span className="font-medium">{factor.name}</span>
                            <span>
                              <Badge variant="outline" className={`text-[9px] h-4 px-1 ${getCategoryColor(factor.category)}`}>
                                {factor.category}
                              </Badge>
                            </span>
                            <span>
                              <Badge variant="outline" className={`text-[9px] h-4 px-1 ${factor.signalType === "stoploss" ? "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800" : getSignalBadge(factor.signalType)}`}>
                                {factor.signalType === "buy" ? "买" : factor.signalType === "stoploss" ? "止损" : "卖"}
                              </Badge>
                            </span>
                            <span className="text-muted-foreground truncate" title={factor.description}>{factor.description}</span>
                            <span className="font-mono text-muted-foreground truncate" title={factor.tMode}>{factor.tMode || "--"}</span>
                            <span>
                              <button
                                onClick={() => handleToggleFactor(factor.id, factor.enabled)}
                                className={`${factor.enabled ? "text-green-500" : "text-muted-foreground"}`}
                                title={factor.enabled ? "点击禁用" : "点击启用"}
                              >
                                {factor.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </button>
                            </span>
                            <span>
                              <button
                                onClick={() => handleDeleteFactor(factor.id)}
                                className="text-muted-foreground hover:text-destructive"
                                title="删除"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 逻辑流程 ── */}
            {activeTab === "logic" && strategyData && (
              <div className="space-y-6">
                {/* Execution Flow - Vertical Timeline */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {strategyData.logicFlow.name}
                  </div>
                  <div className="space-y-0">
                    {strategyData.logicFlow.steps.map((step: any, idx: number) => {
                      const dbStep = strategyData.dbLogicSteps?.find((s: any) => s.logicOrder === step.step);
                      const stepCategory = dbStep?.category || "general";
                      return (
                        <div key={step.step} className="flex items-start gap-3">
                          {/* Timeline line + dot */}
                          <div className="flex flex-col items-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${getLogicCategoryColor(stepCategory)}`}>
                              {step.step}
                            </div>
                            {idx < strategyData.logicFlow.steps.length - 1 && (
                              <div className="w-0.5 h-8 bg-border" />
                            )}
                          </div>
                          {/* Content */}
                          <div className="flex-1 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{step.name}</span>
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                {getLogicCategoryIcon(stepCategory)}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{step.description}</p>
                            {dbStep && !dbStep.isActive && (
                              <Badge variant="outline" className="text-[9px] h-4 mt-1 text-muted-foreground">已禁用</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Decision Tree - Flowchart Layout */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    决策树
                  </div>
                  <div className="space-y-2">
                    {strategyData.logicFlow.decisionTree.map((node: any, idx: number) => (
                      <div key={idx} className="flex items-stretch gap-2">
                        {/* Question */}
                        <div className="flex-1 p-2 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800">
                          <div className="text-[10px] font-medium text-purple-700 dark:text-purple-300">{node.question}</div>
                        </div>
                        {/* Yes/No branches */}
                        <div className="flex flex-col gap-1 flex-1">
                          <div className="p-1.5 rounded border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-[10px]">
                            <span className="text-red-600 dark:text-red-400 font-medium">是 → </span>
                            <span className="text-muted-foreground">{node.yes}</span>
                          </div>
                          <div className="p-1.5 rounded border border-muted bg-muted/30 text-[10px]">
                            <span className="font-medium text-muted-foreground">否 → </span>
                            <span className="text-muted-foreground">{node.no}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DB Logic Steps */}
                {strategyData.dbLogicSteps && strategyData.dbLogicSteps.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      数据库逻辑步骤
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[40px_1fr_1fr_60px_50px] gap-0 text-[10px] bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
                        <span>序号</span>
                        <span>名称</span>
                        <span>描述</span>
                        <span>类别</span>
                        <span>状态</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {strategyData.dbLogicSteps.map((logic: any) => (
                          <div key={logic.id} className="grid grid-cols-[40px_1fr_1fr_60px_50px] gap-0 text-[10px] px-2 py-1.5 border-t border-border/50 hover:bg-muted/20 items-center">
                            <span className="font-mono text-muted-foreground">{logic.logicOrder}</span>
                            <span className="font-medium">{logic.name}</span>
                            <span className="text-muted-foreground truncate" title={logic.description}>{logic.description}</span>
                            <span>
                              <Badge variant="outline" className={`text-[9px] h-4 px-1 ${getCategoryColor(logic.category?.toUpperCase())}`}>
                                {logic.category}
                              </Badge>
                            </span>
                            <span className={logic.isActive ? "text-green-500" : "text-muted-foreground"}>
                              {logic.isActive ? "启用" : "禁用"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 数据源 ── */}
            {activeTab === "datasource" && strategyData && (
              <div className="space-y-3">
                {Object.entries(strategyData.dataSources).map(([key, ds]: [string, any]) => (
                  <div key={key} className="p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{ds.name}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{key}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {ds.provider && (
                        <>
                          <span className="text-muted-foreground">数据源</span>
                          <span className="font-mono">{ds.provider}</span>
                        </>
                      )}
                      {ds.primary && (
                        <>
                          <span className="text-muted-foreground">主要源</span>
                          <span className="font-mono">{ds.primary.provider} ({ds.primary.interval})</span>
                        </>
                      )}
                      {ds.fallback && (
                        <>
                          <span className="text-muted-foreground">降级源</span>
                          <span className="font-mono">{ds.fallback.provider} ({ds.fallback.interval})</span>
                        </>
                      )}
                      {ds.interval && (
                        <>
                          <span className="text-muted-foreground">周期</span>
                          <span className="font-mono">{ds.interval}</span>
                        </>
                      )}
                      {ds.refreshInterval && (
                        <>
                          <span className="text-muted-foreground">刷新间隔</span>
                          <span className="font-mono">{ds.refreshInterval}{ds.refreshUnit || "秒"}</span>
                        </>
                      )}
                      {ds.intervals && (
                        <>
                          <span className="text-muted-foreground">支持周期</span>
                          <span className="font-mono">{ds.intervals.join(", ")}</span>
                        </>
                      )}
                      {ds.defaultInterval && (
                        <>
                          <span className="text-muted-foreground">默认周期</span>
                          <span className="font-mono">{ds.defaultInterval}</span>
                        </>
                      )}
                      {ds.defaultBars && (
                        <>
                          <span className="text-muted-foreground">默认K线数</span>
                          <span className="font-mono">{ds.defaultBars}</span>
                        </>
                      )}
                      {ds.barsPerDay && (
                        <>
                          <span className="text-muted-foreground">每日K线数</span>
                          <span className="font-mono">{ds.barsPerDay}</span>
                        </>
                      )}
                    </div>
                    {ds.tradingHours && (
                      <div className="mt-2">
                        <span className="text-[10px] text-muted-foreground">交易时段：</span>
                        {ds.tradingHours.map((th: any) => (
                          <Badge key={th.session} variant="outline" className="text-[9px] h-4 ml-1">
                            {th.session} {th.start}-{th.end}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab: 风控参数 ── */}
            {activeTab === "risk" && strategyData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{strategyData.riskControl.name}</span>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[100px_1fr_80px_80px] gap-0 text-[10px] bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
                    <span>参数</span>
                    <span>说明</span>
                    <span>值</span>
                    <span>可选值</span>
                  </div>
                  {strategyData.riskControl.rules.map((rule: any) => (
                    <div key={rule.key} className="grid grid-cols-[100px_1fr_80px_80px] gap-0 text-[10px] px-2 py-1.5 border-t border-border/50 hover:bg-muted/20 items-center">
                      <span className="font-medium">{rule.label}</span>
                      <span className="text-muted-foreground">{rule.description}</span>
                      <span className="font-mono">
                        {rule.value !== undefined ? String(rule.value) : "--"}
                        {rule.unit && <span className="text-muted-foreground ml-0.5">{rule.unit}</span>}
                      </span>
                      <span className="text-muted-foreground">
                        {rule.values ? rule.values.join("/") : "--"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Tab: 趋势识别 ── */}
            {activeTab === "regime" && (
              <div className="space-y-4">
                {/* 标题 */}
                <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-violet-500" />
                    <span className="text-sm font-bold">趋势识别引擎 v3.2</span>
                    <Badge variant="outline" className="text-[10px] h-5 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300">
                      5维评分
                    </Badge>
                  </div>
                  <div className="text-xs text-foreground/80">
                    基于分时数据的VWAP斜率、价格动量、波动率、价格位置、趋势一致性五个维度综合评分，自动识别当前行情属于上涨趋势、下跌趋势还是震荡行情，并据此调整做T策略的信号强度和仓位比例。
                  </div>
                </div>

                {/* 五维评分体系 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">五维评分体系</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    {[
                      { dim: "VWAP斜率", weight: "30%", icon: "📈", color: "bg-blue-500",
                        desc: "对均价线做线性回归，计算斜率方向和大小。斜率正=均线上行，负=均线下行，零=走平。",
                        formula: "slope = Σ(x·y) - n·x̄·ȳ / Σ(x²) - n·x̄²",
                        keypoint: "斜率归一化后，每万分之0.1/分钟视为有效趋势" },
                      { dim: "价格动量", weight: "25%", icon: "🚀", color: "bg-orange-500",
                        desc: "近30根分钟线的涨跌幅加权求和，越近的数据权重越高，反映短期多空力量。",
                        formula: "momentum = Σ(changeᵢ × wᵢ), wᵢ = i/n",
                        keypoint: "动量>0.2为多头有效，<-0.2为空头有效" },
                      { dim: "波动率", weight: "20%", icon: "📊", color: "bg-purple-500",
                        desc: "涨跌幅的标准差，衡量价格波动幅度。低波动=横盘/窄幅，高波动=趋势或剧烈震荡。",
                        formula: "volatility = √(Σ(x-μ)²/n)",
                        keypoint: "波动率<0.3%为极低（横盘末期），>1%为高波动" },
                      { dim: "价格位置", weight: "15%", icon: "🎯", color: "bg-emerald-500",
                        desc: "当前价格相对VWAP和昨收价的位置。站稳均线上方+高于昨收=多头，反之空头。",
                        formula: "position = (price-VWAP)/VWAP × 20, 限[-1,1]",
                        keypoint: "偏离VWAP 5%以上为满分，高于昨收0.5%以上加成" },
                      { dim: "趋势一致性", weight: "10%", icon: "🔗", color: "bg-amber-500",
                        desc: "价格在均价线同一侧的比例。一致性高=单边趋势，一致性低=反复穿越均线=震荡。",
                        formula: "consistency = max(above, below) / total",
                        keypoint: ">0.7为高一致性（趋势），0.5附近为低一致性（震荡）" },
                    ].map((item) => (
                      <div key={item.dim} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{item.icon}</span>
                          <span className="text-xs font-bold">{item.dim}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">
                            权重{item.weight}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</p>
                        <div className="bg-muted/50 rounded px-2 py-1">
                          <code className="text-[9px] font-mono text-foreground/70">{item.formula}</code>
                        </div>
                        <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                          <span className="shrink-0 mt-px">💡</span>
                          <span>{item.keypoint}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 综合评分公式 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">综合评分公式</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="bg-card rounded px-3 py-2 border border-border">
                      <code className="text-[10px] font-mono leading-relaxed">
                        trendScore = slope×30 + momentum×0.25 + vwapPosition×15 + prevClose加成 + consistency加成
                      </code>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <span className="text-red-500 font-bold shrink-0">多头加成</span>
                        <span className="text-muted-foreground">价格&gt;昨收+0.5%时+10分；一致性&gt;0.7且在均线上方+10分</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30">
                        <span className="text-green-500 font-bold shrink-0">空头加成</span>
                        <span className="text-muted-foreground">价格&lt;昨收-0.5%时-10分；一致性&gt;0.7且在均线下方-10分</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 四种行情判断规则 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">四种行情判断规则</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { regime: "上升通道", icon: "↑", color: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20",
                        badge: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
                        conditions: ["综合趋势得分 > 8", "VWAP斜率 > 0.05 (万分之一/分钟)", "加权动量 > +0.2%"],
                        meaning: "均价线持续上行，价格站稳均线上方，多头力量占优",
                        strategy: "谨慎做T，只做正T，T仓降至20%，买回要快，避免卖飞",
                        signalAdj: "所有信号强度降1级" },
                      { regime: "下跌趋势", icon: "↓", color: "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20",
                        badge: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
                        conditions: ["综合趋势得分 < -8", "VWAP斜率 < -0.05 (万分之一/分钟)", "加权动量 < -0.2%"],
                        meaning: "均价线持续下行，价格被压制在均线下方，空头力量主导",
                        strategy: "不建议做T，仅正T卖出，T仓降至10-15%",
                        signalAdj: "禁止买入信号，卖出信号强度降1级" },
                      { regime: "震荡市", icon: "↔", color: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
                        badge: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
                        conditions: ["综合趋势得分在-8到+8之间", "VWAP走平或斜率方向与动量不一致", "价格反复穿越均价线"],
                        meaning: "均价线走平，价格在均线附近上下波动，多空力量均衡",
                        strategy: "最适合做T！正T为主，高抛低吸，每日1-2次T",
                        signalAdj: "信号强度不调整，全部正常" },
                      { regime: "横盘末期", icon: "→", color: "border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20",
                        badge: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
                        conditions: ["波动率 < 0.3%", "价格偏离昨收 < 0.5%", "VWAP斜率接近零"],
                        meaning: "价格极窄幅波动，多空双方僵持，即将选择方向突破",
                        strategy: "减少做T频率，等待方向明确后再操作",
                        signalAdj: "信号强度降2级，买卖信号均受限" },
                    ].map((item) => (
                      <div key={item.regime} className={`rounded-lg border p-3 space-y-2 ${item.color}`}>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] h-5 ${item.badge}`}>{item.icon} {item.regime}</Badge>
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-[10px]">
                            <span className="font-semibold text-foreground/80">判定条件：</span>
                            <ul className="mt-1 space-y-0.5 ml-3">
                              {item.conditions.map((c, ci) => (
                                <li key={ci} className="text-muted-foreground flex items-start gap-1">
                                  <span className="text-foreground/40 shrink-0">•</span>
                                  <span className="font-mono">{c}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="text-[10px]">
                            <span className="font-semibold text-foreground/80">行情含义：</span>
                            <span className="text-muted-foreground ml-1">{item.meaning}</span>
                          </div>
                          <div className="text-[10px]">
                            <span className="font-semibold text-foreground/80">做T策略：</span>
                            <span className="text-muted-foreground ml-1">{item.strategy}</span>
                          </div>
                          <div className="text-[10px]">
                            <span className="font-semibold text-foreground/80">信号调整：</span>
                            <span className="text-amber-600 dark:text-amber-400 ml-1">{item.signalAdj}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 识别流程图 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">识别流程</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      {[
                        { label: "分时数据", sub: "price/VWAP/change", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "计算5维指标", sub: "slope/momentum/volatility/position/consistency", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "综合评分", sub: "trendScore = Σ(维度×权重)", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "阈值判定", sub: "score±8 / slope±0.05 / momentum±0.2", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "行情标签", sub: "上升/下跌/震荡/横盘", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
                        { label: "→", sub: "", color: "text-muted-foreground" },
                        { label: "策略调整", sub: "仓位/信号/强度", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
                      ].map((step, si) => (
                        <div key={si} className="flex flex-col items-center">
                          {step.label === "→" ? (
                            <span className="text-muted-foreground font-bold">→</span>
                          ) : (
                            <div className={`rounded-md px-2 py-1 border border-current/10 ${step.color}`}>
                              <div className="font-semibold">{step.label}</div>
                              {step.sub && <div className="text-[8px] opacity-60 font-mono">{step.sub}</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 置信度说明 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">置信度计算</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-[10px]">
                    <p className="text-muted-foreground">置信度反映识别结果的可靠程度（0-100%），综合考虑了趋势得分的绝对值和趋势一致性：</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2 rounded bg-card border border-border">
                        <div className="font-semibold text-foreground/80 mb-1">上升/下跌趋势</div>
                        <code className="text-[9px] font-mono">confidence = 40 + min(|score|, 40) + consistency × 20</code>
                        <p className="text-[9px] text-muted-foreground mt-1">趋势越强、一致性越高，置信度越高</p>
                      </div>
                      <div className="p-2 rounded bg-card border border-border">
                        <div className="font-semibold text-foreground/80 mb-1">横盘末期</div>
                        <code className="text-[9px] font-mono">confidence = 50 + (1 - volatility/0.3) × 40</code>
                        <p className="text-[9px] text-muted-foreground mt-1">波动率越低，横盘判定越确定</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: 核心逻辑 ── */}
            {activeTab === "corelogic" && (
              <div className="space-y-4">
                {/* 标题 */}
                <div className="p-4 rounded-lg border border-border bg-gradient-to-r from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="h-4 w-4 text-cyan-500" />
                    <span className="text-sm font-bold">做T核心逻辑 — 提升胜率的十大维度</span>
                    <Badge variant="outline" className="text-[10px] h-5 bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300">
                      v3.6
                    </Badge>
                  </div>
                  <div className="text-xs text-foreground/80">
                    做T的胜负不只取决于单次信号，而是一套完整的决策体系。以下十个维度构成了高胜率做T的核心逻辑框架，每个维度都是独立的风控/增益环节，叠加使用可显著提升整体胜率。
                  </div>
                </div>

                {/* 维度1: 大盘联动 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/10 dark:to-indigo-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">1</Badge>
                    <span className="text-xs font-bold">大盘联动 — 顺大势做小T</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 15%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T不是孤立的个股行为，大盘走势决定了整体做多/做空的安全边际。当前系统已实现深证成指、上证指数、创业板指三大指数的实时趋势识别，点击行情标签可切换查看。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-card border border-border">
                        <div className="font-semibold text-foreground/80 mb-1">✅ 正确做法</div>
                        <ul className="space-y-0.5 text-muted-foreground">
                          <li>• 大盘震荡 → 个股做T安全区，可积极操作</li>
                          <li>• 大盘上升 → 仅做正T，防卖飞</li>
                          <li>• 大盘下跌 → 仅做正T卖出，不做反T</li>
                          <li>• 大盘方向与个股方向一致时，信号可信度更高</li>
                        </ul>
                      </div>
                      <div className="p-2 rounded bg-card border border-border">
                        <div className="font-semibold text-red-500 mb-1">❌ 常见错误</div>
                        <ul className="space-y-0.5 text-muted-foreground">
                          <li>• 大盘跳水时做反T（买入后被套）</li>
                          <li>• 大盘暴涨时做正T（卖出后买不回来）</li>
                          <li>• 忽略指数与个股的背离（指数涨个股跌）</li>
                          <li>• 只看个股不看大盘，逆势操作</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度2: VWAP偏离回归 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/10 dark:to-teal-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">2</Badge>
                    <span className="text-xs font-bold">VWAP偏离回归 — 均价线是做T的锚</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 20%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>VWAP（成交量加权平均价）是日内最重要的参考线。价格偏离VWAP越远，回归的概率越高，这是做T最核心的统计学基础。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1">
                      <div className="font-semibold text-foreground/80 text-[10px]">偏离度与操作对应关系：</div>
                      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                        <div className="flex items-start gap-1 p-1.5 rounded bg-red-50 dark:bg-red-950/20">
                          <span className="text-red-500 font-bold shrink-0">+1.5%以上</span>
                          <span className="text-muted-foreground">正T卖出点（高抛）</span>
                        </div>
                        <div className="flex items-start gap-1 p-1.5 rounded bg-green-50 dark:bg-green-950/20">
                          <span className="text-green-500 font-bold shrink-0">-1.5%以上</span>
                          <span className="text-muted-foreground">正T买回点（低吸）</span>
                        </div>
                        <div className="flex items-start gap-1 p-1.5 rounded bg-amber-50 dark:bg-amber-950/20">
                          <span className="text-amber-500 font-bold shrink-0">±0.5%以内</span>
                          <span className="text-muted-foreground">震荡区，观望为主</span>
                        </div>
                        <div className="flex items-start gap-1 p-1.5 rounded bg-blue-50 dark:bg-blue-950/20">
                          <span className="text-blue-500 font-bold shrink-0">±1.0%附近</span>
                          <span className="text-muted-foreground">关注突破方向，准备操作</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                      <span className="shrink-0 mt-px">💡</span>
                      <span>关键技巧：震荡市中VWAP回归胜率极高（80%+），但在单边趋势中VWAP会持续偏离，此时应放弃VWAP回归策略，改为顺势操作。</span>
                    </div>
                  </div>
                </div>

                {/* 维度3: 量价配合 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-orange-50/50 to-amber-50/50 dark:from-orange-950/10 dark:to-amber-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300">3</Badge>
                    <span className="text-xs font-bold">量价配合 — 量在价先，无量不动</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 15%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>成交量是价格变动的燃料。做T时必须确认"放量方向"与"操作方向"一致，否则信号不可靠。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-card border border-border space-y-1.5">
                        <div className="font-semibold text-foreground/80 text-[10px]">量价健康组合 ✅</div>
                        <ul className="space-y-0.5 text-[9px]">
                          <li>• <span className="text-red-500 font-semibold">放量上涨</span> → 多头有力，正T买回时机</li>
                          <li>• <span className="text-green-500 font-semibold">放量下跌</span> → 空头有力，正T卖出时机</li>
                          <li>• <span className="text-red-500 font-semibold">缩量回踩VWAP</span> → 洗盘结束，低吸机会</li>
                          <li>• <span className="text-green-500 font-semibold">缩量反弹至VWAP</span> → 反弹无力，高抛机会</li>
                        </ul>
                      </div>
                      <div className="p-2 rounded bg-card border border-border space-y-1.5">
                        <div className="font-semibold text-red-500 text-[10px]">量价背离危险 ⚠️</div>
                        <ul className="space-y-0.5 text-[9px]">
                          <li>• <span className="font-semibold">缩量新高</span> → 上涨动力不足，随时回落</li>
                          <li>• <span className="font-semibold">缩量新低</span> → 恐慌不足，可能止跌</li>
                          <li>• <span className="font-semibold">放量滞涨</span> → 主力出货，不宜追高</li>
                          <li>• <span className="font-semibold">放量不跌</span> → 主力吸筹，不宜杀跌</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度4: MACD背驰 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-purple-50/50 to-violet-50/50 dark:from-purple-950/10 dark:to-violet-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300">4</Badge>
                    <span className="text-xs font-bold">MACD背驰 — 抓转折的利器</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 10%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>MACD背驰是判断趋势转折点最有效的技术之一。做T时利用背驰信号可以精准捕捉"高抛"和"低吸"的时机。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px]">
                        <span className="font-semibold text-red-500">顶背驰（卖出信号）：</span>
                        <span className="text-muted-foreground ml-1">价格创新高，但MACD红柱缩短/DIF不创新高 → 上涨动力衰竭，正T卖出</span>
                      </div>
                      <div className="text-[10px]">
                        <span className="font-semibold text-green-500">底背驰（买入信号）：</span>
                        <span className="text-muted-foreground ml-1">价格创新低，但MACD绿柱缩短/DIF不创新低 → 下跌动力衰竭，正T买回</span>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>分时MACD背驰比日线背驰更频繁，但也更灵敏。建议配合VWAP位置确认：底背驰+价格低于VWAP = 高胜率买点；顶背驰+价格高于VWAP = 高胜率卖点。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度5: 时段规律 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-rose-50/50 to-pink-50/50 dark:from-rose-950/10 dark:to-pink-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300">5</Badge>
                    <span className="text-xs font-bold">时段规律 — 做T的黄金时间窗</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 10%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>A股日内有明显的时段特征，不同时段的做T胜率差异极大。系统已将时间窗口纳入信号因子体系。</p>
                    <div className="space-y-1.5 mt-2">
                      {[
                        { time: "09:30-10:00", label: "开盘冲高/杀跌期", desc: "开盘前30分钟波动最大，方向不确定", action: "观望为主，不急于操作", color: "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30" },
                        { time: "10:00-10:30", label: "早盘确认期", desc: "开盘情绪消化，真实方向开始显现", action: "最佳正T卖出窗口（冲高回落）", color: "bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/30" },
                        { time: "10:30-11:30", label: "早盘震荡期", desc: "多空博弈，波动适中", action: "适合做T，低吸高抛", color: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30" },
                        { time: "13:00-13:30", label: "午盘方向期", desc: "午后开盘常出现方向选择", action: "确认方向后顺势做T", color: "bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30" },
                        { time: "14:00-14:30", label: "尾盘蓄势期", desc: "尾盘资金博弈加剧", action: "谨慎操作，防止尾盘拉升/杀跌", color: "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30" },
                        { time: "14:30-15:00", label: "尾盘定局期", desc: "趋势基本定型，日内结算", action: "只平仓不开仓，确保日内回转", color: "bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30" },
                      ].map((slot) => (
                        <div key={slot.time} className={`flex items-start gap-2 p-2 rounded border ${slot.color}`}>
                          <div className="shrink-0 text-[9px] font-mono font-bold text-foreground/80 w-24">{slot.time}</div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold text-foreground/80">{slot.label}</div>
                            <div className="text-[9px] text-muted-foreground">{slot.desc}</div>
                            <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">▸ {slot.action}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 维度6: 支撑阻力位 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-teal-50/50 to-cyan-50/50 dark:from-teal-950/10 dark:to-cyan-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300">6</Badge>
                    <span className="text-xs font-bold">支撑阻力位 — 价格的弹性边界</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 8%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T的核心逻辑是"高抛低吸"，而"高"和"低"的判断需要参考支撑阻力位。系统已将均线位纳入参考线显示。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80 mb-1">关键价格位识别方法：</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[9px]">
                        <div className="p-1.5 rounded bg-card border border-border">
                          <span className="font-semibold text-foreground/80">昨收价</span>
                          <span className="text-muted-foreground ml-1">— 多空分水岭，站稳=多，跌破=空</span>
                        </div>
                        <div className="p-1.5 rounded bg-card border border-border">
                          <span className="font-semibold text-foreground/80">VWAP均价</span>
                          <span className="text-muted-foreground ml-1">— 日内重心，偏离即回归</span>
                        </div>
                        <div className="p-1.5 rounded bg-card border border-border">
                          <span className="font-semibold text-foreground/80">MA5/MA10/MA20</span>
                          <span className="text-muted-foreground ml-1">— 短中期均线支撑/阻力</span>
                        </div>
                        <div className="p-1.5 rounded bg-card border border-border">
                          <span className="font-semibold text-foreground/80">日内高低点</span>
                          <span className="text-muted-foreground ml-1">— 突破/回踩的关键位</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>做T卖出点选择：价格触及上方阻力位（均线/VWAP上方偏离1.5%/日内高点）→ 正T卖出；买入点选择：价格回踩下方支撑位 → 正T买回。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度7: 正T与反T选择 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-yellow-50/50 to-lime-50/50 dark:from-yellow-950/10 dark:to-lime-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300">7</Badge>
                    <span className="text-xs font-bold">正T vs 反T — 方向比努力更重要</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 8%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T的第一步不是"何时操作"，而是"做正T还是反T"。方向选错，再精准的时机也白搭。系统已根据趋势识别自动推荐T方向。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2.5 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20 space-y-1.5">
                        <div className="text-[10px] font-bold text-red-600 dark:text-red-400">正T（先卖后买）</div>
                        <div className="text-[9px] text-muted-foreground space-y-0.5">
                          <p>① 手中已有持仓 → 高位卖出 → 低位买回</p>
                          <p>② 风险：卖飞（卖出后继续涨，买不回来）</p>
                          <p>③ 适用：震荡市、下跌市</p>
                          <p>④ 优势：即使做错也不加仓，最大损失是卖飞</p>
                        </div>
                        <div className="text-[9px] p-1.5 rounded bg-red-100/50 dark:bg-red-950/30">
                          <span className="font-semibold">胜率场景：</span> 震荡市中VWAP上方卖出，回踩VWAP买回
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/20 space-y-1.5">
                        <div className="text-[10px] font-bold text-green-600 dark:text-green-400">反T/倒T（先买后卖）</div>
                        <div className="text-[9px] text-muted-foreground space-y-0.5">
                          <p>① 手中已有持仓 → 低位加仓 → 高位卖出加仓部分</p>
                          <p>② 风险：加仓被套（买入后继续跌）</p>
                          <p>③ 适用：上升通道中</p>
                          <p>④ 劣势：做错会加大持仓，越套越深</p>
                        </div>
                        <div className="text-[9px] p-1.5 rounded bg-green-100/50 dark:bg-green-950/30">
                          <span className="font-semibold">胜率场景：</span> 上升通道中回踩VWAP买加仓，反弹卖出
                        </div>
                      </div>
                    </div>
                    <div className="text-[9px] text-red-500 dark:text-red-400 flex items-start gap-1 mt-1">
                      <span className="shrink-0 mt-px">⚠️</span>
                      <span>铁律：下跌趋势中严禁做反T！反T加仓被套是做T亏损的最大来源。</span>
                    </div>
                  </div>
                </div>

                {/* 维度8: 信号叠加确认 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-indigo-50/50 to-blue-50/50 dark:from-indigo-950/10 dark:to-blue-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300">8</Badge>
                    <span className="text-xs font-bold">信号叠加确认 — 多因子共振才出手</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 8%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>单一信号容易产生假信号，多个信号同时确认时胜率大幅提升。系统当前有31个策略因子，信号合并后可看到叠加触发情况。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80">信号强度与胜率对应关系：</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[9px]">
                          <Badge className="text-[8px] h-4 px-1.5 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">强信号</Badge>
                          <span className="text-muted-foreground">3个以上因子同时触发 → 胜率 75%+ → 可操作</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <Badge className="text-[8px] h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">中信号</Badge>
                          <span className="text-muted-foreground">2个因子同时触发 → 胜率 55-65% → 谨慎操作</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <Badge className="text-[8px] h-4 px-1.5 bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-300">弱信号</Badge>
                          <span className="text-muted-foreground">仅1个因子触发 → 胜率 40-50% → 观望为主</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>图表上的信号标记已合并同类信号并标注触发数量（如"×3"），点击标记可展开查看所有触发的因子名称。建议仅操作"强信号"标注的点。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度9: 仓位控制 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-fuchsia-50/50 to-pink-50/50 dark:from-fuchsia-950/10 dark:to-pink-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-300">9</Badge>
                    <span className="text-xs font-bold">仓位控制 — 活下来比赚得多更重要</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">风控贡献 3%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T的仓位管理直接决定了亏损时的绝对金额。仓位过重=赌博，仓位过轻=无效。系统已根据行情自动调整T仓比例。</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                      {[
                        { regime: "震荡市", ratio: "30-40%", color: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800", note: "最安全，可满T仓" },
                        { regime: "上升通道", ratio: "15-20%", color: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800", note: "防卖飞，轻仓" },
                        { regime: "下跌趋势", ratio: "10-15%", color: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800", note: "仅正T，极轻仓" },
                        { regime: "横盘末期", ratio: "5-10%", color: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800", note: "方向不明，极轻" },
                      ].map((item) => (
                        <div key={item.regime} className={`p-2 rounded border text-center ${item.color}`}>
                          <div className="text-[10px] font-semibold">{item.regime}</div>
                          <div className="text-sm font-bold text-primary my-0.5">{item.ratio}</div>
                          <div className="text-[9px] text-muted-foreground">{item.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 维度10: 止损纪律 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-red-50/50 to-orange-50/50 dark:from-red-950/10 dark:to-orange-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300">10</Badge>
                    <span className="text-xs font-bold">止损纪律 — 做T的最后一道防线</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">风控贡献 3%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>做T最大的敌人不是看错方向，而是看错后不止损。系统已内置止损信号（黄色菱形标记），触发时必须执行。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80">止损触发条件：</div>
                      <ul className="space-y-0.5 text-[9px]">
                        <li>• 正T卖出后价格涨幅超过1.5% → 止损（买回），承认卖飞</li>
                        <li>• 反T买入后价格跌幅超过1.5% → 止损（卖出加仓），承认做反</li>
                        <li>• 日内亏损达到总持仓的0.5% → 停止当日所有做T操作</li>
                      </ul>
                      <div className="text-[9px] text-red-500 dark:text-red-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">🚫</span>
                        <span>绝对禁止：亏损后加大仓位"摊薄成本"、扛单过夜、"这次一定对"的侥幸心理。做T是概率游戏，止损是保命符。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 综合胜率公式 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">综合胜率提升公式</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="bg-card rounded px-3 py-2 border border-border">
                      <code className="text-[10px] font-mono leading-relaxed">
                        做T胜率 = 基础胜率(50%) × (1 + Σ(维度贡献率))
                      </code>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-start gap-2 p-2 rounded bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-900/30">
                        <span className="text-cyan-500 font-bold shrink-0">单维度使用</span>
                        <span className="text-muted-foreground">例如只用VWAP回归 → 胜率 = 50% × (1 + 20%) = 60%</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                        <span className="text-emerald-500 font-bold shrink-0">五维度叠加</span>
                        <span className="text-muted-foreground">VWAP+量价+大盘+时段+MACD → 胜率 = 50% × (1 + 70%) = 85%</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                        <span className="text-amber-500 font-bold shrink-0">全维度叠加</span>
                        <span className="text-muted-foreground">10维度全部满足 → 理论胜率可达90%+（但触发极少）</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <span className="text-red-500 font-bold shrink-0">实际建议</span>
                        <span className="text-muted-foreground">追求5-6维度叠加即可，胜率75-80%，操作频率适中</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-muted-foreground flex items-start gap-1 mt-1">
                      <span className="shrink-0 mt-px">📌</span>
                      <span>注意：维度之间并非完全独立，实际叠加效果会有边际递减。以上公式仅为概念性说明，真实胜率需根据个股特性和市场环境动态评估。</span>
                    </div>
                  </div>
                </div>

                {/* 做T Checklist */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">做T前快速检查清单</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                    {[
                      { check: "大盘趋势是否确认？", desc: "震荡/上升可做T，下跌仅正T卖出", ok: "✅" },
                      { check: "当前VWAP偏离度是否合适？", desc: "偏离VWAP 1%以上才有做T空间", ok: "✅" },
                      { check: "量价是否配合？", desc: "操作方向需与放量方向一致", ok: "✅" },
                      { check: "是否在合适的时间窗口？", desc: "10:00-10:30卖出，10:30-11:30低吸", ok: "✅" },
                      { check: "信号是否≥2个因子确认？", desc: "弱信号不做，至少中等强度", ok: "✅" },
                      { check: "仓位是否在控制范围内？", desc: "震荡市30-40%，下跌10-15%", ok: "✅" },
                      { check: "止损位是否已设定？", desc: "做T前先想好错了怎么办", ok: "✅" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] p-1.5 rounded bg-card border border-border">
                        <span className="shrink-0">{item.ok}</span>
                        <span className="font-semibold text-foreground/80 shrink-0">{item.check}</span>
                        <span className="text-muted-foreground">— {item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 进阶维度分隔 ── */}
                <div className="pt-2">
                  <div className="p-3 rounded-lg border border-dashed border-cyan-300 dark:border-cyan-700 bg-gradient-to-r from-cyan-50/60 to-sky-50/60 dark:from-cyan-950/20 dark:to-sky-950/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-cyan-500" />
                      <span className="text-sm font-bold">进阶维度 — 从60%到80%的关键跳板</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      以上10个基础维度是做T的"必修课"，以下进阶维度则决定了你能否从"偶尔赚钱"升级为"稳定盈利"。进阶维度更注重<strong className="text-foreground/80">跨市场联动</strong>、<strong className="text-foreground/80">个股特性</strong>和<strong className="text-foreground/80">行为规律</strong>的深度利用。
                    </div>
                  </div>
                </div>

                {/* 维度11: 板块联动 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-sky-50/50 to-blue-50/50 dark:from-sky-950/10 dark:to-blue-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300">11</Badge>
                    <span className="text-xs font-bold">板块联动 — 跟着板块风向走</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 8%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>个股不是孤立的，同一板块的股票往往同涨同跌。当板块整体启动时，个股做T的胜率显著提升；当板块退潮时，即使个股信号好看也要谨慎。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-card border border-border space-y-1.5">
                        <div className="font-semibold text-foreground/80 text-[10px]">板块信号确认 ✅</div>
                        <ul className="space-y-0.5 text-[9px]">
                          <li>• <span className="text-red-500 font-semibold">板块集体拉升</span> → 龙头不倒可做正T卖出</li>
                          <li>• <span className="text-green-500 font-semibold">板块集体回调</span> → 跌到位后可做正T买回</li>
                          <li>• <span className="text-red-500 font-semibold">板块龙头涨停</span> → 跟风股冲高是卖出时机</li>
                          <li>• <span className="text-green-500 font-semibold">板块利空出尽</span> → 恐慌低点可低吸</li>
                        </ul>
                      </div>
                      <div className="p-2 rounded bg-card border border-border space-y-1.5">
                        <div className="font-semibold text-red-500 text-[10px]">板块背离危险 ⚠️</div>
                        <ul className="space-y-0.5 text-[9px]">
                          <li>• <span className="font-semibold">板块下跌+个股独涨</span> → 补跌风险大，不做反T</li>
                          <li>• <span className="font-semibold">板块上涨+个股独跌</span> → 个股问题，不抄底</li>
                          <li>• <span className="font-semibold">板块轮动切换</span> → 前期热点退潮时减少做T</li>
                          <li>• <span className="font-semibold">冷门板块突然异动</span> → 多为一日游，不追高</li>
                        </ul>
                      </div>
                    </div>
                    <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                      <span className="shrink-0 mt-px">💡</span>
                      <span>实操技巧：做T前先看同板块3-5只核心股的分时走势，如果方向一致则信号可信度+20%；如果出现分化则降低仓位或放弃操作。</span>
                    </div>
                  </div>
                </div>

                {/* 维度12: 竞价预判 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-amber-50/50 to-yellow-50/50 dark:from-amber-950/10 dark:to-yellow-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">12</Badge>
                    <span className="text-xs font-bold">竞价预判 — 开盘前的第一手情报</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 5%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>A股9:15-9:25的集合竞价蕴含了大量信息。竞价高开/低开的幅度和量能，往往预示了开盘后30分钟的方向。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80 mb-1">竞价信号解读表：</div>
                      <div className="space-y-1">
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-red-50 dark:bg-red-950/20">
                          <span className="text-red-500 font-bold shrink-0 w-16">高开1%+</span>
                          <span className="text-muted-foreground">多头强势 → 开盘冲高是正T卖出窗口，注意10:00前后的冲高回落</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-green-50 dark:bg-green-950/20">
                          <span className="text-green-500 font-bold shrink-0 w-16">低开1%+</span>
                          <span className="text-muted-foreground">空头强势 → 开盘杀跌是正T买回窗口，等10:00前后止跌再操作</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-blue-50 dark:bg-blue-950/20">
                          <span className="text-blue-500 font-bold shrink-0 w-16">平开±0.3%</span>
                          <span className="text-muted-foreground">方向不明 → 等10:00后确认方向再做T，开盘不急操作</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-purple-50 dark:bg-purple-950/20">
                          <span className="text-purple-500 font-bold shrink-0 w-16">竞价放量</span>
                          <span className="text-muted-foreground">竞价量是前日1.5倍+ → 开盘波动大，做T空间大但风险也大</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度13: 资金流向 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-emerald-50/50 to-cyan-50/50 dark:from-emerald-950/10 dark:to-cyan-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">13</Badge>
                    <span className="text-xs font-bold">资金流向 — 跟着聪明钱走</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 7%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>主力资金的进出方向是判断个股短期走势的核心依据。做T时如果资金方向与操作方向一致，胜率大幅提升。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px]">
                        <div className="p-2 rounded bg-card border border-border">
                          <div className="font-semibold text-red-500 mb-1">主力净流入 + 正T卖出</div>
                          <span className="text-muted-foreground">主力在买你却卖？→ 不用怕，主力吸筹说明底部有支撑，卖出后回调概率大，能买回来</span>
                        </div>
                        <div className="p-2 rounded bg-card border border-border">
                          <div className="font-semibold text-green-500 mb-1">主力净流出 + 正T买回</div>
                          <span className="text-muted-foreground">主力在卖你却买？→ 危险！主力出货时低吸容易被套，应等主力流出放缓再操作</span>
                        </div>
                        <div className="p-2 rounded bg-card border border-border">
                          <div className="font-semibold text-blue-500 mb-1">北向资金持续流入</div>
                          <span className="text-muted-foreground">外资看好 → 正T安全边际高，卖飞概率低，可适当增加T仓</span>
                        </div>
                        <div className="p-2 rounded bg-card border border-border">
                          <div className="font-semibold text-amber-500 mb-1">北向资金持续流出</div>
                          <span className="text-muted-foreground">外资看空 → 减少做T频率，仅做正T卖出，不做反T加仓</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>核心原则：正T卖出的前提是"有人愿意高位接盘"（主力流入=有人接），正T买回的前提是"主力不再出货"（流出放缓=抛压减轻）。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度14: 隔夜外盘影响 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-violet-50/50 to-purple-50/50 dark:from-violet-950/10 dark:to-purple-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300">14</Badge>
                    <span className="text-xs font-bold">隔夜外盘 — 全局视野下的方向预判</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 5%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>A股开盘方向受隔夜外盘影响极大，特别是美股三大指数和A50期指。做T前了解外盘情况，可以提前预判开盘方向。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="space-y-1">
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-red-50 dark:bg-red-950/20">
                          <span className="text-red-500 font-bold shrink-0 w-20">美股大涨+A50涨</span>
                          <span className="text-muted-foreground">A股高开概率90%+ → 开盘冲高做正T卖出</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-green-50 dark:bg-green-950/20">
                          <span className="text-green-500 font-bold shrink-0 w-20">美股大跌+A50跌</span>
                          <span className="text-muted-foreground">A股低开概率90%+ → 等止跌做正T买回，开盘不追空</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-amber-50 dark:bg-amber-950/20">
                          <span className="text-amber-500 font-bold shrink-0 w-20">美股跌+A50反弹</span>
                          <span className="text-muted-foreground">A股可能低开高走 → 低位可做正T买回</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-blue-50 dark:bg-blue-950/20">
                          <span className="text-blue-500 font-bold shrink-0 w-20">外盘平静</span>
                          <span className="text-muted-foreground">A股按自身节奏走 → 以技术信号为主做T</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>关键时间点：A50期指在A股9:15竞价前已交易多时，其涨跌是最直接的A股开盘风向标。建议做T日先看A50走势再制定操作计划。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度15: 个股波动率特性 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-lime-50/50 to-green-50/50 dark:from-lime-950/10 dark:to-green-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-950 dark:text-lime-300">15</Badge>
                    <span className="text-xs font-bold">个股波动率特性 — 选对股票做对T</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 6%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>不是所有股票都适合做T。做T的前提是有足够的日内波动空间（振幅），波动率太低的股票做T成本都不够覆盖。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80 mb-1">个股做T适配度评估：</div>
                      <div className="space-y-1.5">
                        {[
                          { label: "高波动股", range: "日均振幅>3%", examples: "科技/半导体/小盘成长", suitability: "★★★★★", note: "做T空间大，但止损要严格", color: "bg-red-50 dark:bg-red-950/20" },
                          { label: "中波动股", range: "日均振幅1.5-3%", examples: "白酒/新能源/医药", suitability: "★★★★☆", note: "做T首选，空间够且波动可控", color: "bg-emerald-50 dark:bg-emerald-950/20" },
                          { label: "低波动股", range: "日均振幅<1.5%", examples: "银行/公用事业/大盘蓝筹", suitability: "★★☆☆☆", note: "做T空间小，手续费占比高", color: "bg-amber-50 dark:bg-amber-950/20" },
                          { label: "涨停/跌停股", range: "一字板", examples: "停牌复牌/ST", suitability: "☆☆☆☆☆", note: "无法做T，流动性为零", color: "bg-gray-50 dark:bg-gray-950/20" },
                        ].map((item) => (
                          <div key={item.label} className={`flex items-center gap-2 text-[9px] p-1.5 rounded ${item.color}`}>
                            <span className="font-bold shrink-0 w-20 text-foreground/80">{item.label}</span>
                            <span className="text-muted-foreground shrink-0 w-28">{item.range}</span>
                            <span className="text-amber-500 shrink-0 w-16">{item.suitability}</span>
                            <span className="text-muted-foreground">{item.note}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>做T选股公式：日均振幅 &gt; 1.5% + 日均成交额 &gt; 3亿 + 非ST + 流通市值 &gt; 100亿。满足以上条件的股票做T才有足够空间和流动性。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度16: 连续做T衰减效应 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-rose-50/50 to-red-50/50 dark:from-rose-950/10 dark:to-red-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300">16</Badge>
                    <span className="text-xs font-bold">连续做T衰减 — 贪多必失的数学原理</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">风控贡献 4%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>日内做T存在明显的边际递减效应：第1次T胜率最高，第2次降低，第3次以后胜率急剧下降。这是因为每次T操作都在消耗日内波动空间。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="text-[10px] font-semibold text-foreground/80 mb-1">日内做T次数与胜率关系：</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-bold w-16 text-foreground/80">第1次T</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{width: "75%"}} />
                          </div>
                          <span className="text-emerald-600 font-bold w-12 text-right">~75%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-bold w-16 text-foreground/80">第2次T</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{width: "55%"}} />
                          </div>
                          <span className="text-amber-600 font-bold w-12 text-right">~55%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-bold w-16 text-foreground/80">第3次T</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 rounded-full" style={{width: "38%"}} />
                          </div>
                          <span className="text-red-600 font-bold w-12 text-right">~38%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-bold w-16 text-foreground/80">第4次T+</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-red-800 rounded-full" style={{width: "25%"}} />
                          </div>
                          <span className="text-red-800 font-bold w-12 text-right">&lt;25%</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-red-500 dark:text-red-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">⚠️</span>
                        <span>铁律：每日最多做2次T。第1次T是"吃鱼身"，第2次T是"吃鱼尾"，第3次以后就是"啃鱼刺"——容易扎嘴。做T不是高频交易，贪多必失。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度17: 整数关口心理 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-teal-50/50 to-emerald-50/50 dark:from-teal-950/10 dark:to-emerald-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300">17</Badge>
                    <span className="text-xs font-bold">整数关口心理 — 价格的隐形引力</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 3%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>A股投资者对整数关口（如10/20/50/100元）有强烈的心理预期。价格在整数关口附近往往出现犹豫、反复，做T时可利用这一规律。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-card border border-border space-y-1">
                        <div className="font-semibold text-foreground/80 text-[10px]">整数关口下方</div>
                        <ul className="space-y-0.5 text-[9px] text-muted-foreground">
                          <li>• 价格从下方接近整数位 → 抛压增大</li>
                          <li>• 正T卖出好时机（冲关失败概率高）</li>
                          <li>• 一旦突破整数位 → 短期加速上涨</li>
                        </ul>
                      </div>
                      <div className="p-2 rounded bg-card border border-border space-y-1">
                        <div className="font-semibold text-foreground/80 text-[10px]">整数关口上方</div>
                        <ul className="space-y-0.5 text-[9px] text-muted-foreground">
                          <li>• 价格从上方回踩整数位 → 买盘增多</li>
                          <li>• 正T买回好时机（支撑有效概率高）</li>
                          <li>• 一旦跌破整数位 → 短期加速下跌</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度18: 波动率周期 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 dark:from-indigo-950/10 dark:to-violet-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300">18</Badge>
                    <span className="text-xs font-bold">波动率周期 — 收敛必扩张，扩张必收敛</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 5%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>波动率存在周期性规律：极低波动之后必然出现大波动（方向选择），高波动之后必然回归低波动（震荡收敛）。这是做T择时的重要参考。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="flex items-center gap-2 text-[9px]">
                        <div className="flex-1 flex items-center gap-1">
                          <span className="inline-block px-2 py-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">低波动收敛</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="inline-block px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-semibold">方向选择</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="inline-block px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-semibold">高波动扩张</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="inline-block px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold">回归收敛</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        <div className="p-1.5 rounded bg-card border border-border text-[9px]">
                          <span className="font-semibold text-emerald-500">低波动期（横盘末期）</span>
                          <span className="text-muted-foreground ml-1">减少做T，等方向明确。突破方向出来后的第一次T胜率最高。</span>
                        </div>
                        <div className="p-1.5 rounded bg-card border border-border text-[9px]">
                          <span className="font-semibold text-red-500">高波动期（趋势中）</span>
                          <span className="text-muted-foreground ml-1">T空间大但方向明确，只做顺势T。波动率开始收窄时停止做T。</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度19: 尾盘信号 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-orange-50/50 to-amber-50/50 dark:from-orange-950/10 dark:to-amber-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300">19</Badge>
                    <span className="text-xs font-bold">尾盘信号 — 明日操作的前瞻指标</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">胜率贡献 4%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>14:30-15:00的尾盘走势包含重要的前瞻信息。尾盘的方向和强度往往预示次日开盘方向，可用于规划次日做T策略。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="space-y-1">
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-red-50 dark:bg-red-950/20">
                          <span className="text-red-500 font-bold shrink-0 w-20">尾盘抢筹拉升</span>
                          <span className="text-muted-foreground">主力看好次日 → 次日高开概率大 → 提前规划正T卖出策略</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-green-50 dark:bg-green-950/20">
                          <span className="text-green-500 font-bold shrink-0 w-20">尾盘放量杀跌</span>
                          <span className="text-muted-foreground">恐慌出逃 → 次日低开可能大 → 提前规划正T买回策略</span>
                        </div>
                        <div className="flex items-start gap-2 text-[9px] p-1.5 rounded bg-blue-50 dark:bg-blue-950/20">
                          <span className="text-blue-500 font-bold shrink-0 w-20">尾盘窄幅平收</span>
                          <span className="text-muted-foreground">方向不明 → 次日按信号操作，不预判方向</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">💡</span>
                        <span>尾盘信号的核心价值：提前制定次日做T计划。有计划地做T比盘中临时决策胜率高20%以上。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 维度20: 消息面过滤 */}
                <div className="rounded-lg border border-border p-3 space-y-2 bg-gradient-to-r from-gray-50/50 to-slate-50/50 dark:from-gray-950/10 dark:to-slate-950/10">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300">20</Badge>
                    <span className="text-xs font-bold">消息面过滤 — 大事不做T，小事不慌张</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">风控贡献 3%</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                    <p>重大消息（财报/政策/突发事件）会打破一切技术分析的假设。做T是基于"历史规律重演"的策略，而重大消息创造的是"前所未有的新局面"。</p>
                    <div className="bg-muted/50 rounded p-2 mt-1 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="p-2 rounded border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
                          <div className="text-[10px] font-bold text-red-500 mb-1">🚫 禁止做T的消息日</div>
                          <ul className="space-y-0.5 text-[9px] text-muted-foreground">
                            <li>• 个股财报发布日（业绩不确定性）</li>
                            <li>• 央行议息会议日（宏观不确定性）</li>
                            <li>• 重大政策发布窗口期</li>
                            <li>• 个股重大事项公告日</li>
                          </ul>
                        </div>
                        <div className="p-2 rounded border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                          <div className="text-[10px] font-bold text-emerald-500 mb-1">✅ 消息消化后可做T</div>
                          <ul className="space-y-0.5 text-[9px] text-muted-foreground">
                            <li>• 利好消息高开低走 → 正T卖出窗口</li>
                            <li>• 利空消息低开高走 → 正T买回窗口</li>
                            <li>• 消息落地后波动率回归正常</li>
                            <li>• 市场过度反应后的修正行情</li>
                          </ul>
                        </div>
                      </div>
                      <div className="text-[9px] text-red-500 dark:text-red-400 flex items-start gap-1 mt-1">
                        <span className="shrink-0 mt-px">⚠️</span>
                        <span>核心原则：不确定时不做T。错过一次做T机会只是少赚，但在消息日做错T可能亏损数日的做T利润。宁可错过，不可做错。</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 进阶维度汇总 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">20维全量胜率叠加</span>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="bg-card rounded px-3 py-2 border border-border">
                      <code className="text-[10px] font-mono leading-relaxed">
                        基础10维(胜率85%) × 进阶10维加成 = 理论胜率上限 95%+
                      </code>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                      <div className="flex items-start gap-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                        <span className="text-emerald-500 font-bold shrink-0">实操建议</span>
                        <span className="text-muted-foreground">基础10维是日常必检项，进阶10维在关键节点检查即可</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                        <span className="text-amber-500 font-bold shrink-0">高频检查</span>
                        <span className="text-muted-foreground">板块联动+资金流向+波动率特性，这3个进阶维度值得每次做T前确认</span>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <span className="text-red-500 font-bold shrink-0">低频检查</span>
                        <span className="text-muted-foreground">竞价预判+外盘+消息面，这3个维度每天开盘前检查一次即可</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: 自定义因子 ── */}
            {activeTab === "customfactors" && (
              <CustomFactorsTab />
            )}

            {/* Loading state */}
            {loading && !strategyData && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                加载策略数据...
              </div>
            )}
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Component ────────────────────────────────────

export default function StockTAssistant() {
  const {
    symbol,
    quote,
    history,
    timeline,
    timelinePrevClose,
    interval,
    chartMode,
    loading,
    error,
    latestSignal,
    selectStock,
    changeInterval,
    changeChartMode,
    searchStocks,
    isAShare: isAShareStock,
  } = useStockData();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Menu Bar Stocks (persisted to localStorage) ──
  // Initialize with default to avoid hydration mismatch (localStorage read after mount)
  const [menuStocks, setMenuStocks] = useState<{ symbol: string; name: string }[]>(DEFAULT_ASHARES);
  // Read from localStorage after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("menuStocks");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Use microtask to avoid lint warning about setState in effect
          queueMicrotask(() => setMenuStocks(parsed));
        }
      }
    } catch {}
  }, []);

  // ── Market Index Regime Detection (深证/沪指/创业板) ──
  const [indexRegimes, setIndexRegimes] = useState<Record<IndexKey, RegimeDetail | null>>({ sz: null, sh: null, cyb: null });
  const [activeIndexKey, setActiveIndexKey] = useState<IndexKey>("sz");
  // Store full timeline data for mini charts
  const [indexTimelineData, setIndexTimelineData] = useState<Record<IndexKey, { items: TimelineItem[]; prevClose: number }>>({ sz: { items: [], prevClose: 0 }, sh: { items: [], prevClose: 0 }, cyb: { items: [], prevClose: 0 } });

  useEffect(() => {
    let cancelled = false;
    const fetchAllIndices = async () => {
      const results = await Promise.allSettled(
        INDEX_KEYS.map(async (key) => {
          const { symbol } = INDEX_CONFIG[key];
          const res = await fetch(`/api/stock/ashare-timeline?symbol=${encodeURIComponent(symbol)}`);
          if (!res.ok) return null;
          const data = await res.json();
          if (data.error || !data.items || data.items.length < 10) return null;
          return { regime: detectMarketRegimeDetail(data.items, data.prevClose || data.items[0].price), items: data.items as TimelineItem[], prevClose: data.prevClose || data.items[0].price };
        })
      );
      if (cancelled) return;
      setIndexRegimes(prev => {
        const next = { ...prev };
        INDEX_KEYS.forEach((key, i) => {
          if (results[i].status === "fulfilled" && results[i].value) {
            next[key] = results[i].value.regime;
          }
        });
        return next;
      });
      setIndexTimelineData(prev => {
        const next = { ...prev };
        INDEX_KEYS.forEach((key, i) => {
          if (results[i].status === "fulfilled" && results[i].value) {
            next[key] = { items: results[i].value.items, prevClose: results[i].value.prevClose };
          }
        });
        return next;
      });
    };
    fetchAllIndices();
    // Refresh every 60 seconds
    const timer = setInterval(fetchAllIndices, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Current displayed regime based on active index key
  const szIndexRegime = indexRegimes[activeIndexKey];

  // Cycle through indices on click
  const cycleIndexKey = useCallback(() => {
    setActiveIndexKey(prev => {
      const idx = INDEX_KEYS.indexOf(prev);
      return INDEX_KEYS[(idx + 1) % INDEX_KEYS.length];
    });
  }, []);

  // ── Sector Regime Detection (行业板块联动) ──
  const [sectorInfoRaw, setSectorInfoRaw] = useState<{ code: string; name: string } | null>(null);
  const [sectorRegimeRaw, setSectorRegimeRaw] = useState<RegimeDetail | null>(null);
  // Store sector timeline data for mini chart
  const [sectorTimelineData, setSectorTimelineData] = useState<{ items: TimelineItem[]; prevClose: number }>({ items: [], prevClose: 0 });

  // Derive effective sector data (null when not A-share)
  const sectorInfo = isAShareStock ? sectorInfoRaw : null;
  const sectorRegime = isAShareStock ? sectorRegimeRaw : null;

  // Fetch sector info + regime + timeline data
  useEffect(() => {
    if (!symbol || !isAShareStock) return;

    let cancelled = false;
    const fetchSectorData = async () => {
      try {
        // Step 1: Get sector info for the stock
        const infoRes = await fetch(`/api/stock/ashare-sector?symbol=${encodeURIComponent(symbol)}&type=full`);
        if (!infoRes.ok) { if (!cancelled) { setSectorInfoRaw(null); setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); } return; }
        const infoData = await infoRes.json();
        if (!infoData.success || !infoData.sectorInfo) {
          if (!cancelled) { setSectorInfoRaw(null); setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); }
          return;
        }

        const sInfo = infoData.sectorInfo;
        if (cancelled) return;
        setSectorInfoRaw({ code: sInfo.code, name: sInfo.name });

        // Step 2: Detect sector regime from timeline data + store timeline
        if (infoData.data && infoData.data.items && infoData.data.items.length >= 10) {
          const sectorPrevClose = infoData.data.prevClose || infoData.data.items[0].price;
          const regime = detectMarketRegimeDetail(infoData.data.items, sectorPrevClose);
          if (!cancelled) {
            setSectorRegimeRaw(regime);
            setSectorTimelineData({ items: infoData.data.items, prevClose: sectorPrevClose });
          }
        } else {
          if (!cancelled) { setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); }
        }
      } catch (e) {
        console.error("Sector regime fetch error:", e);
      }
    };

    fetchSectorData();
    // Refresh every 60 seconds
    const timer = setInterval(fetchSectorData, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbol, isAShareStock]);

  // Persist menu stocks to localStorage
  useEffect(() => {
    try { localStorage.setItem("menuStocks", JSON.stringify(menuStocks)); } catch {}
  }, [menuStocks]);

  // Check if current stock is in menu
  const isInMenu = menuStocks.some((s) => s.symbol === symbol);

  // Toggle current stock in menu bar
  const toggleMenuStock = useCallback(() => {
    if (!quote) return;
    setMenuStocks((prev) => {
      if (prev.some((s) => s.symbol === symbol)) {
        // Remove from menu
        return prev.filter((s) => s.symbol !== symbol);
      }
      // Add to menu (at the end, max 10 stocks)
      const next = [...prev, { symbol, name: quote.name || symbol }];
      return next.slice(-10);
    });
  }, [symbol, quote]);

  // ── DB Factor Overrides ──
  const [factorOverrides, setFactorOverrides] = useState<FactorOverride[]>([]);

  // Fetch enabled factors from DB on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stock/strategy");
        if (res.ok) {
          const data = await res.json();
          if (data.dbFactors && Array.isArray(data.dbFactors)) {
            setFactorOverrides(buildFactorOverridesFromDB(data.dbFactors));
          }
        }
      } catch (e) {
        console.error("Failed to fetch factor overrides:", e);
      }
    })();
  }, []);

  // ── Custom Factors from localStorage (v3.8) ──
  const [customFactors, setCustomFactors] = useState<CustomFactorDefinition[]>([]);

  // Load custom factors from localStorage on mount and periodically refresh
  useEffect(() => {
    const loadCustomFactors = () => {
      try {
        const saved = localStorage.getItem(CUSTOM_FACTORS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as CustomFactorDefinition[];
          setCustomFactors(parsed);
        } else {
          // Use built-in defaults if nothing saved
          setCustomFactors(BUILT_IN_CUSTOM_FACTORS);
        }
      } catch {
        setCustomFactors(BUILT_IN_CUSTOM_FACTORS);
      }
    };
    loadCustomFactors();
    // Refresh every 5 seconds to catch changes from CustomFactorsTab
    const timer = setInterval(loadCustomFactors, 5000);
    return () => clearInterval(timer);
  }, []);

  // Debounced search
  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

      if (!value.trim()) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      searchTimeoutRef.current = setTimeout(async () => {
        const results = await searchStocks(value);
        setSearchResults(results);
        setSearchLoading(false);
      }, 400);
    },
    [searchStocks]
  );

  const handleSelectStock = (sym: string) => {
    selectStock(sym);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    // Reset zoom levels when switching stocks
    setKlineVisibleBars(80);
    setTlZoomIdx(0);
  };

  // ── K-line zoom state ──
  const [klineVisibleBars, setKlineVisibleBars] = useState<number>(80); // default 80 bars visible
  const [klinePanOffset, setKlinePanOffset] = useState<number>(0); // pan offset for K-line (0 = rightmost/latest)
  const klineDragRef = useRef<{ startX: number; startPanOffset: number; isDragging: boolean }>({ startX: 0, startPanOffset: 0, isDragging: false });
  const klineChartContainerRef = useRef<HTMLDivElement>(null);
  const allChartData = history.filter((h) => h.close > 0);

  // ── Timeline zoom state ──
  const TL_ZOOM_LEVELS = [250, 180, 120, 90, 60]; // minutes visible: full day(250>242 ensures full view), ~3h, ~2h, 1.5h, 1h
  const [tlZoomIdx, setTlZoomIdx] = useState<number>(0); // default: full day (241 = full trading day)
  const [tlPanOffset, setTlPanOffset] = useState<number>(0); // pan offset for timeline (0 = rightmost/latest)
  const tlVisibleMinutes = TL_ZOOM_LEVELS[tlZoomIdx];

  // ── Timeline last data slot index (matches fullDayData indexing in TimeSharingPanel) ──
  const tlLastDataIdx = useMemo(() => {
    if (timeline.length === 0) return -1;
    const lastTime = timeline[timeline.length - 1].time;
    const [h, m] = lastTime.split(':').map(Number);
    // Morning: 09:30-11:30 (slots 0-120, 121 minutes), Afternoon: 13:00-15:00 (slots 121-241, 121 minutes)
    if (h < 12) {
      return (h - 9) * 60 + (m - 30);
    } else {
      return 121 + (h - 13) * 60 + m;
    }
  }, [timeline]);

  const tlZoomIn = (cursorRatio?: number) => {
    if (cursorRatio !== undefined && cursorRatio >= 0) {
      // Cursor-aware zoom: keep the data under cursor at the same relative position
      const oldVisible = TL_ZOOM_LEVELS[tlZoomIdx];
      const newIdx = Math.min(tlZoomIdx + 1, TL_ZOOM_LEVELS.length - 1);
      const newVisible = TL_ZOOM_LEVELS[newIdx];
      const lastDataIdx = tlLastDataIdx;
      const totalSlots = 242; // full trading day slots
      if (oldVisible >= totalSlots || lastDataIdx < 0) {
        // Currently in full-day view: cursorRatio maps to the full 242-slot range
        const cursorSlotIdx = cursorRatio * (totalSlots - 1);
        const newStartIdx = cursorSlotIdx - cursorRatio * (newVisible - 1);
        const newEndIdx = newStartIdx + newVisible - 1;
        const newPanOffset = Math.max(0, Math.round(lastDataIdx - newEndIdx));
        setTlZoomIdx(newIdx);
        setTlPanOffset(newPanOffset);
      } else {
        // Already zoomed: calculate from current pan offset
        const currentEndIdx = Math.min(lastDataIdx, Math.max(oldVisible - 1, lastDataIdx - tlPanOffset));
        const currentStartIdx = Math.max(0, currentEndIdx - oldVisible + 1);
        const cursorIdx = currentStartIdx + cursorRatio * (currentEndIdx - currentStartIdx);
        const newStartIdx = cursorIdx - cursorRatio * (newVisible - 1);
        const newEndIdx = newStartIdx + newVisible - 1;
        const newPanOffset = Math.max(0, Math.round(lastDataIdx - newEndIdx));
        setTlZoomIdx(newIdx);
        setTlPanOffset(newPanOffset);
      }
    } else {
      // Button click: reset to tail
      setTlZoomIdx((prev) => Math.min(prev + 1, TL_ZOOM_LEVELS.length - 1));
      setTlPanOffset(0);
    }
  };
  const tlZoomOut = (cursorRatio?: number) => {
    if (cursorRatio !== undefined && cursorRatio >= 0 && tlZoomIdx > 0) {
      // Cursor-aware zoom: keep the data under cursor at the same relative position
      const oldVisible = TL_ZOOM_LEVELS[tlZoomIdx];
      const newIdx = Math.max(tlZoomIdx - 1, 0);
      const newVisible = TL_ZOOM_LEVELS[newIdx];
      const lastDataIdx = tlLastDataIdx;
      const totalSlots = 242;
      if (newVisible >= totalSlots) {
        // Zooming out to full-day view: no pan offset needed
        setTlZoomIdx(newIdx);
        setTlPanOffset(0);
      } else {
        const currentEndIdx = Math.min(lastDataIdx, Math.max(oldVisible - 1, lastDataIdx - tlPanOffset));
        const currentStartIdx = Math.max(0, currentEndIdx - oldVisible + 1);
        const cursorIdx = currentStartIdx + cursorRatio * (currentEndIdx - currentStartIdx);
        const newStartIdx = cursorIdx - cursorRatio * (newVisible - 1);
        const newEndIdx = newStartIdx + newVisible - 1;
        const newPanOffset = Math.max(0, Math.round(lastDataIdx - newEndIdx));
        setTlZoomIdx(newIdx);
        setTlPanOffset(newPanOffset);
      }
    } else {
      // Button click or already at minimum zoom: reset to tail
      setTlZoomIdx((prev) => Math.max(prev - 1, 0));
      setTlPanOffset(0);
    }
  };
  const tlZoomReset = () => { setTlZoomIdx(0); setTlPanOffset(0); };

  // Zoom controls
  const ZOOM_LEVELS = [30, 50, 80, 120, 200, 300];
  const zoomIn = () => {
    setKlineVisibleBars((prev) => {
      const smaller = ZOOM_LEVELS.filter((l) => l < prev);
      return smaller.length > 0 ? smaller[smaller.length - 1] : prev;
    });
    setKlinePanOffset(0);
  };
  const zoomOut = () => {
    setKlineVisibleBars((prev) => {
      const larger = ZOOM_LEVELS.filter((l) => l > prev);
      return larger.length > 0 ? larger[0] : prev;
    });
    setKlinePanOffset(0);
  };
  const zoomReset = () => { setKlineVisibleBars(80); setKlinePanOffset(0); };

  // Slice chart data based on zoom level + pan offset (show the most recent bars, offset by pan)
  const chartData = useMemo(() => {
    if (allChartData.length <= klineVisibleBars) return allChartData;
    const maxOffset = allChartData.length - klineVisibleBars;
    const offset = Math.max(0, Math.min(klinePanOffset, maxOffset));
    return allChartData.slice(-(klineVisibleBars + offset), allChartData.length - offset);
  }, [allChartData, klineVisibleBars, klinePanOffset]);

  // ── K-line drag-to-pan & scroll-to-pan (stable native events via ref pattern) ──
  const klinePanOffsetRef = useRef(klinePanOffset);
  const klineVisibleBarsRef = useRef(klineVisibleBars);
  const allChartDataRef = useRef(allChartData);
  useEffect(() => { klinePanOffsetRef.current = klinePanOffset; }, [klinePanOffset]);
  useEffect(() => { klineVisibleBarsRef.current = klineVisibleBars; }, [klineVisibleBars]);
  useEffect(() => { allChartDataRef.current = allChartData; }, [allChartData]);

  // Pan helper — defined inside useEffect to avoid memoization issues
  useEffect(() => {
    const applyKlinePanOffset = (rawOffset: number) => {
      const acd = allChartDataRef.current;
      const vb = klineVisibleBarsRef.current;
      const maxOffset = Math.max(0, acd.length - vb);
      setKlinePanOffset(Math.max(0, Math.min(rawOffset, maxOffset)));
    };

    const container = klineChartContainerRef.current;
    if (!container) return;

    const isZoomed = () => allChartDataRef.current.length > klineVisibleBarsRef.current;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // only left-click
      if (!isZoomed()) return;
      e.preventDefault();
      e.stopPropagation();
      klineDragRef.current = { startX: e.clientX, startPanOffset: klinePanOffsetRef.current, isDragging: true };
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!klineDragRef.current.isDragging) return;
      e.preventDefault();
      const vb = klineVisibleBarsRef.current;
      const dx = e.clientX - klineDragRef.current.startX;
      const containerWidth = container.clientWidth || 600;
      const pixelsPerPoint = containerWidth / vb;
      const pointDelta = Math.round(dx / pixelsPerPoint);
      const newOffset = klineDragRef.current.startPanOffset - pointDelta;
      applyKlinePanOffset(newOffset);
    };

    const onMouseUp = () => {
      if (klineDragRef.current.isDragging) {
        klineDragRef.current.isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    const onContextMenu = (e: Event) => {
      if (klineDragRef.current.isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!isZoomed()) return;
      const delta = e.deltaX !== 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const scrollStep = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 40));
      const newOffset = klinePanOffsetRef.current + scrollStep;
      applyKlinePanOffset(newOffset);
    };

    container.addEventListener('mousedown', onMouseDown, true);
    container.addEventListener('contextmenu', onContextMenu, true);
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('contextmenu', onContextMenu, true);
      container.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []); // empty deps — stable listeners via refs

  const isUp = quote ? quote.change >= 0 : true;
  const priceColor = isUp ? "text-red-500" : "text-green-500";

  // Price range for Y-axis
  const allPrices = chartData.flatMap((d) => [d.high, d.low]).filter(Boolean);
  const minPrice = allPrices.length ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length ? Math.max(...allPrices) : 100;
  const pricePadding = (maxPrice - minPrice) * 0.05;

  // MACD range (for K-line chart)
  const macdValues = chartData
    .flatMap((d) => [d.dif, d.dea, d.macd])
    .filter((v) => v != null) as number[];
  const macdMin = macdValues.length ? Math.min(...macdValues) : -1;
  const macdMax = macdValues.length ? Math.max(...macdValues) : 1;
  const macdPadding = (macdMax - macdMin) * 0.1 || 0.1;

  // Volume range (for K-line chart)
  const volumes = chartData.map((d) => d.volume).filter(Boolean);
  const maxVolume = volumes.length ? Math.max(...volumes) : 1;

  // Calculate MACD from 1-minute timeline data directly (同花顺 style: 1-min MACD on 分时图)
  // 同花顺分时图MACD是直接用1分钟数据计算的，不用日K线预热
  // 因为日K线是日线级别，与1分钟数据时间尺度不同，混在一起会导致EMA完全收敛、DIF→0
  // 使用首值初始化(EMA[0]=X[0])，从第一分钟就有MACD值，无需预热
  const timelineMACDData = useMemo(() => {
    if (timeline.length === 0) return [];

    const prices = timeline.map((d) => d.price);
    const macdResult = calculateMACD(prices);

    const result: { time: string; dif: number | null; dea: number | null; macd: number | null }[] = [];
    for (let i = 0; i < timeline.length; i++) {
      const m = macdResult[i];
      if (isNaN(m.dif) || isNaN(m.dea) || isNaN(m.macd)) {
        result.push({ time: timeline[i].time, dif: null, dea: null, macd: null });
      } else {
        result.push({
          time: timeline[i].time,
          dif: m.dif,
          dea: m.dea,
          macd: m.macd,
        });
      }
    }

    return result.filter((d) => d.dif != null);
  }, [timeline]);

  // Generate T-trading signals for timeline (with DB factor overrides + index regime)
  const timelineSignals = useMemo(() => {
    return generateTimelineSignals(timeline, timelineMACDData, timelinePrevClose, factorOverrides, szIndexRegime, customFactors, sectorRegime);
  }, [timeline, timelineMACDData, timelinePrevClose, factorOverrides, szIndexRegime, customFactors, sectorRegime]);

  // Get latest timeline signal for the header badge
  const latestTimelineSignal = useMemo(() => {
    for (let i = timelineSignals.length - 1; i >= 0; i--) {
      if (timelineSignals[i]) return timelineSignals[i];
    }
    return null;
  }, [timelineSignals]);

  // ── Signal Alert System State ──
  // Initialize with default to avoid hydration mismatch (localStorage read after mount)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  // Read from localStorage after mount
  useEffect(() => {
    try {
      const v = localStorage.getItem("t-sound-enabled");
      if (v !== null) {
        // Use microtask to avoid lint warning about setState in effect
        queueMicrotask(() => setSoundEnabled(v === "true"));
      }
    } catch {}
  }, []);
  const alertedSignalIdsRef = useRef<Set<string>>(new Set());
  const [flashSignal, setFlashSignal] = useState<'buy' | 'sell' | 'stoploss' | null>(null);

  // Persist sound toggle
  useEffect(() => {
    try { localStorage.setItem("t-sound-enabled", String(soundEnabled)); } catch {}
  }, [soundEnabled]);

  // ── Signal Alert: watch for new strong signals ──
  useEffect(() => {
    if (!soundEnabled && flashSignal === null) return;
    const newStrongSignals: { type: 'buy' | 'sell' | 'stoploss'; id: string }[] = [];
    for (let i = 0; i < timelineSignals.length; i++) {
      const sig = timelineSignals[i];
      if (!sig) continue;
      if (sig.strength !== 'strong') continue;
      const id = `${i}-${sig.type}-${sig.reason}`;
      if (!alertedSignalIdsRef.current.has(id)) {
        alertedSignalIdsRef.current.add(id);
        newStrongSignals.push({ type: sig.type, id });
      }
    }
    if (newStrongSignals.length > 0) {
      const latest = newStrongSignals[newStrongSignals.length - 1];
      // Play sound
      if (soundEnabled) {
        playAlertSound(latest.type);
      }
      // Visual flash — use setTimeout to avoid synchronous setState in effect
      const flashType = latest.type;
      setTimeout(() => {
        setFlashSignal(flashType);
        setTimeout(() => setFlashSignal(null), 1200);
      }, 0);
    }
  }, [timelineSignals, soundEnabled]);

  // ── T-Index (做T指数) Computation ──
  const tIndex = useMemo(() => {
    // Start from base 50 (neutral)
    let score = 50;
    // Aggregate all active signals at the latest time point
    for (let i = timelineSignals.length - 1; i >= 0; i--) {
      const sig = timelineSignals[i];
      if (!sig) continue;
      // Only count signals in the latest 5 minutes (most recent 5 data points)
      if (i < timelineSignals.length - 5) break;
      if (sig.type === 'buy') {
        if (sig.strength === 'strong') score += 15;
        else if (sig.strength === 'medium') score += 8;
        else score += 3;
      } else if (sig.type === 'sell') {
        if (sig.strength === 'strong') score -= 15;
        else if (sig.strength === 'medium') score -= 8;
        else score -= 3;
      } else if (sig.type === 'stoploss') {
        score -= 20;
      }
    }
    // Market regime adjustment
    const regime = szIndexRegime?.regime;
    if (regime === '震荡市') score += 5;
    else if (regime === '上升通道') score -= 5;
    else if (regime === '下跌趋势') score -= 10;
    else if (regime === '横盘末期') score -= 15;
    // Cap between 0-100
    return Math.max(0, Math.min(100, score));
  }, [timelineSignals, szIndexRegime]);

  // ── Smart Action Recommendation (智能操作建议) ──
  const smartAction = useMemo(() => {
    // Analyze latest signals, market regime, time window, and T-index
    const lastTime = timeline[timeline.length - 1]?.time;
    const timeWindow = lastTime ? getTimeWindow(lastTime) : undefined;

    // Find the latest strong/medium signals
    let latestStrong: TSignal | null = null;
    let strongCount = 0;
    let mediumCount = 0;
    for (let i = timelineSignals.length - 1; i >= 0; i--) {
      const sig = timelineSignals[i];
      if (!sig) continue;
      if (i < timelineSignals.length - 10) break;
      if (sig.strength === 'strong') { strongCount++; if (!latestStrong) latestStrong = sig; }
      if (sig.strength === 'medium') { mediumCount++; }
    }

    // Check for stoploss
    const hasStoploss = timelineSignals.slice(-10).some(s => s?.type === 'stoploss');
    if (hasStoploss) {
      return {
        icon: '⚡',
        text: '紧急止损',
        reason: '触发止损信号，建议立即平仓',
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10 border-amber-500/25',
        confidence: 95,
        type: 'stoploss' as const,
      };
    }

    // Strong buy signal in buy window
    if (latestStrong?.type === 'buy' && latestStrong.strength === 'strong') {
      const isBuyWindow = timeWindow?.includes('买入') || timeWindow?.includes('低吸');
      return {
        icon: '🟢',
        text: isBuyWindow ? '建议正T买回' : '建议买入',
        reason: `强买入信号(${latestStrong.reason})${isBuyWindow ? '，处于买入时段' : ''}`,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10 border-green-500/25',
        confidence: 80 + strongCount * 5,
        type: 'buy' as const,
      };
    }

    // Strong sell signal in sell window
    if (latestStrong?.type === 'sell' && latestStrong.strength === 'strong') {
      const isSellWindow = timeWindow?.includes('卖出') || timeWindow?.includes('冲高');
      return {
        icon: '🔴',
        text: isSellWindow ? '建议正T卖出' : '建议卖出',
        reason: `强卖出信号(${latestStrong.reason})${isSellWindow ? '，处于卖出时段' : ''}`,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10 border-red-500/25',
        confidence: 80 + strongCount * 5,
        type: 'sell' as const,
      };
    }

    // Medium signals — wait for confirmation
    if (mediumCount > 0 && strongCount === 0) {
      const mediumSig = (() => {
        for (let i = timelineSignals.length - 1; i >= 0; i--) {
          if (timelineSignals[i]?.strength === 'medium') return timelineSignals[i];
        }
        return null;
      })();
      return {
        icon: '📊',
        text: '等待确认',
        reason: `${mediumSig?.type === 'buy' ? '买入' : '卖出'}信号强度中等(${mediumSig?.reason})，等待加强确认`,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10 border-orange-500/25',
        confidence: 50 + mediumCount * 10,
        type: (mediumSig?.type || 'buy') as 'buy' | 'sell',
      };
    }

    // No signals — observe
    return {
      icon: '⏳',
      text: '观望等待',
      reason: tIndex <= 50 ? '做T指数偏低，暂无明显操作机会' : '暂无有效信号，继续观察',
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50 border-border',
      confidence: 30,
      type: 'buy' as const,
    };
  }, [timelineSignals, timeline, tIndex]);

  // ── MA5 value from K-line chart (same as K-line's latest MA5) ──
  const prevDayMA5 = useMemo(() => {
    // Use the latest K-line MA5 value (same as K-line chart)
    if (allChartData.length < 1) return null;
    const lastBar = allChartData[allChartData.length - 1];
    return lastBar.ma5 ?? null;
  }, [allChartData]);

  // ── Key Price Levels (support/resistance) for timeline chart ──
  const keyPriceLevels = useMemo(() => {
    if (timeline.length < 5 || !timelinePrevClose || timelinePrevClose <= 0) return [];
    return computeKeyPriceLevels(timelinePrevClose, timeline);
  }, [timeline, timelinePrevClose]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Injected CSS animations for signal alerts */}
      <style dangerouslySetInnerHTML={{ __html: SIGNAL_PULSE_CSS }} />
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Zap className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-bold hidden sm:block">做T助手</h1>
              <Badge variant="outline" className="text-xs hidden sm:flex">A股</Badge>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    handleSearch(e.target.value);
                    setShowSearch(true);
                  }}
                  onFocus={() => setShowSearch(true)}
                  placeholder="搜索A股代码或名称..."
                  className="pl-9 pr-8 h-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>

              {showSearch && (searchResults.length > 0 || searchLoading) && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  {searchLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">搜索中...</div>
                  ) : (
                    searchResults.map((stock) => (
                      <button
                        key={stock.symbol}
                        onClick={() => handleSelectStock(stock.symbol)}
                        className="w-full px-4 py-2.5 text-left hover:bg-accent flex items-center justify-between transition-colors"
                      >
                        <div>
                          <span className="font-medium text-sm">{stock.symbol}</span>
                          <span className="ml-2 text-sm text-muted-foreground">{stock.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {stock.type === "ETF" && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-purple-500/10 text-purple-600 border-purple-500/20">ETF</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">{stock.exchange}</Badge>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Quick stocks */}
            <div className="hidden lg:flex items-center gap-1">
              {menuStocks.map((s) => (
                <Button
                  key={s.symbol}
                  variant={symbol === s.symbol ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => handleSelectStock(s.symbol)}
                >
                  {s.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Click outside to close search */}
      {showSearch && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSearch(false)} />
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-4">
        {/* Stock Info Bar */}
        <Card className={`mb-4 transition-all ${flashSignal === 'buy' ? 'animate-flash-green' : flashSignal ? 'animate-flash-red' : ''}`}>
          <CardContent className="p-4">
            {loading && !quote ? (
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-6 w-20" />
              </div>
            ) : quote ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="font-bold text-lg">{quote.symbol}</div>
                    <div className="text-sm text-muted-foreground">{quote.name}</div>
                  </div>
                  <button
                    onClick={toggleMenuStock}
                    title={isInMenu ? "从菜单栏移除" : "添加到菜单栏"}
                    className={`p-1.5 rounded-md transition-colors ${
                      isInMenu
                        ? "text-yellow-500 hover:text-yellow-600 bg-yellow-500/10"
                        : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
                    }`}
                  >
                    <Star className="h-4 w-4" fill={isInMenu ? "currentColor" : "none"} />
                  </button>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold tabular-nums ${priceColor}`}>
                    {formatNum(quote.price)}
                  </span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${priceColor}`}>
                    {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {formatNum(Math.abs(quote.change))}
                    ({formatNum(Math.abs(quote.changePercent))}%)
                  </span>
                </div>

                {(chartMode === "timeline" ? latestTimelineSignal : (latestSignal && latestSignal.type !== "hold" ? latestSignal : null)) && (
                  <Badge
                    variant={(chartMode === "timeline" ? latestTimelineSignal!.type : latestSignal!.type) === "buy" ? "default" : "destructive"}
                    className="text-xs px-3 py-1"
                  >
                    {((chartMode === "timeline" ? latestTimelineSignal!.type : latestSignal!.type) === "buy" ? "🟢 买入信号" : "🔴 卖出信号")} · {(chartMode === "timeline" ? latestTimelineSignal!.reason : latestSignal!.reason)}
                  </Badge>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm ml-auto">
                  <div>
                    <span className="text-muted-foreground">开盘</span>{" "}
                    <span className="font-mono">{formatNum(quote.open)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">最高</span>{" "}
                    <span className="font-mono text-red-500">{formatNum(quote.high)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">最低</span>{" "}
                    <span className="font-mono text-green-500">{formatNum(quote.low)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">昨收</span>{" "}
                    <span className="font-mono">{formatNum(quote.prevClose)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">成交量</span>{" "}
                    <span className="font-mono">{formatVolume(quote.volume)}</span>
                  </div>
                  {quote.turnover != null && quote.turnover > 0 && (
                    <div>
                      <span className="text-muted-foreground">换手</span>{" "}
                      <span className="font-mono">{quote.turnover.toFixed(2)}%</span>
                    </div>
                  )}
                  {quote.peRatio > 0 && (
                    <div>
                      <span className="text-muted-foreground">PE</span>{" "}
                      <span className="font-mono">{formatNum(quote.peRatio)}</span>
                    </div>
                  )}
                  {quote.marketCap > 0 && (
                    <div>
                      <span className="text-muted-foreground">市值</span>{" "}
                      <span className="font-mono">{formatMarketCap(quote.marketCap)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">选择或搜索A股开始分析</div>
            )}
          </CardContent>
        </Card>

        {/* T-Index & Smart Action Panel */}
        {quote && timeline.length > 0 && (
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* T-Index Card */}
            <Card className="border overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-4">
                  {/* Circular Gauge */}
                  <div className="relative shrink-0">
                    <svg width="72" height="72" viewBox="0 0 72 72">
                      {/* Background arc */}
                      <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="6" strokeDasharray={`${Math.PI * 30}`} strokeDashoffset="0" transform="rotate(-90 36 36)" strokeLinecap="round" />
                      {/* Score arc */}
                      <circle cx="36" cy="36" r="30" fill="none" stroke={getTIndexColor(tIndex)} strokeWidth="6" strokeDasharray={`${(tIndex / 100) * Math.PI * 30} ${Math.PI * 30}`} strokeDashoffset="0" transform="rotate(-90 36 36)" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }} />
                    </svg>
                    {/* Score number in center */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold tabular-nums" style={{ color: getTIndexColor(tIndex) }}>{tIndex}</span>
                    </div>
                  </div>
                  {/* Score details */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">做T指数</div>
                    <div className={`text-base font-bold ${getTIndexLabelColor(tIndex)}`}>{getTIndexLabel(tIndex)}</div>
                    {/* Score bar */}
                    <div className="mt-2 h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${tIndex}%`, backgroundColor: getTIndexColor(tIndex) }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
                      <span>卖出</span><span>观望</span><span>做T</span><span>优质</span>
                    </div>
                  </div>
                  {/* Pulsing indicator for strong signals */}
                  {latestTimelineSignal?.strength === 'strong' && (
                    <div className="animate-signal-pulse shrink-0">
                      <Volume2 className="h-5 w-5" style={{ color: latestTimelineSignal.type === 'buy' ? '#22c55e' : latestTimelineSignal.type === 'stoploss' ? '#f59e0b' : '#ef4444' }} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Smart Action Recommendation Card */}
            <Card className={`border overflow-hidden ${smartAction.bgColor}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  {/* Main recommendation */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">智能操作建议</div>
                    <div className={`text-lg font-bold ${smartAction.color}`}>
                      {smartAction.icon} {smartAction.text}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{smartAction.reason}</div>
                    {/* Time window indicator */}
                    {(() => {
                      const lastTime = timeline[timeline.length - 1]?.time;
                      const tw = lastTime ? getTimeWindow(lastTime) : null;
                      if (!tw) return null;
                      const twColor = tw === '开盘观察' || tw === '尾盘不操作'
                        ? 'text-muted-foreground bg-muted/50'
                        : tw.includes('卖出') ? 'text-red-600 bg-red-500/10' : 'text-green-600 bg-green-500/10';
                      return (
                        <Badge variant="outline" className={`text-[10px] h-5 mt-2 ${twColor}`}>
                          <Clock className="h-2.5 w-2.5 mr-0.5" />{tw}
                        </Badge>
                      );
                    })()}
                  </div>
                  {/* Confidence bar */}
                  <div className="shrink-0 w-16 text-center">
                    <div className="text-[10px] text-muted-foreground mb-1">信心度</div>
                    <div className="text-sm font-bold tabular-nums" style={{ color: smartAction.confidence >= 80 ? '#22c55e' : smartAction.confidence >= 50 ? '#f59e0b' : '#9ca3af' }}>
                      {Math.min(smartAction.confidence, 100)}%
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(smartAction.confidence, 100)}%`,
                          backgroundColor: smartAction.confidence >= 80 ? '#22c55e' : smartAction.confidence >= 50 ? '#f59e0b' : '#9ca3af',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Chart Mode & Interval Selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {isAShareStock && (
            <Tabs value={chartMode} onValueChange={(v) => changeChartMode(v as ChartMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="timeline" className="text-xs px-3 h-6">
                  <LineChart className="h-3.5 w-3.5 mr-1" />
                  分时
                </TabsTrigger>
                <TabsTrigger value="kline" className="text-xs px-3 h-6">
                  <CandlestickChart className="h-3.5 w-3.5 mr-1" />
                  K线
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {chartMode === "kline" && (
            <div className="flex items-center gap-1">
              {INTERVALS.map((intv) => (
                <Button
                  key={intv.value}
                  variant={interval === intv.value ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => changeInterval(intv.value)}
                >
                  {intv.label}
                </Button>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {/* Price / AvgPrice deviation badge */}
            {(() => {
              const lastTl = timeline[timeline.length - 1];
              if (lastTl && lastTl.avgPrice && lastTl.avgPrice > 0) {
                const deviation = ((lastTl.price - lastTl.avgPrice) / lastTl.avgPrice) * 100;
                const isAbove = deviation >= 0;
                return (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${
                      isAbove
                        ? "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400"
                        : "bg-green-500/10 border-green-500/25 text-green-600 dark:text-green-400"
                    }`}
                    title={`价格 ${lastTl.price.toFixed(2)} 相对均价 ${lastTl.avgPrice.toFixed(2)} 偏离 ${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}%`}
                  >
                    <span className="opacity-70">{isAbove ? "↑均线上方" : "↓均线下方"}</span>
                    <span className="font-mono">{deviation >= 0 ? "+" : ""}{deviation.toFixed(2)}%</span>
                  </span>
                );
              }
              return null;
            })()}
            {/* Sound Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setSoundEnabled(prev => !prev)}
              title={soundEnabled ? '关闭声音提醒' : '开启声音提醒'}
            >
              {soundEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
            </Button>
            <Clock className="h-3 w-3" />
            自动刷新 30s
          </div>
        </div>

        {/* Error */}
        {error && (
          <Card className="mb-4 border-destructive/50">
            <CardContent className="p-4 text-destructive text-sm">{error}</CardContent>
          </Card>
        )}

        {/* Charts */}
        {loading && chartData.length === 0 && timeline.length === 0 ? (
          <div className="space-y-4">
            <Skeleton className="h-[400px] w-full" />
            <Skeleton className="h-[150px] w-full" />
            <Skeleton className="h-[100px] w-full" />
          </div>
        ) : chartMode === "timeline" && timeline.length > 0 ? (
          <div className="space-y-4">
            {/* ─── 同花顺风格 统一分时面板 ─── */}
            <TimeSharingPanel
              data={timeline}
              prevClose={timelinePrevClose}
              symbol={symbol}
              signals={timelineSignals}
              macdData={timelineMACDData}
              visibleMinutes={tlVisibleMinutes}
              onZoomIn={tlZoomIn}
              onZoomOut={tlZoomOut}
              onZoomReset={tlZoomReset}
              zoomIdx={tlZoomIdx}
              maxZoomIdx={TL_ZOOM_LEVELS.length - 1}
              prevDayMA5={prevDayMA5}
              szIndexRegime={szIndexRegime}
              activeIndexKey={activeIndexKey}
              indexConfig={INDEX_CONFIG}
              onCycleIndex={cycleIndexKey}
              keyPriceLevels={keyPriceLevels}
              panOffset={tlPanOffset}
              onPanOffsetChange={setTlPanOffset}
              sectorRegime={sectorRegime}
              sectorInfo={sectorInfo}
            />
          </div>
        ) : chartData.length > 0 ? (
          <div
            ref={klineChartContainerRef}
            className="space-y-1"
          >
            {/* K-Line Chart with Candlesticks */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <CardTitle className="text-sm font-medium">{symbol} · K线走势</CardTitle>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
                    MA5{chartData.length > 0 && chartData[chartData.length - 1]?.ma5 != null ? ` ${chartData[chartData.length - 1].ma5!.toFixed(2)}` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    MA10{chartData.length > 0 && chartData[chartData.length - 1]?.ma10 != null ? ` ${chartData[chartData.length - 1].ma10!.toFixed(2)}` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
                    MA20{chartData.length > 0 && chartData[chartData.length - 1]?.ma20 != null ? ` ${chartData[chartData.length - 1].ma20!.toFixed(2)}` : ''}
                  </span>
                  {/* Zoom Controls */}
                  <div className="ml-auto flex items-center gap-1">
                    {allChartData.length > klineVisibleBars && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const maxOffset = allChartData.length - klineVisibleBars;
                          const step = Math.max(1, Math.round(klineVisibleBars * 0.3));
                          setKlinePanOffset(Math.min(klinePanOffset + step, maxOffset));
                        }}
                        disabled={klinePanOffset >= allChartData.length - klineVisibleBars}
                        title="向左平移（查看更早数据）"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={zoomIn}
                      disabled={klineVisibleBars <= ZOOM_LEVELS[0]}
                      title="放大（减少K线数）"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[10px] text-muted-foreground tabular-nums min-w-[48px] text-center">
                      {chartData.length}根
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={zoomOut}
                      disabled={klineVisibleBars >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1] || klineVisibleBars >= allChartData.length}
                      title="缩小（增加K线数）"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    {allChartData.length > klineVisibleBars && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const step = Math.max(1, Math.round(klineVisibleBars * 0.3));
                          setKlinePanOffset(Math.max(0, klinePanOffset - step));
                        }}
                        disabled={klinePanOffset <= 0}
                        title="向右平移（查看最新数据）"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={zoomReset}
                      title="重置缩放"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-2 px-2">
                <ResponsiveContainer width="100%" height={460}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[minPrice - pricePadding, maxPrice + pricePadding]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(2)} />
                    <Tooltip content={<KLineTooltip />} cursor={false} wrapperStyle={{ background: 'transparent', border: 'none' }} />
                    <Bar dataKey="close" opacity={0} isAnimationActive={false} barSize={chartData.length > 150 ? 3 : chartData.length > 80 ? 5 : chartData.length > 50 ? 7 : 10} />
                    <Customized component={CandlestickRenderer} />
                    <Line type="monotone" dataKey="ma5" stroke="#eab308" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="ma10" stroke="#3b82f6" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="ma20" stroke="#a855f7" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Volume Chart */}
            <Card>
              <CardHeader className="pb-1 pt-2 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  成交量
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-2 px-2">
                <ResponsiveContainer width="100%" height={100}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, maxVolume * 1.1]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => formatVolume(v)} />
                    <Tooltip content={<VolumeTooltip />} cursor={false} wrapperStyle={{ background: 'transparent', border: 'none' }} />
                    <Bar dataKey="volume" isAnimationActive={false} barSize={chartData.length > 150 ? 3 : chartData.length > 80 ? 5 : chartData.length > 50 ? 7 : 10}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.close >= entry.open ? "#ef4444" : "#22c55e"} fillOpacity={0.7} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* MACD Chart */}
            <Card>
              <CardHeader className="pb-1 pt-2 px-4">
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <CardTitle className="text-sm font-medium">MACD</CardTitle>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    DIF
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
                    DEA
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-1.5 bg-red-500 rounded-sm" />
                    <span className="inline-block w-3 h-1.5 bg-green-500 rounded-sm" />
                    MACD柱
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pb-2 px-2">
                <ResponsiveContainer width="100%" height={140}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[macdMin - macdPadding, macdMax + macdPadding]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(3)} />
                    <Tooltip content={<MACDTooltip />} cursor={false} wrapperStyle={{ background: 'transparent', border: 'none' }} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Bar dataKey="macd" isAnimationActive={false} barSize={chartData.length > 150 ? 3 : chartData.length > 80 ? 5 : chartData.length > 50 ? 7 : 10}>
                      {chartData.map((entry, index) => (
                        <Cell key={`macd-${index}`} fill={entry.macd && entry.macd >= 0 ? "#ef4444" : "#22c55e"} fillOpacity={0.7} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="dif" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="dea" stroke="#f97316" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        ) : (
          !loading && (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">选择A股开始分析</p>
                <p className="text-sm">在搜索框中输入股票代码或名称，或点击上方热门股票</p>
              </CardContent>
            </Card>
          )
        )}

        {/* ── Market Index & Sector Overview ── */}
        {chartMode === "timeline" && timeline.length > 0 && (() => {
          const szData = indexTimelineData[activeIndexKey];
          const idxInfo = INDEX_CONFIG[activeIndexKey];
          const hasIdxData = szData && szData.items.length > 10;
          const hasSectorData = sectorTimelineData.items.length > 10 && sectorInfo;

          // Regime badge helper
          const regimeBadge = (regime: RegimeDetail | null) => {
            if (!regime) return null;
            const regimeConfig: Record<string, { bg: string; text: string; icon: string }> = {
              "上升通道": { bg: "bg-red-500/10 border-red-500/20", text: "text-red-500", icon: "↑" },
              "下跌趋势": { bg: "bg-green-500/10 border-green-500/20", text: "text-green-500", icon: "↓" },
              "震荡市":   { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-500", icon: "↔" },
              "横盘末期": { bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-500", icon: "→" },
            };
            const cfg = regimeConfig[regime.regime] || regimeConfig["震荡市"];
            return (
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
                <span>{cfg.icon}</span>
                <span>{regime.regime}</span>
              </span>
            );
          };

          if (!hasIdxData && !hasSectorData) return null;

          return (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">大盘 & 板块走势</span>
                <span className="text-[10px] text-muted-foreground">— 与个股联动参考</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hasIdxData && (
                  <MiniTimelinePanel
                    title={idxInfo?.label || "深证成指"}
                    data={szData.items}
                    prevClose={szData.prevClose}
                    badge={
                      <div className="flex items-center gap-1 ml-auto">
                        {regimeBadge(szIndexRegime)}
                        <span
                          className="text-[8px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none"
                          onClick={cycleIndexKey}
                          title="点击切换指数"
                        >
                          切换
                        </span>
                      </div>
                    }
                  />
                )}
                {hasSectorData && (
                  <MiniTimelinePanel
                    title={`${sectorInfo.name}板块`}
                    data={sectorTimelineData.items}
                    prevClose={sectorTimelineData.prevClose}
                    badge={<div className="ml-auto">{regimeBadge(sectorRegime)}</div>}
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* T-Trading Signals Summary */}
        {(chartData.length > 0 || (chartMode === "timeline" && timeline.length > 0)) && (
          <Card className="mt-4">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                做T信号分析
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {chartMode === "timeline" && timelineSignals.filter(Boolean).length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(() => {
                      const buyCount = timelineSignals.filter((s) => s?.type === "buy").length;
                      const strongBuys = timelineSignals.filter((s) => s?.type === "buy" && s?.strength === "strong").length;

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="text-red-500"><TrendingUp className="h-4 w-4" /></div>
                          <div>
                            <div className="text-xs text-muted-foreground">买入信号</div>
                            <div className="text-sm font-medium text-red-500">
                              {buyCount}个 {strongBuys > 0 && `(强信号${strongBuys}个)`}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {(() => {
                      const sellCount = timelineSignals.filter((s) => s?.type === "sell").length;
                      const strongSells = timelineSignals.filter((s) => s?.type === "sell" && s?.strength === "strong").length;

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="text-green-500"><TrendingDown className="h-4 w-4" /></div>
                          <div>
                            <div className="text-xs text-muted-foreground">卖出信号</div>
                            <div className="text-sm font-medium text-green-500">
                              {sellCount}个 {strongSells > 0 && `(强信号${strongSells}个)`}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {(() => {
                      const lastTL = timeline[timeline.length - 1];
                      if (!lastTL) return null;
                      const aboveVWAP = lastTL.price > lastTL.avgPrice;
                      const dev = ((lastTL.price - lastTL.avgPrice) / lastTL.avgPrice * 100).toFixed(2);

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={aboveVWAP ? "text-red-500" : "text-green-500"}>
                            <Activity className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">价格/均价</div>
                            <div className={`text-sm font-medium ${aboveVWAP ? "text-red-500" : "text-green-500"}`}>
                              {aboveVWAP ? "均线上方" : "均线下方"} ({aboveVWAP ? "+" : ""}{dev}%)
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Signal Timeline */}
                  <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                    {timelineSignals.map((sig, i) => {
                      if (!sig) return null;
                      const hasEnhance = sig.description?.includes("共振") || sig.description?.includes("确认→") || sig.description?.includes("大盘");
                      return (
                        <div key={`sig-${i}`} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
                          <Badge variant={sig.type === "buy" ? "default" : "destructive"} className="text-xs h-5 shrink-0">
                            {sig.type === "buy" ? "买" : "卖"}
                          </Badge>
                          <span className="font-mono text-muted-foreground">{timeline[i]?.time}</span>
                          <span className={sig.type === "buy" ? "text-red-500" : "text-green-500"}>{sig.reason}</span>
                          <span className="text-muted-foreground ml-auto">
                            {sig.strength === "strong" ? "强" : sig.strength === "medium" ? "中" : "弱"}
                          </span>
                          {hasEnhance && (
                            <Shield className="h-3 w-3 text-amber-500 shrink-0" title={sig.description} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* v3.6 胜率增强提示 */}
                  {(() => {
                    const totalSigs = timelineSignals.filter(Boolean).length;
                    const strongSigs = timelineSignals.filter(s => s?.strength === "strong").length;
                    const mediumSigs = timelineSignals.filter(s => s?.strength === "medium").length;
                    const weakSigs = timelineSignals.filter(s => s?.strength === "weak").length;
                    const strongRatio = totalSigs > 0 ? (strongSigs / totalSigs * 100).toFixed(0) : "0";

                    // Detect confluence signals
                    const confluenceSigs = timelineSignals.filter(s => s?.description?.includes("共振"));
                    // Detect key level signals
                    const keyLevelSigs = timelineSignals.filter(s => s?.description?.includes("阻力确认") || s?.description?.includes("支撑确认"));
                    // Detect VWAP slope signals
                    const vwapSlopeSigs = timelineSignals.filter(s => s?.description?.includes("均价线拐头"));
                    // Detect index regime signals
                    const indexRegimeSigs = timelineSignals.filter(s => s?.description?.includes("大盘"));

                    const enhancements: { icon: string; label: string; count: number; color: string }[] = [
                      { icon: "🎯", label: "因子共振", count: confluenceSigs.length, color: "text-amber-600 dark:text-amber-400" },
                      { icon: "📍", label: "关键价位", count: keyLevelSigs.length, color: "text-blue-600 dark:text-blue-400" },
                      { icon: "📐", label: "均价拐头", count: vwapSlopeSigs.length, color: "text-purple-600 dark:text-purple-400" },
                      { icon: "🌐", label: "大盘联动", count: indexRegimeSigs.length, color: "text-teal-600 dark:text-teal-400" },
                    ];
                    const activeEnhancements = enhancements.filter(e => e.count > 0);

                    if (activeEnhancements.length === 0) return null;

                    return (
                      <div className="mt-3 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">胜率增强 (v3.6)</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">强信号占比 {strongRatio}%</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {activeEnhancements.map(e => (
                            <span key={e.label} className={`inline-flex items-center gap-1 text-[10px] ${e.color}`}>
                              <span>{e.icon}</span>
                              <span>{e.label}</span>
                              <span className="font-mono font-bold">{e.count}</span>
                            </span>
                          ))}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-1.5 leading-relaxed">
                          {confluenceSigs.length > 0 && "多因子共振确认的信号胜率显著高于单因子。"}
                          {keyLevelSigs.length > 0 && "关键价位附近的信号更可靠。"}
                          {vwapSlopeSigs.length > 0 && "均价线拐头确认趋势反转。"}
                          {indexRegimeSigs.length > 0 && "大盘方向与个股信号一致时增强。"}
                        </div>
                      </div>
                    );
                  })()}

                  {latestTimelineSignal && (
                    <div className="mt-4 p-3 rounded-lg border border-border">
                      <div className="flex items-start gap-2">
                        <Badge
                          variant={latestTimelineSignal.type === "buy" ? "default" : "destructive"}
                          className="shrink-0 mt-0.5"
                        >
                          {latestTimelineSignal.type === "buy" ? "做多T" : "做空T"}
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          {latestTimelineSignal.reason}。信号强度:{" "}
                          {latestTimelineSignal.strength === "strong" ? "强" : latestTimelineSignal.strength === "medium" ? "中" : "弱"}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : chartData.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(() => {
                      const lastItem = chartData[chartData.length - 1];
                      const prevItem = chartData.length > 1 ? chartData[chartData.length - 2] : null;

                      let macdSignal = "震荡";
                      let macdColor = "text-muted-foreground";
                      let macdIcon = <Minus className="h-4 w-4" />;

                      if (lastItem?.dif != null && lastItem?.dea != null && prevItem?.dif != null && prevItem?.dea != null) {
                        if (prevItem.dif! <= prevItem.dea! && lastItem.dif! > lastItem.dea!) {
                          macdSignal = "金叉买入";
                          macdColor = "text-red-500";
                          macdIcon = <TrendingUp className="h-4 w-4" />;
                        } else if (prevItem.dif! >= prevItem.dea! && lastItem.dif! < lastItem.dea!) {
                          macdSignal = "死叉卖出";
                          macdColor = "text-green-500";
                          macdIcon = <TrendingDown className="h-4 w-4" />;
                        } else if (lastItem.dif! > lastItem.dea!) {
                          macdSignal = "多头趋势";
                          macdColor = "text-red-500";
                          macdIcon = <TrendingUp className="h-4 w-4" />;
                        } else {
                          macdSignal = "空头趋势";
                          macdColor = "text-green-500";
                          macdIcon = <TrendingDown className="h-4 w-4" />;
                        }
                      }

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={macdColor}>{macdIcon}</div>
                          <div>
                            <div className="text-xs text-muted-foreground">MACD信号</div>
                            <div className={`text-sm font-medium ${macdColor}`}>{macdSignal}</div>
                          </div>
                        </div>
                      );
                    })()}

                    {(() => {
                      const lastItem = chartData[chartData.length - 1];
                      const avgVol = chartData.slice(-20).reduce((s, d) => s + d.volume, 0) / Math.min(20, chartData.length);
                      const volRatio = lastItem && avgVol > 0 ? lastItem.volume / avgVol : 1;

                      let volSignal = "正常量";
                      let volColor = "text-muted-foreground";

                      if (volRatio > 2) {
                        volSignal = "放量";
                        volColor = "text-orange-500";
                      } else if (volRatio > 1.5) {
                        volSignal = "温和放量";
                        volColor = "text-yellow-500";
                      } else if (volRatio < 0.5) {
                        volSignal = "缩量";
                        volColor = "text-blue-500";
                      }

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={volColor}>
                            <BarChart3 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">量能状态</div>
                            <div className={`text-sm font-medium ${volColor}`}>
                              {volSignal} ({volRatio.toFixed(2)}x)
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {(() => {
                      const lastItem = chartData[chartData.length - 1];
                      let trendSignal = "整理";
                      let trendColor = "text-muted-foreground";

                      if (lastItem?.ma5 != null && lastItem?.ma10 != null && lastItem?.ma20 != null) {
                        if (lastItem.ma5! > lastItem.ma10! && lastItem.ma10! > lastItem.ma20!) {
                          trendSignal = "多头排列";
                          trendColor = "text-red-500";
                        } else if (lastItem.ma5! < lastItem.ma10! && lastItem.ma10! < lastItem.ma20!) {
                          trendSignal = "空头排列";
                          trendColor = "text-green-500";
                        }
                      }

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={trendColor}>
                            <Activity className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">均线趋势</div>
                            <div className={`text-sm font-medium ${trendColor}`}>{trendSignal}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {latestSignal && latestSignal.type !== "hold" && (
                    <div className="mt-4 p-3 rounded-lg border border-border">
                      <div className="flex items-start gap-2">
                        <Badge
                          variant={latestSignal.type === "buy" ? "default" : "destructive"}
                          className="shrink-0 mt-0.5"
                        >
                          {latestSignal.type === "buy" ? "做多T" : "做空T"}
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          {latestSignal.reason}。信号强度:{" "}
                          {latestSignal.strength === "strong" ? "强" : latestSignal.strength === "medium" ? "中" : "弱"}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Strategy Admin Panel */}
        <StrategyAdminPanel onFactorsChanged={(factors) => setFactorOverrides(buildFactorOverridesFromDB(factors))} />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/30 mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>做T助手 · A股日内交易信号分析工具</span>
            <span>数据仅供参考，不构成投资建议</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
