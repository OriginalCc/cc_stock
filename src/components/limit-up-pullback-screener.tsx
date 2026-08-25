"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  AlertCircle,
  ArrowDownRight,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Target,
  BarChart3,
  Clock,
  Activity,
  Filter,
  SlidersHorizontal,
  Database,
  RotateCcw,
  Zap,
  PieChart,
  Search,
  Star,
  Download,
  LayoutGrid,
  Table as TableIcon,
  AlertTriangle,
  X,
  Layers,
  Save,
  Keyboard,
  Bookmark,
  type LucideIcon,
} from "lucide-react";
import { cachedFetch, getCachedData, isCacheFresh } from "@/lib/client-cache";

// ── Types (matching API response) ─────────────────────

interface KLineDay {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number;
}

interface PullbackStock {
  symbol: string;
  name: string;
  limitUpDate: string;
  limitUpClose: number;
  preLimitUpClose: number;
  limitUpPct: number;
  currentPrice: number;
  currentChangePct: number;
  pullbackPct: number;
  approachPct: number;
  daysSinceLimitUp: number;
  maxPullbackPct: number;
  maxPullbackDate: string;
  klineSummary: KLineDay[];
  turnover: number;
  marketCap: number;
  volumeRatio: number;
}

interface PullbackResult {
  success: boolean;
  date: string;
  stocks: PullbackStock[];
  summary: {
    totalScanned: number;
    totalPullback: number;
  };
  timestamp: string;
  cached?: boolean;
  error?: string;
}

// ── Filters ────────────────────────────────────────────

interface PullbackFilters {
  minApproachPct: number;       // 回踩深度阈值, 0-100
  maxDaysSinceLimitUp: number;  // 距涨停最大天数, 1-15
  maxMarketCap: number;         // 市值上限(亿), 0=不限, 0-10000
  minTurnover: number;          // 最小换手率, 0-50
  minVolumeRatio: number;       // 量比下限, 0-10
  excludeST: boolean;           // 排除 ST
  // New filter dimensions
  minPrice: number;             // 最低价, 0=不限
  maxPrice: number;             // 最高价, 0=不限
  minTodayChangePct: number;    // 今日涨幅下限, -10~10
  maxTodayChangePct: number;    // 今日涨幅上限, -10~10
  limitUpBoardTypes: string[];  // 涨停板类型 ["10%","20%","30%"]
}

const DEFAULT_FILTERS: PullbackFilters = {
  minApproachPct: 30,
  maxDaysSinceLimitUp: 10,
  maxMarketCap: 1000,
  minTurnover: 0,
  minVolumeRatio: 0,
  excludeST: true,
  minPrice: 0,
  maxPrice: 0,
  minTodayChangePct: -10,
  maxTodayChangePct: 10,
  limitUpBoardTypes: ["10%", "20%", "30%"],
};

type SortField =
  | "approachPct"
  | "daysSinceLimitUp"
  | "marketCap"
  | "turnover"
  | "volumeRatio"
  | "pullbackPct"
  | "maxPullbackPct"
  | "currentChangePct"
  | "limitUpPct"
  | "currentPrice"
  | "limitUpClose"
  | "preLimitUpClose"
  | "riskScore";

type SortOrder = "asc" | "desc";

type ViewMode = "table" | "card";

interface LimitUpPullbackScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

// ── Memory keys ────────────────────────────────────────

const LAST_RESULT_KEY = "limit-up-pullback-screener-last-result";
const LAST_FILTERS_KEY = "limit-up-pullback-screener-last-filters";
const LAST_SEARCH_KEY = "limit-up-pullback-screener-last-search";
const LAST_TAGS_KEY = "limit-up-pullback-screener-last-tags";
const FAVORITES_KEY = "limit-up-pullback-screener-favorites";
const LAST_VIEW_KEY = "limit-up-pullback-screener-last-view";
const LAST_PAGE_SIZE_KEY = "limit-up-pullback-screener-last-page-size";
const STRATEGIES_KEY = "limit-up-pullback-screener-saved-strategies";

// ── Saved strategies ───────────────────────────────────

interface SavedStrategy {
  id: string;
  name: string;
  filters: PullbackFilters;
  tags: string[];
  createdAt: string;
}

// ── Presets ────────────────────────────────────────────

interface Preset {
  id: string;
  name: string;
  desc: string;
  color: string; // tailwind color stem, e.g. "red"
  filters: PullbackFilters;
}

const PRESETS: Preset[] = [
  {
    id: "aggressive",
    name: "激进型",
    desc: "回踩≥70% · ≤5天 · 市值≤300亿 · 换手≥3% · 量比≥1.5",
    color: "red",
    filters: {
      ...DEFAULT_FILTERS,
      minApproachPct: 70,
      maxDaysSinceLimitUp: 5,
      maxMarketCap: 300,
      minTurnover: 3,
      minVolumeRatio: 1.5,
      excludeST: true,
    },
  },
  {
    id: "steady",
    name: "稳健型",
    desc: "回踩≥50% · ≤10天 · 市值≤1000亿 · 换手≥1% · 量比≥1",
    color: "purple",
    filters: {
      ...DEFAULT_FILTERS,
      minApproachPct: 50,
      maxDaysSinceLimitUp: 10,
      maxMarketCap: 1000,
      minTurnover: 1,
      minVolumeRatio: 1,
      excludeST: true,
    },
  },
  {
    id: "conservative",
    name: "保守型",
    desc: "回踩≥30% · ≤15天 · 市值≤5000亿 · 不限换手/量比",
    color: "emerald",
    filters: {
      ...DEFAULT_FILTERS,
      minApproachPct: 30,
      maxDaysSinceLimitUp: 15,
      maxMarketCap: 5000,
      minTurnover: 0,
      minVolumeRatio: 0,
      excludeST: true,
    },
  },
  {
    id: "deep-pullback",
    name: "深度回踩",
    desc: "回踩≥85% · ≤10天 · 其他默认",
    color: "orange",
    filters: {
      ...DEFAULT_FILTERS,
      minApproachPct: 85,
      maxDaysSinceLimitUp: 10,
    },
  },
  {
    id: "quick-rebound",
    name: "快速反弹",
    desc: "回踩≥30% · ≤3天 · 其他默认",
    color: "cyan",
    filters: {
      ...DEFAULT_FILTERS,
      minApproachPct: 30,
      maxDaysSinceLimitUp: 3,
    },
  },
];

// Color mapping for presets → badge classes
const PRESET_COLOR_CLASSES: Record<
  string,
  { badge: string; active: string; dot: string }
> = {
  red: {
    badge: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
    active: "ring-2 ring-red-500/50 border-red-500/50",
    dot: "bg-red-500",
  },
  purple: {
    badge:
      "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
    active: "ring-2 ring-purple-500/50 border-purple-500/50",
    dot: "bg-purple-500",
  },
  emerald: {
    badge:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    active: "ring-2 ring-emerald-500/50 border-emerald-500/50",
    dot: "bg-emerald-500",
  },
  orange: {
    badge:
      "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400",
    active: "ring-2 ring-orange-500/50 border-orange-500/50",
    dot: "bg-orange-500",
  },
  cyan: {
    badge: "bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400",
    active: "ring-2 ring-cyan-500/50 border-cyan-500/50",
    dot: "bg-cyan-500",
  },
};

// ── Quick Tags ─────────────────────────────────────────

interface QuickTag {
  id: string;
  label: string;
  filter: (s: PullbackStock) => boolean;
}

const QUICK_TAGS: QuickTag[] = [
  { id: "today-up", label: "今日反弹", filter: (s) => s.currentChangePct > 0 },
  { id: "today-down", label: "今日下跌", filter: (s) => s.currentChangePct < -2 },
  { id: "vol-expand", label: "今日放量", filter: (s) => s.volumeRatio >= 1.5 },
  { id: "approach-near", label: "极度逼近", filter: (s) => s.approachPct >= 80 },
  { id: "recent-3d", label: "近3日涨停", filter: (s) => s.daysSinceLimitUp <= 3 },
  { id: "small-cap", label: "小盘股", filter: (s) => s.marketCap > 0 && s.marketCap < 100 },
  { id: "mid-cap", label: "中盘股", filter: (s) => s.marketCap >= 100 && s.marketCap <= 500 },
  { id: "large-cap", label: "大盘股", filter: (s) => s.marketCap > 500 },
  { id: "low-turnover", label: "低换手", filter: (s) => s.turnover > 0 && s.turnover < 2 },
  { id: "high-turnover", label: "高换手", filter: (s) => s.turnover >= 5 },
];

// ── Helpers ────────────────────────────────────────────

function getApproachStyle(pct: number): { bg: string; text: string; label: string; barColor: string } {
  if (pct >= 90) return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400", label: "极度逼近", barColor: "bg-red-500" };
  if (pct >= 70) return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400", label: "深度回踩", barColor: "bg-orange-500" };
  if (pct >= 50) return { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-600 dark:text-yellow-400", label: "中度回踩", barColor: "bg-yellow-500" };
  return { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", label: "浅度回踩", barColor: "bg-emerald-500" };
}

function formatMarketCap(val: number): string {
  if (val <= 0) return "--";
  if (val >= 10000) return `${(val / 10000).toFixed(1)}万亿`;
  if (val >= 100) return `${val.toFixed(0)}亿`;
  if (val >= 1) return `${val.toFixed(1)}亿`;
  return `${(val * 10000).toFixed(0)}万`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

/** Detect board type by symbol prefix */
function getBoardType(symbol: string): string {
  if (symbol.startsWith("688") || symbol.startsWith("30")) return "20%";
  if (symbol.startsWith("8")) return "30%";
  return "10%";
}

/** Risk score 0-100 (higher = more risky) */
function calcRiskScore(s: PullbackStock): number {
  const score =
    s.approachPct * 0.35 +
    s.maxPullbackPct * 0.25 +
    Math.min(s.daysSinceLimitUp * 3, 30) * 0.15 +
    Math.max(0, -s.currentChangePct) * 0.25;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function getRiskStyle(score: number): { bg: string; text: string; label: string } {
  if (score >= 70) return { bg: "bg-red-500/10 border-red-500/40", text: "text-red-600 dark:text-red-400", label: "极高" };
  if (score >= 50) return { bg: "bg-orange-500/10 border-orange-500/40", text: "text-orange-600 dark:text-orange-400", label: "高" };
  if (score >= 30) return { bg: "bg-yellow-500/10 border-yellow-500/40", text: "text-yellow-600 dark:text-yellow-400", label: "中" };
  return { bg: "bg-emerald-500/10 border-emerald-500/40", text: "text-emerald-600 dark:text-emerald-400", label: "低" };
}

function csvEscape(val: string | number): string {
  const s = String(val);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Sub-Components ─────────────────────────────────────

function MiniKlineChart({ kline, limitUpDate, preLimitUpClose, width = 110, height = 36 }: {
  kline: KLineDay[];
  limitUpDate: string;
  preLimitUpClose: number;
  width?: number;
  height?: number;
}) {
  if (!kline || kline.length < 3) {
    return <span className="text-[10px] text-muted-foreground">无数据</span>;
  }

  const padding = 2;

  const allPrices = kline.flatMap(d => [d.high, d.low, preLimitUpClose]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;

  const toY = (price: number) => padding + (1 - (price - minP) / range) * (height - 2 * padding);
  const toX = (idx: number) => padding + (idx / (kline.length - 1)) * (width - 2 * padding);

  const limitUpIdx = kline.findIndex(d => d.date.startsWith(limitUpDate));
  const closePath = kline.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.close)}`).join(" ");
  const refY = toY(preLimitUpClose);

  return (
    <svg width={width} height={height} className="shrink-0 max-w-full">
      <line x1={padding} y1={refY} x2={width - padding} y2={refY}
        stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" className="text-muted-foreground/60" />
      <path d={closePath} fill="none" stroke="#10b981" strokeWidth="1" />
      {limitUpIdx >= 0 && (
        <circle cx={toX(limitUpIdx)} cy={toY(kline[limitUpIdx].close)} r="2" fill="#ef4444" />
      )}
    </svg>
  );
}

/** Larger candlestick chart for expanded row */
function LargeKlineChart({ kline, limitUpDate, preLimitUpClose, currentPrice }: {
  kline: KLineDay[];
  limitUpDate: string;
  preLimitUpClose: number;
  currentPrice: number;
}) {
  if (!kline || kline.length < 2) {
    return <span className="text-xs text-muted-foreground">无K线数据</span>;
  }

  const width = 240;
  const height = 120;
  const padX = 6;
  const padY = 6;
  const plotW = width - 2 * padX;
  const plotH = height - 2 * padY;

  const allPrices = kline.flatMap(d => [d.high, d.low, preLimitUpClose, currentPrice]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;

  const toY = (p: number) => padY + (1 - (p - minP) / range) * plotH;
  const candleW = Math.max(3, (plotW / kline.length) * 0.6);
  const slot = plotW / kline.length;

  const limitUpIdx = kline.findIndex(d => d.date.startsWith(limitUpDate));
  const refY = toY(preLimitUpClose);
  const curY = toY(currentPrice);

  return (
    <svg width={width} height={height} className="shrink-0 rounded border border-border bg-background">
      {/* pre-limit-up close (起涨点) horizontal line */}
      <line x1={padX} y1={refY} x2={width - padX} y2={refY}
        stroke="#64748b" strokeWidth="0.8" strokeDasharray="3,2" />
      <text x={padX + 2} y={refY - 2} fontSize="8" fill="#64748b">起涨点 {preLimitUpClose.toFixed(2)}</text>

      {/* current price horizontal line */}
      <line x1={padX} y1={curY} x2={width - padX} y2={curY}
        stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="3,2" />
      <text x={width - padX - 60} y={curY - 2} fontSize="8" fill="#3b82f6">当前 {currentPrice.toFixed(2)}</text>

      {/* candlesticks */}
      {kline.map((d, i) => {
        const cx = padX + slot * i + slot / 2;
        const isUp = d.close >= d.open;
        const color = isUp ? "#ef4444" : "#10b981";
        const bodyTop = toY(Math.max(d.open, d.close));
        const bodyBottom = toY(Math.min(d.open, d.close));
        const bodyH = Math.max(1, bodyBottom - bodyTop);
        const isLimitUp = i === limitUpIdx;
        return (
          <g key={i}>
            {/* wick */}
            <line x1={cx} y1={toY(d.high)} x2={cx} y2={toY(d.low)} stroke={color} strokeWidth="1" />
            {/* body */}
            <rect
              x={cx - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={bodyH}
              fill={color}
              opacity={isLimitUp ? 1 : 0.85}
              stroke={isLimitUp ? "#fbbf24" : "none"}
              strokeWidth={isLimitUp ? 1 : 0}
            />
          </g>
        );
      })}
      {limitUpIdx >= 0 && (
        <text x={padX + slot * limitUpIdx + slot / 2} y={padY + 8}
          fontSize="8" fill="#fbbf24" textAnchor="middle">涨停</text>
      )}
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="w-32 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="w-20 h-5" />
              <Skeleton className="w-16 h-7" />
            </div>
          </div>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Card className="border-border/50 shadow-sm">
        <CardContent className="py-3 px-4">
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="border-border/50 shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-4" />
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-12 h-4" />
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-32 h-8" />
              <Skeleton className="w-16 h-4" />
              <Skeleton className="w-16 h-4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
        <p className="text-sm font-medium text-foreground">加载失败</p>
        <p className="text-xs mt-1 max-w-[320px] text-center">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4 gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          重试
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ totalScanned }: { totalScanned: number }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <TrendingDown className="w-10 h-10 mb-3" />
        <p className="text-sm font-medium text-foreground">暂无符合筛选条件的涨停回踩股票</p>
        <p className="text-xs mt-1 max-w-[320px] text-center">
          {totalScanned > 0
            ? `已扫描 ${totalScanned} 只涨停股，可尝试调低回踩深度阈值或放宽其他筛选条件`
            : "可能非交易时段或市场近期无符合条件个股"}
        </p>
      </CardContent>
    </Card>
  );
}

/** Approach progress bar with tooltip */
function ApproachBar({ pct }: { pct: number }) {
  const style = getApproachStyle(pct);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 w-full min-w-[110px] ml-auto">
            <div className="flex-1">
              <div className={`h-2 rounded-full border ${style.bg}`}>
                <div
                  className={`h-full rounded-full transition-all ${style.barColor}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
            <span className={`text-[11px] font-mono w-9 text-right ${style.text}`}>
              {pct.toFixed(0)}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-0.5">
            <div>回踩深度: {pct.toFixed(1)}% — {style.label}</div>
            <div className="text-muted-foreground">
              {pct >= 90 ? "已回到起涨点附近"
                : pct >= 70 ? "接近起涨点"
                : pct >= 50 ? "回踩过半"
                : "回踩较少"}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Summary statistics card - 6 metrics */
function SummaryCard({
  stocks,
  totalScanned,
}: {
  stocks: PullbackStock[];
  totalScanned: number;
}) {
  const total = stocks.length;
  const deepPullback = stocks.filter(s => s.approachPct >= 70).length;
  const avgApproach = total > 0
    ? stocks.reduce((s, st) => s + st.approachPct, 0) / total
    : 0;
  const todayUpCount = stocks.filter(s => s.currentChangePct > 0).length;
  const avgMaxPullback = total > 0
    ? stocks.reduce((s, st) => s + st.maxPullbackPct, 0) / total
    : 0;

  const cards: {
    icon: LucideIcon;
    title: string;
    value: string;
    subtitle: string;
    bg: string;
    fg: string;
  }[] = [
    {
      icon: BarChart3,
      title: "扫描总数",
      value: String(totalScanned),
      subtitle: "涨停候选股",
      bg: "bg-red-500/[0.04] border-red-500/15",
      fg: "text-red-600 dark:text-red-400",
    },
    {
      icon: Filter,
      title: "符合筛选",
      value: String(total),
      subtitle: "满足全部条件",
      bg: "bg-emerald-500/[0.04] border-emerald-500/15",
      fg: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: Target,
      title: "深度回踩",
      value: String(deepPullback),
      subtitle: "回踩 ≥ 70%",
      bg: "bg-orange-500/[0.04] border-orange-500/15",
      fg: "text-orange-600 dark:text-orange-400",
    },
    {
      icon: Activity,
      title: "平均回踩",
      value: `${avgApproach.toFixed(0)}%`,
      subtitle: "符合筛选均值",
      bg: "bg-yellow-500/[0.04] border-yellow-500/15",
      fg: "text-yellow-600 dark:text-yellow-400",
    },
    {
      icon: TrendingUp,
      title: "今日上涨",
      value: `${todayUpCount}/${total}`,
      subtitle: "今日反弹占比",
      bg: "bg-emerald-500/[0.04] border-emerald-500/15",
      fg: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: ArrowDownRight,
      title: "平均最大回撤",
      value: `-${avgMaxPullback.toFixed(1)}%`,
      subtitle: "符合筛选均值",
      bg: "bg-red-500/[0.04] border-red-500/15",
      fg: "text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border ${c.bg}`}
          >
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Icon className="w-3.5 h-3.5" />
              <span>{c.title}</span>
            </div>
            <span className={`text-xl font-bold font-mono ${c.fg}`}>{c.value}</span>
            <span className="text-[11px] text-muted-foreground">{c.subtitle}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Histogram of approach depth distribution */
function Histogram({ stocks }: { stocks: PullbackStock[] }) {
  const bins = [
    { range: "30-50%", min: 30, max: 50, color: "bg-emerald-500" },
    { range: "50-70%", min: 50, max: 70, color: "bg-yellow-500" },
    { range: "70-90%", min: 70, max: 90, color: "bg-orange-500" },
    { range: "90-100%", min: 90, max: 100, color: "bg-red-500" },
    { range: "回到起涨点", min: 100, max: Number.POSITIVE_INFINITY, color: "bg-rose-700" },
  ];

  const counts = bins.map(b =>
    stocks.filter(s =>
      b.max === Number.POSITIVE_INFINITY
        ? s.approachPct >= b.min
        : s.approachPct >= b.min && s.approachPct < b.max
    ).length
  );
  const maxCount = Math.max(...counts, 1);

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            <span>回踩深度分布</span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            共 {stocks.length} 只 · 按回踩深度区间统计
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {bins.map((b, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-xs font-mono font-medium text-foreground">
                {counts[i]}
              </span>
              <div className="w-full h-16 flex items-end rounded-sm bg-muted/40 overflow-hidden">
                <div
                  className={`w-full ${b.color} transition-all`}
                  style={{ height: `${(counts[i] / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {b.range}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Preset buttons row */
function PresetButtons({
  filters,
  onApply,
  activePresetId,
}: {
  filters: PullbackFilters;
  onApply: (preset: Preset) => void;
  activePresetId: string | null;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pullback-screener-scroll-x">
        <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
          <Zap className="w-3 h-3" />
          快捷预设:
        </span>
        {PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;
          const cc = PRESET_COLOR_CLASSES[preset.color];
          return (
            <Tooltip key={preset.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onApply(preset)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-all ${cc.badge} ${isActive ? cc.active : ""}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cc.dot}`} />
                  {preset.name}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[280px]">
                <div className="space-y-0.5">
                  <div className="font-medium">{preset.name}</div>
                  <div className="text-muted-foreground">{preset.desc}</div>
                  <div className="text-muted-foreground text-[10px] mt-1">
                    {isActive ? "再次点击恢复默认" : "点击应用此预设"}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/** Quick tag chips row */
function QuickTagChips({
  selected,
  onToggle,
  onClear,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-1 pullback-screener-scroll-x">
        <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
          <Layers className="w-3 h-3" />
          快速标签:
        </span>
        {QUICK_TAGS.map((tag) => {
          const active = selected.includes(tag.id);
          return (
            <button
              key={tag.id}
              onClick={() => onToggle(tag.id)}
              className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] transition-all ${
                active
                  ? "bg-primary/15 border-primary/50 text-primary ring-1 ring-primary/30"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <button
          onClick={onClear}
          className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border"
        >
          已选 {selected.length} 项
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── Filter Group (Collapsible sub-section) ─────────────

function FilterGroup({
  title,
  icon: Icon,
  open,
  onOpenChange,
  count,
  children,
}: {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between py-1.5 px-2 hover:bg-muted/40 rounded-md transition-colors">
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium">{title}</span>
            {count > 0 && (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-primary/10 text-primary">
                {count}
              </Badge>
            )}
          </div>
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Filter Panel ───────────────────────────────────────

function FilterPanel({
  filters,
  setFilters,
  onReset,
  isDefault,
}: {
  filters: PullbackFilters;
  setFilters: (f: PullbackFilters) => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  const toggleBoardType = (type: string) => {
    const current = filters.limitUpBoardTypes;
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    setFilters({ ...filters, limitUpBoardTypes: next });
  };

  // Local collapsible states for the 3 filter groups
  const [coreOpen, setCoreOpen] = useState(true);
  const [basicOpen, setBasicOpen] = useState(false);
  const [priceBoardOpen, setPriceBoardOpen] = useState(false);

  // Count non-default fields per group (for the badge next to group title)
  const coreCount =
    (filters.minApproachPct !== DEFAULT_FILTERS.minApproachPct ? 1 : 0) +
    (filters.maxDaysSinceLimitUp !== DEFAULT_FILTERS.maxDaysSinceLimitUp ? 1 : 0);
  const basicCount =
    (filters.maxMarketCap !== DEFAULT_FILTERS.maxMarketCap ? 1 : 0) +
    (filters.minTurnover !== DEFAULT_FILTERS.minTurnover ? 1 : 0) +
    (filters.minVolumeRatio !== DEFAULT_FILTERS.minVolumeRatio ? 1 : 0) +
    (filters.excludeST !== DEFAULT_FILTERS.excludeST ? 1 : 0);
  const priceBoardCount =
    (filters.minPrice !== DEFAULT_FILTERS.minPrice ? 1 : 0) +
    (filters.maxPrice !== DEFAULT_FILTERS.maxPrice ? 1 : 0) +
    (filters.minTodayChangePct !== DEFAULT_FILTERS.minTodayChangePct ? 1 : 0) +
    (filters.maxTodayChangePct !== DEFAULT_FILTERS.maxTodayChangePct ? 1 : 0) +
    (JSON.stringify(filters.limitUpBoardTypes) !== JSON.stringify(DEFAULT_FILTERS.limitUpBoardTypes) ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Group 1: Core (default open) */}
      <FilterGroup title="核心筛选" icon={Target} open={coreOpen} onOpenChange={setCoreOpen} count={coreCount}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Approach depth */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-orange-500" />
                回踩深度阈值
                <span className="text-muted-foreground font-normal">(approachPct 最小值)</span>
              </Label>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono bg-orange-500/5 border-orange-500/20 text-orange-600 dark:text-orange-400">
                ≥ {filters.minApproachPct}%
              </Badge>
            </div>
            <Slider
              value={[filters.minApproachPct]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setFilters({ ...filters, minApproachPct: v[0] })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0% (全部)</span>
              <span>100% (回到起涨点)</span>
            </div>
          </div>

          {/* Days since limit up */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                距涨停最大天数
                <span className="text-muted-foreground font-normal">(交易日)</span>
              </Label>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono bg-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-400">
                ≤ {filters.maxDaysSinceLimitUp} 天
              </Badge>
            </div>
            <Slider
              value={[filters.maxDaysSinceLimitUp]}
              min={1}
              max={15}
              step={1}
              onValueChange={(v) => setFilters({ ...filters, maxDaysSinceLimitUp: v[0] })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1 天</span>
              <span>15 天</span>
            </div>
          </div>
        </div>
      </FilterGroup>

      <Separator />

      {/* Group 2: Basic fundamentals (default collapsed) */}
      <FilterGroup title="基本面筛选" icon={PieChart} open={basicOpen} onOpenChange={setBasicOpen} count={basicCount}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Max market cap */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-purple-500" />
                最大市值上限
                <span className="text-muted-foreground font-normal">(亿)</span>
              </Label>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono bg-purple-500/5 border-purple-500/20 text-purple-600 dark:text-purple-400">
                {filters.maxMarketCap === 0 ? "不限" : `≤ ${filters.maxMarketCap} 亿`}
              </Badge>
            </div>
            <Slider
              value={[filters.maxMarketCap]}
              min={0}
              max={10000}
              step={50}
              onValueChange={(v) => setFilters({ ...filters, maxMarketCap: v[0] })}
              className="w-full"
            />
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>0 (不限)</span>
              <Input
                type="number"
                min={0}
                max={10000}
                value={filters.maxMarketCap}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(10000, Number(e.target.value) || 0));
                  setFilters({ ...filters, maxMarketCap: v });
                }}
                className="h-6 w-20 text-[11px] font-mono"
              />
              <span>10000 亿</span>
            </div>
          </div>

          {/* Min turnover */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                最小换手率
                <span className="text-muted-foreground font-normal">(%)</span>
              </Label>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                ≥ {filters.minTurnover.toFixed(1)}%
              </Badge>
            </div>
            <Slider
              value={[filters.minTurnover]}
              min={0}
              max={50}
              step={0.5}
              onValueChange={(v) => setFilters({ ...filters, minTurnover: v[0] })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Min volume ratio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                量比下限
              </Label>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400">
                ≥ {filters.minVolumeRatio.toFixed(1)}
              </Badge>
            </div>
            <Slider
              value={[filters.minVolumeRatio]}
              min={0}
              max={10}
              step={0.1}
              onValueChange={(v) => setFilters({ ...filters, minVolumeRatio: v[0] })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span>10</span>
            </div>
          </div>

          {/* Exclude ST */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-rose-500" />
              排除规则
            </Label>
            <div className="flex items-center gap-2 h-[36px] px-3 rounded-md border border-border bg-background">
              <Checkbox
                id="exclude-st"
                checked={filters.excludeST}
                onCheckedChange={(v) => setFilters({ ...filters, excludeST: v === true })}
              />
              <Label htmlFor="exclude-st" className="text-xs cursor-pointer">
                排除 ST / *ST 股票
              </Label>
            </div>
          </div>
        </div>
      </FilterGroup>

      <Separator />

      {/* Group 3: Price & Board (default collapsed) */}
      <FilterGroup title="价格与板块" icon={SlidersHorizontal} open={priceBoardOpen} onOpenChange={setPriceBoardOpen} count={priceBoardCount}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Price range */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-500" />
                价格区间
                <span className="text-muted-foreground font-normal">(元, 0=不限)</span>
              </Label>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono bg-cyan-500/5 border-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                {filters.minPrice === 0 && filters.maxPrice === 0
                  ? "不限"
                  : `${filters.minPrice || 0} ~ ${filters.maxPrice === 0 ? "∞" : filters.maxPrice}`}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={filters.minPrice === 0 ? "" : filters.minPrice}
                placeholder="最低"
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0);
                  setFilters({ ...filters, minPrice: v });
                }}
                className="h-7 text-xs font-mono"
              />
              <span className="text-muted-foreground text-xs">~</span>
              <Input
                type="number"
                min={0}
                value={filters.maxPrice === 0 ? "" : filters.maxPrice}
                placeholder="最高"
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0);
                  setFilters({ ...filters, maxPrice: v });
                }}
                className="h-7 text-xs font-mono"
              />
            </div>
          </div>

          {/* Today change range */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
                今日涨跌幅区间
                <span className="text-muted-foreground font-normal">(%)</span>
              </Label>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-400">
                {filters.minTodayChangePct}% ~ {filters.maxTodayChangePct}%
              </Badge>
            </div>
            <Slider
              value={[filters.minTodayChangePct, filters.maxTodayChangePct]}
              min={-10}
              max={10}
              step={0.5}
              onValueChange={(v) =>
                setFilters({
                  ...filters,
                  minTodayChangePct: v[0],
                  maxTodayChangePct: v[1],
                })
              }
              className="w-full"
            />
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-muted-foreground">-10%</span>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    setFilters({
                      ...filters,
                      minTodayChangePct: 0,
                      maxTodayChangePct: 10,
                    })
                  }
                  className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted text-[10px]"
                >
                  今日反弹
                </button>
                <button
                  onClick={() =>
                    setFilters({
                      ...filters,
                      minTodayChangePct: -10,
                      maxTodayChangePct: 0,
                    })
                  }
                  className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted text-[10px]"
                >
                  今日下跌
                </button>
              </div>
              <span className="text-muted-foreground">+10%</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label className="text-xs flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-violet-500" />
            涨停板类型
            <span className="text-muted-foreground font-normal">(按代码前缀自动判断)</span>
          </Label>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { type: "10%", label: "主板 (10%)", hint: "60/00 开头" },
              { type: "20%", label: "创业板/科创板 (20%)", hint: "688/30 开头" },
              { type: "30%", label: "北交所 (30%)", hint: "8 开头" },
            ].map(({ type, label, hint }) => {
              const checked = filters.limitUpBoardTypes.includes(type);
              return (
                <div
                  key={type}
                  className={`flex items-center gap-2 h-[34px] px-3 rounded-md border transition-colors ${
                    checked
                      ? "border-violet-500/40 bg-violet-500/5"
                      : "border-border bg-background"
                  }`}
                >
                  <Checkbox
                    id={`board-${type}`}
                    checked={checked}
                    onCheckedChange={() => toggleBoardType(type)}
                  />
                  <Label htmlFor={`board-${type}`} className="text-xs cursor-pointer flex items-center gap-1.5">
                    <span className="font-medium">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{hint}</span>
                  </Label>
                </div>
              );
            })}
            {filters.limitUpBoardTypes.length === 0 && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                未选中任何板块，将不显示结果
              </span>
            )}
          </div>
        </div>
      </FilterGroup>

      {/* Reset */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <SlidersHorizontal className="w-3 h-3" />
          <span>所有筛选条件 + 预设 + 标签 + 策略自动保存到本地</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={isDefault}
          className="h-7 text-[11px] gap-1"
        >
          <RotateCcw className="w-3 h-3" />
          重置默认
        </Button>
      </div>
    </div>
  );
}

// ── Sortable table header cell ─────────────────────────

function SortableHead({
  label,
  field,
  current,
  order,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  field: SortField;
  current: SortField;
  order: SortOrder;
  onSort: (f: SortField) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = current === field;
  return (
    <TableHead
      className={`text-[11px] font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors ${align === "right" ? "text-right" : ""} ${className ?? ""}`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        <span>{label}</span>
        {active ? (
          order === "desc"
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronUp className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}

// ── Risk Score cell ────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const style = getRiskStyle(score);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${style.bg} ${style.text}`}>
            <AlertTriangle className="w-2.5 h-2.5" />
            <span className="text-[11px] font-mono font-medium">{score}</span>
            <span className="text-[10px] opacity-80">{style.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div>风险评分: {score}/100 — {style.label}风险</div>
          <div className="text-muted-foreground text-[10px] mt-1">
            综合回踩深度、最大回撤、距涨停天数、今日跌幅
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Expanded Row Detail ────────────────────────────────

function ExpandedRowDetail({ stock }: { stock: PullbackStock }) {
  const riskScore = calcRiskScore(stock);
  const riskStyle = getRiskStyle(riskScore);
  const approachStyle = getApproachStyle(stock.approachPct);

  const contrib = {
    approach: stock.approachPct * 0.35,
    maxPullback: stock.maxPullbackPct * 0.25,
    days: Math.min(stock.daysSinceLimitUp * 3, 30) * 0.15,
    todayDrop: Math.max(0, -stock.currentChangePct) * 0.25,
  };

  const dataRows: { label: string; value: string; cls?: string }[] = [
    { label: "涨停日", value: stock.limitUpDate },
    { label: "涨停涨幅", value: `+${stock.limitUpPct.toFixed(2)}%`, cls: "text-red-500" },
    { label: "涨停价", value: stock.limitUpClose.toFixed(2), cls: "text-red-500/80" },
    { label: "起涨点", value: stock.preLimitUpClose.toFixed(2), cls: "text-muted-foreground" },
    { label: "当前价", value: stock.currentPrice.toFixed(2), cls: stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500" },
    { label: "距涨停", value: `${stock.daysSinceLimitUp} 天` },
    { label: "回撤幅度", value: `-${stock.pullbackPct.toFixed(1)}%`, cls: "text-red-500/80" },
    { label: "最大回撤日期", value: stock.maxPullbackDate || "--" },
    { label: "换手率", value: stock.turnover > 0 ? `${stock.turnover.toFixed(2)}%` : "--" },
    { label: "市值", value: stock.marketCap > 0 ? formatMarketCap(stock.marketCap) : "--" },
    { label: "量比", value: stock.volumeRatio > 0 ? stock.volumeRatio.toFixed(2) : "--" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_220px] gap-4 p-3 bg-muted/20">
      {/* Left: Large K-line chart */}
      <div className="flex flex-col gap-2 items-start">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <BarChart3 className="w-3 h-3" />
          K线走势 ({stock.klineSummary?.length ?? 0} 日)
        </span>
        <LargeKlineChart
          kline={stock.klineSummary}
          limitUpDate={stock.limitUpDate}
          preLimitUpClose={stock.preLimitUpClose}
          currentPrice={stock.currentPrice}
        />
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-yellow-400 inline-block" />
            涨停日
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-slate-500 inline-block" style={{ borderTop: "1px dashed" }} />
            起涨点
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-blue-500 inline-block" />
            当前价
          </span>
        </div>
      </div>

      {/* Middle: Data table */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Activity className="w-3 h-3" />
          详细数据
        </span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          {dataRows.map((r, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`font-mono font-medium ${r.cls ?? "text-foreground"}`}>{r.value}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-muted-foreground">回踩深度:</span>
          <div className="flex-1 max-w-[200px]">
            <ApproachBar pct={stock.approachPct} />
          </div>
          <Badge variant="outline" className={`text-[10px] ${approachStyle.bg} ${approachStyle.text}`}>
            {approachStyle.label}
          </Badge>
        </div>
      </div>

      {/* Right: Risk score card */}
      <div className={`flex flex-col gap-2 p-3 rounded-lg border ${riskStyle.bg}`}>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="w-3 h-3" />
          <span>综合风险评分</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold font-mono ${riskStyle.text}`}>{riskScore}</span>
          <span className="text-xs text-muted-foreground">/100</span>
          <Badge variant="outline" className={`ml-auto text-[10px] ${riskStyle.bg} ${riskStyle.text}`}>
            {riskStyle.label}风险
          </Badge>
        </div>
        <Separator className="my-1" />
        <div className="space-y-1 text-[10px]">
          <div className="text-muted-foreground font-medium mb-1">评分构成:</div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">回踩深度 × 0.35</span>
            <span className="font-mono text-foreground">+{contrib.approach.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">最大回撤 × 0.25</span>
            <span className="font-mono text-foreground">+{contrib.maxPullback.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">距涨停天数 × 0.15</span>
            <span className="font-mono text-foreground">+{contrib.days.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">今日跌幅 × 0.25</span>
            <span className="font-mono text-foreground">+{contrib.todayDrop.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────

function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  if (totalItems === 0) return null;
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="py-2.5 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>
              显示 <span className="font-mono text-foreground">{start}</span>-
              <span className="font-mono text-foreground">{end}</span> /
              共 <span className="font-mono text-foreground">{totalItems}</span> 只
            </span>
            <Separator orientation="vertical" className="h-3" />
            <span>每页</span>
            <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
              {[20, 50, 100].map((s) => (
                <button
                  key={s}
                  onClick={() => onPageSizeChange(s)}
                  className={`px-2 py-0.5 text-[11px] rounded-sm transition-colors ${
                    pageSize === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="h-7 text-[11px] gap-1"
            >
              <ChevronUp className="w-3 h-3 rotate-[-90deg]" />
              上一页
            </Button>
            <span className="px-2 text-muted-foreground font-mono">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="h-7 text-[11px] gap-1"
            >
              下一页
              <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card View ─────────────────────────────────────────

function StockCardViewItem({
  stock,
  isFavorite,
  onToggleFavorite,
  onSelectStock,
}: {
  stock: PullbackStock;
  isFavorite: boolean;
  onToggleFavorite: (symbol: string) => void;
  onSelectStock?: (symbol: string) => void;
}) {
  const approachStyle = getApproachStyle(stock.approachPct);
  const riskScore = calcRiskScore(stock);
  const boardType = getBoardType(stock.symbol);

  return (
    <Card
      className="border-border/50 shadow-sm cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
      onClick={() => onSelectStock?.(stock.symbol)}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: code + name + favorite */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-foreground">{stock.symbol}</span>
              <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                {boardType}
              </Badge>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-medium truncate max-w-[140px]">
                    {stock.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {stock.name} ({stock.symbol})
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(stock.symbol);
            }}
            className={`p-1 rounded transition-colors ${
              isFavorite
                ? "text-yellow-500 hover:bg-yellow-500/10"
                : "text-muted-foreground hover:bg-muted"
            }`}
            aria-label={isFavorite ? "取消收藏" : "收藏"}
          >
            <Star className={`w-4 h-4 ${isFavorite ? "fill-current" : ""}`} />
          </button>
        </div>

        {/* Mini K-line chart (responsive: bigger on desktop via wrapper) */}
        <div className="flex justify-center bg-muted/20 rounded p-1">
          <MiniKlineChart
            kline={stock.klineSummary}
            limitUpDate={stock.limitUpDate}
            preLimitUpClose={stock.preLimitUpClose}
            width={180}
            height={50}
          />
        </div>

        {/* Data grid */}
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <TrendingUp className="w-2.5 h-2.5 text-red-500" />
            涨停:
            <span className="font-mono text-foreground">{stock.limitUpDate.slice(5)}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            当前价:
            <span className={`font-mono font-medium ${stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500"}`}>
              {stock.currentPrice.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-2.5 h-2.5" />
            距涨停:
            <span className="font-mono text-foreground">{stock.daysSinceLimitUp}天</span>
          </div>
          <div className="flex items-center justify-end">
            <RiskBadge score={riskScore} />
          </div>
        </div>

        {/* Approach bar */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground w-12 shrink-0">回踩:</span>
          <div className="flex-1">
            <div className={`h-1.5 rounded-full border ${approachStyle.bg}`}>
              <div
                className={`h-full rounded-full ${approachStyle.barColor}`}
                style={{ width: `${Math.max(stock.approachPct, 2)}%` }}
              />
            </div>
          </div>
          <span className={`text-[10px] font-mono ${approachStyle.text}`}>
            {stock.approachPct.toFixed(0)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Keyboard shortcut hints ────────────────────────────

function KbdHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1 py-0 rounded border border-border bg-background font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  );
}

function KeyboardHints() {
  return (
    <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
      <Keyboard className="w-3 h-3" />
      <span className="hidden sm:inline">快捷键:</span>
      <span className="inline-flex items-center gap-1">
        <KbdHint>j</KbdHint>
        <KbdHint>k</KbdHint>
        上下
      </span>
      <span className="inline-flex items-center gap-1">
        <KbdHint>Enter</KbdHint>
        展开
      </span>
      <span className="inline-flex items-center gap-1">
        <KbdHint>f</KbdHint>
        收藏
      </span>
      <span className="inline-flex items-center gap-1">
        <KbdHint>/</KbdHint>
        搜索
      </span>
      <span className="inline-flex items-center gap-1">
        <KbdHint>Esc</KbdHint>
        清除
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

export const LimitUpPullbackScreener = React.memo(function LimitUpPullbackScreener({
  onSelectStock,
}: LimitUpPullbackScreenerProps) {
  const cacheKey = "pullback-screener:default";
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize from localStorage so last query result shows instantly on mount
  const [result, setResult] = useState<PullbackResult | null>(() => {
    if (typeof window === "undefined") return getCachedData<PullbackResult>(cacheKey);
    try {
      const saved = localStorage.getItem(LAST_RESULT_KEY);
      if (saved) return JSON.parse(saved) as PullbackResult;
    } catch {}
    return getCachedData<PullbackResult>(cacheKey);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<string>("");

  // Filters (live "draft" state - what sliders/Badges display, updated immediately on slider drag)
  const [filters, setFilters] = useState<PullbackFilters>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    try {
      const saved = localStorage.getItem(LAST_FILTERS_KEY);
      if (saved) return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_FILTERS;
  });
  // Debounced filters - what actually drives filteredStocks (300ms after slider stops)
  const [debouncedFilters, setDebouncedFilters] = useState<PullbackFilters>(filters);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Sort
  const [sortField, setSortField] = useState<SortField>("approachPct");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Search (二级过滤, 独立于 filters)
  const [searchTerm, setSearchTerm] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(LAST_SEARCH_KEY) || "";
    } catch {
      return "";
    }
  });

  // Quick tags
  const [quickTags, setQuickTags] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(LAST_TAGS_KEY);
      if (saved) return JSON.parse(saved) as string[];
    } catch {}
    return [];
  });

  // Favorites
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) return JSON.parse(saved) as string[];
    } catch {}
    return [];
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // View mode - default card on mobile if no saved preference
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "table";
    try {
      const saved = localStorage.getItem(LAST_VIEW_KEY);
      if (saved === "card" || saved === "table") return saved;
    } catch {}
    if (typeof window !== "undefined" && window.innerWidth < 640) return "card";
    return "table";
  });

  // Pagination
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === "undefined") return 50;
    try {
      const saved = localStorage.getItem(LAST_PAGE_SIZE_KEY);
      if (saved) {
        const n = Number(saved);
        if (n === 20 || n === 50 || n === 100) return n;
      }
    } catch {}
    return 50;
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Expanded rows (not persisted)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Selected row symbol (keyboard navigation highlight)
  const [selectedRowSymbol, setSelectedRowSymbol] = useState<string | null>(null);

  // Saved strategies
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STRATEGIES_KEY);
      if (saved) return JSON.parse(saved) as SavedStrategy[];
    } catch {}
    return [];
  });
  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [strategyName, setStrategyName] = useState("");

  const handleSort = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortOrder(prev => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }, [sortField]);

  // ── Debounce filters: 300ms after slider stops ──────
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);

  // ── Fetch data ────────────────────────────────────────
  const fetchData = useCallback(async (forceRefresh = false) => {
    const cachedResult = getCachedData<PullbackResult>(cacheKey);
    const hasFreshCache = cachedResult && isCacheFresh(cacheKey, 600_000);

    if (!hasFreshCache || forceRefresh) {
      setLoading(true);
    } else {
      setResult(cachedResult);
      setIsFromCache(true);
    }

    setError(null);
    try {
      const data: PullbackResult = await cachedFetch<PullbackResult>(
        cacheKey,
        async () => {
          const res = await fetch(
            `/api/stock/limit-up-pullback${forceRefresh ? "?refresh=1" : ""}`
          );
          if (!res.ok) throw new Error("涨停回踩分析失败");
          return res.json();
        },
        forceRefresh ? 0 : 600_000 // 10 min cache
      );

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        setIsFromCache(Boolean(data.cached));
        // Persist to localStorage so next mount shows last result immediately
        try {
          localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(data));
        } catch {}
      } else {
        setError(data.error || "涨停回踩分析失败");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "网络错误";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Persist debouncedFilters (NOT live draft) to localStorage to avoid storing mid-drag state
  useEffect(() => {
    try {
      localStorage.setItem(LAST_FILTERS_KEY, JSON.stringify(debouncedFilters));
    } catch {}
  }, [debouncedFilters]);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_SEARCH_KEY, searchTerm);
    } catch {}
  }, [searchTerm]);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_TAGS_KEY, JSON.stringify(quickTags));
    } catch {}
  }, [quickTags]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_VIEW_KEY, view);
    } catch {}
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_PAGE_SIZE_KEY, String(pageSize));
    } catch {}
  }, [pageSize]);

  // Persist saved strategies
  useEffect(() => {
    try {
      localStorage.setItem(STRATEGIES_KEY, JSON.stringify(savedStrategies));
    } catch {}
  }, [savedStrategies]);

  // Reset to page 1 when filters/search/tags/sort/favorite-mode change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedFilters, searchTerm, quickTags, sortField, sortOrder, showFavoritesOnly]);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setQuickTags([]);
  }, []);

  const handleToggleFavorite = useCallback((symbol: string) => {
    setFavorites(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  }, []);

  const handleToggleExpand = useCallback((symbol: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  }, []);

  const handleToggleTag = useCallback((id: string) => {
    setQuickTags(prev =>
      prev.includes(id)
        ? prev.filter(t => t !== id)
        : [...prev, id]
    );
  }, []);

  const handleApplyPreset = useCallback((preset: Preset) => {
    setFilters({ ...preset.filters });
  }, []);

  // Strategy save/load handlers
  const handleSaveStrategy = useCallback(() => {
    const name = strategyName.trim();
    if (!name) return;
    const newStrat: SavedStrategy = {
      id: Date.now().toString(),
      name,
      filters: { ...filters },
      tags: [...quickTags],
      createdAt: new Date().toISOString(),
    };
    setSavedStrategies(prev => {
      let next = [...prev, newStrat];
      // Keep at most 10 strategies, drop oldest
      if (next.length > 10) {
        next = next.slice(next.length - 10);
      }
      return next;
    });
    setStrategyName("");
    setShowStrategyForm(false);
  }, [strategyName, filters, quickTags]);

  const handleApplyStrategy = useCallback((s: SavedStrategy) => {
    setFilters({ ...s.filters });
    setQuickTags([...s.tags]);
    setShowStrategyForm(false);
    setStrategyName("");
  }, []);

  const handleDeleteStrategy = useCallback((id: string) => {
    setSavedStrategies(prev => prev.filter(s => s.id !== id));
  }, []);

  // ── Apply filters + sort + search + tags + favorites mode ────
  // Uses debouncedFilters so slider drags don't cause page jank
  const filteredStocks = useMemo(() => {
    if (!result?.stocks) return [];
    const search = searchTerm.trim().toLowerCase();
    const tagsToApply = QUICK_TAGS.filter(t => quickTags.includes(t.id));

    const filtered = result.stocks.filter((s) => {
      // Existing filters
      if (s.approachPct < debouncedFilters.minApproachPct) return false;
      if (s.daysSinceLimitUp > debouncedFilters.maxDaysSinceLimitUp) return false;
      if (debouncedFilters.maxMarketCap > 0 && s.marketCap > debouncedFilters.maxMarketCap) return false;
      if (s.turnover < debouncedFilters.minTurnover) return false;
      if (s.volumeRatio < debouncedFilters.minVolumeRatio) return false;
      if (debouncedFilters.excludeST && (s.name.includes("ST") || s.name.includes("*ST"))) return false;

      // New filters: price range
      if (debouncedFilters.minPrice > 0 && s.currentPrice < debouncedFilters.minPrice) return false;
      if (debouncedFilters.maxPrice > 0 && s.currentPrice > debouncedFilters.maxPrice) return false;

      // New filters: today change range
      if (s.currentChangePct < debouncedFilters.minTodayChangePct) return false;
      if (s.currentChangePct > debouncedFilters.maxTodayChangePct) return false;

      // New filters: board types (empty array → show nothing)
      if (debouncedFilters.limitUpBoardTypes.length === 0) return false;
      if (!debouncedFilters.limitUpBoardTypes.includes(getBoardType(s.symbol))) return false;

      // Quick tags (AND logic - all selected tags must match)
      if (tagsToApply.length > 0) {
        if (!tagsToApply.every(t => t.filter(s))) return false;
      }

      // Search (二级过滤)
      if (search) {
        const matches =
          s.symbol.toLowerCase().includes(search) ||
          s.name.toLowerCase().includes(search);
        if (!matches) return false;
      }

      // Favorites-only mode
      if (showFavoritesOnly && !favorites.includes(s.symbol)) return false;

      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aVal = sortField === "riskScore"
        ? calcRiskScore(a)
        : a[sortField];
      const bVal = sortField === "riskScore"
        ? calcRiskScore(b)
        : b[sortField];
      if (sortOrder === "desc") return (bVal as number) - (aVal as number);
      return (aVal as number) - (bVal as number);
    });
    return sorted;
  }, [result, debouncedFilters, sortField, sortOrder, searchTerm, quickTags, showFavoritesOnly, favorites]);

  // isDefaultFilters / activePreset use the live `filters` (draft) for instant UI feedback
  const isDefaultFilters = useMemo(
    () => JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS),
    [filters]
  );

  const activePreset = useMemo(
    () => PRESETS.find(p => JSON.stringify(p.filters) === JSON.stringify(filters)) ?? null,
    [filters]
  );

  // ── Pagination ────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredStocks.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedStocks = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredStocks.slice(start, start + pageSize);
  }, [filteredStocks, safePage, pageSize]);

  // ── Keyboard shortcuts ────────────────────────────────
  // j/ArrowDown: next row · k/ArrowUp: prev row · Enter: expand selected ·
  // f: toggle favorite · / : focus search · Esc: clear selection + collapse
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false);

      // Esc works everywhere (including inside inputs - blur + clear selection + collapse all)
      if (e.key === "Escape") {
        setSelectedRowSymbol(null);
        setExpandedRows(new Set());
        if (isInput && target instanceof HTMLElement) {
          (target as HTMLElement).blur();
        }
        return;
      }

      // Skip remaining shortcuts when an input/textarea/select is focused
      if (isInput) return;

      // Enter: toggle expand on the currently selected row
      if (e.key === "Enter" && selectedRowSymbol) {
        e.preventDefault();
        setExpandedRows(prev => {
          const next = new Set(prev);
          if (next.has(selectedRowSymbol)) {
            next.delete(selectedRowSymbol);
          } else {
            next.add(selectedRowSymbol);
          }
          return next;
        });
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedRowSymbol(prev => {
          const idx = pagedStocks.findIndex(s => s.symbol === prev);
          if (idx < 0) return pagedStocks[0]?.symbol ?? null;
          return pagedStocks[Math.min(idx + 1, pagedStocks.length - 1)]?.symbol ?? null;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedRowSymbol(prev => {
          const idx = pagedStocks.findIndex(s => s.symbol === prev);
          if (idx <= 0) return pagedStocks[0]?.symbol ?? null;
          return pagedStocks[idx - 1]?.symbol ?? null;
        });
      } else if (e.key === "f" && selectedRowSymbol) {
        e.preventDefault();
        handleToggleFavorite(selectedRowSymbol);
      } else if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pagedStocks, selectedRowSymbol, handleToggleFavorite]);

  // ── CSV Export ────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (filteredStocks.length === 0) return;
    const headers = [
      "代码", "名称", "涨停日", "涨停涨幅%", "涨停价", "起涨点",
      "当前价", "今日涨跌%", "回踩深度%", "距涨停天数",
      "最大回撤%", "换手率%", "市值(亿)", "量比",
    ];
    const rows = filteredStocks.map(s => [
      s.symbol,
      s.name,
      s.limitUpDate,
      s.limitUpPct.toFixed(2),
      s.limitUpClose.toFixed(2),
      s.preLimitUpClose.toFixed(2),
      s.currentPrice.toFixed(2),
      s.currentChangePct.toFixed(2),
      s.approachPct.toFixed(1),
      s.daysSinceLimitUp,
      s.maxPullbackPct.toFixed(2),
      s.turnover.toFixed(2),
      s.marketCap.toFixed(2),
      s.volumeRatio.toFixed(2),
    ]);

    const BOM = "\uFEFF";
    const csv =
      BOM +
      [headers, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const filename = `涨停回踩筛选_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredStocks]);

  // ── Render ────────────────────────────────────────────

  if (loading && !result) {
    return <LoadingSkeleton />;
  }

  if (error && !result) {
    return <ErrorState error={error} onRetry={() => fetchData(true)} />;
  }

  // Shared view-toggle component (rendered in different positions for desktop/mobile)
  const renderViewToggle = (className = "") => (
    <div className={`inline-flex items-center rounded-md border border-border bg-background p-0.5 ${className}`}>
      <button
        onClick={() => setView("table")}
        className={`px-2 py-0.5 text-[11px] rounded-sm inline-flex items-center gap-1 transition-colors ${
          view === "table"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted"
        }`}
      >
        <TableIcon className="w-3 h-3" />
        表格
      </button>
      <button
        onClick={() => setView("card")}
        className={`px-2 py-0.5 text-[11px] rounded-sm inline-flex items-center gap-1 transition-colors ${
          view === "card"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted"
        }`}
      >
        <LayoutGrid className="w-3 h-3" />
        卡片
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header Card ──────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-500" />
              <CardTitle className="text-base font-semibold">涨停回踩选股</CardTitle>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 gap-1 bg-orange-500/5 border-orange-500/20 text-orange-600 dark:text-orange-400">
                <TrendingUp className="w-3 h-3" />
                近半月
              </Badge>
              {result?.date && (
                <span className="text-xs text-muted-foreground">{result.date}</span>
              )}
            </div>
            {/* Desktop-only buttons here; mobile buttons live in the Filter Card */}
            <div className="flex items-center gap-2 flex-wrap">
              {isFromCache && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1 bg-muted/50 text-muted-foreground">
                  <Database className="w-3 h-3" />
                  缓存
                </Badge>
              )}
              {lastFetchTime && (
                <span className="text-[11px] text-muted-foreground hidden sm:inline">{lastFetchTime}</span>
              )}
              {/* Export CSV - desktop only here (mobile shows in filter card) */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={filteredStocks.length === 0}
                className="hidden sm:inline-flex h-7 text-xs gap-1"
              >
                <Download className="w-3 h-3" />
                导出CSV
              </Button>
              {/* View toggle - desktop only here */}
              {renderViewToggle("hidden sm:inline-flex")}
              {/* Refresh - desktop only here */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(true)}
                disabled={loading}
                className="hidden sm:inline-flex h-7 text-xs gap-1"
              >
                {loading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                刷新
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            筛选近半月内曾涨停、此后回落逼近涨停前起涨点的股票。支持多维度筛选、快捷预设、快速标签、收藏、风险评分、视图切换、CSV导出与分页。
          </p>
        </CardHeader>
      </Card>

      {/* ── Summary ──────────────────────────────────── */}
      {result && (
        <SummaryCard
          stocks={filteredStocks}
          totalScanned={result.summary.totalScanned}
        />
      )}

      {/* ── Histogram ───────────────────────────────── */}
      {result && filteredStocks.length > 0 && (
        <Histogram stocks={filteredStocks} />
      )}

      {/* ── Search + Presets + Chips + Filter Panel ── */}
      <Card className="border-border/50 shadow-sm">
        {/* Row 1: Search (flex-1) + mobile-only view-toggle + refresh + favorites + mobile-only CSV */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border/50">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索代码或名称... (按 / 聚焦)"
              className="h-8 pl-8 pr-7 text-xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="清空搜索"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Mobile-only view toggle */}
          {renderViewToggle("sm:hidden")}

          {/* Mobile-only refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={loading}
            className="sm:hidden h-8 px-2"
            aria-label="刷新"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>

          {/* Favorites toggle (always visible) */}
          <Button
            variant={showFavoritesOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFavoritesOnly(v => !v)}
            className="h-8 text-xs gap-1 shrink-0"
          >
            <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-current" : ""}`} />
            <span className="hidden sm:inline">我的收藏</span>
            <Badge
              variant="secondary"
              className={`text-[10px] py-0 px-1.5 ml-0.5 ${
                showFavoritesOnly
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {favorites.length}
            </Badge>
          </Button>

          {/* Mobile-only CSV export */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredStocks.length === 0}
            className="sm:hidden h-8 px-2"
            aria-label="导出CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Row 2: Presets + Save Strategy button */}
        <div className="p-3 border-b border-border/50 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 overflow-hidden">
              <PresetButtons
                filters={filters}
                onApply={handleApplyPreset}
                activePresetId={activePreset?.id ?? null}
              />
            </div>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowStrategyForm(v => !v);
                      if (!showStrategyForm) setStrategyName("");
                    }}
                    className="h-7 text-xs gap-1 shrink-0"
                  >
                    <Save className="w-3 h-3" />
                    <span className="hidden sm:inline">保存策略</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  保存当前筛选条件 + 标签为新策略（最多 10 个）
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Inline save-strategy form */}
          {showStrategyForm && (
            <div className="flex items-center gap-2">
              <Input
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveStrategy();
                  } else if (e.key === "Escape") {
                    setShowStrategyForm(false);
                    setStrategyName("");
                  }
                }}
                placeholder="策略名称（如：激进短线）"
                className="h-7 text-xs flex-1"
                maxLength={20}
                autoFocus
              />
              <Button
                onClick={handleSaveStrategy}
                size="sm"
                disabled={!strategyName.trim()}
                className="h-7 text-xs gap-1"
              >
                <Save className="w-3 h-3" />
                保存
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowStrategyForm(false);
                  setStrategyName("");
                }}
                className="h-7 text-xs"
              >
                取消
              </Button>
            </div>
          )}

          {/* Saved strategies list (horizontal scrollable) */}
          {savedStrategies.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pullback-screener-scroll-x">
              <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
                <Bookmark className="w-3 h-3" />
                已保存:
              </span>
              {savedStrategies.map(s => (
                <div
                  key={s.id}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-background text-[11px]"
                >
                  <button
                    onClick={() => handleApplyStrategy(s)}
                    className="hover:text-primary transition-colors"
                    title={`应用策略: ${s.name}（点击应用）`}
                  >
                    {s.name}
                  </button>
                  <button
                    onClick={() => handleDeleteStrategy(s.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                    aria-label="删除策略"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick tags */}
        <div className="p-3 border-b border-border/50">
          <QuickTagChips
            selected={quickTags}
            onToggle={handleToggleTag}
            onClear={() => setQuickTags([])}
          />
        </div>

        {/* Filter panel (collapsible) */}
        <Collapsible open={filtersExpanded} onOpenChange={setFiltersExpanded}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">筛选条件</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                  {filteredStocks.length} 只
                </Badge>
                {!isDefaultFilters && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-primary/10 text-primary">
                    已调整
                  </Badge>
                )}
                {activePreset && (
                  <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${PRESET_COLOR_CLASSES[activePreset.color].badge}`}>
                    {activePreset.name}
                  </Badge>
                )}
                {quickTags.length > 0 && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-primary/5 border-primary/20 text-primary">
                    {quickTags.length} 标签
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="hidden sm:inline">回踩≥{filters.minApproachPct}% · ≤{filters.maxDaysSinceLimitUp}天 · {filters.excludeST ? "排除ST" : "含ST"}</span>
                {filtersExpanded
                  ? <ChevronUp className="w-4 h-4" />
                  : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator />
            <CardContent className="py-4">
              <FilterPanel
                filters={filters}
                setFilters={setFilters}
                onReset={handleResetFilters}
                isDefault={isDefaultFilters && quickTags.length === 0}
              />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ── Stock Table / Card View ─────────────────── */}
      {result && filteredStocks.length > 0 ? (
        view === "table" ? (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto pullback-screener-scroll">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent sticky top-0 bg-background z-10">
                      {/* Sticky col 1: expand icon */}
                      <TableHead className="text-[11px] font-medium w-[36px] text-center sticky left-0 z-20 bg-background border-r border-border/40" />
                      {/* Sticky col 2: code/name */}
                      <TableHead
                        className="text-[11px] font-medium w-[110px] sticky z-20 bg-background border-r border-border/40"
                        style={{ left: "36px" }}
                      >
                        代码 / 名称
                      </TableHead>
                      <TableHead className="text-[11px] font-medium w-[80px]">涨停日</TableHead>
                      <SortableHead label="涨停涨幅" field="limitUpPct" current={sortField} order={sortOrder} onSort={handleSort} className="w-[68px]" align="right" />
                      <SortableHead label="涨停价" field="limitUpClose" current={sortField} order={sortOrder} onSort={handleSort} className="w-[56px]" align="right" />
                      <SortableHead label="起涨点" field="preLimitUpClose" current={sortField} order={sortOrder} onSort={handleSort} className="w-[56px]" align="right" />
                      <SortableHead label="当前价" field="currentPrice" current={sortField} order={sortOrder} onSort={handleSort} className="w-[60px]" align="right" />
                      <SortableHead label="今日涨跌" field="currentChangePct" current={sortField} order={sortOrder} onSort={handleSort} className="w-[64px]" align="right" />
                      <SortableHead label="回踩深度" field="approachPct" current={sortField} order={sortOrder} onSort={handleSort} className="w-[130px]" align="right" />
                      <SortableHead label="距涨停" field="daysSinceLimitUp" current={sortField} order={sortOrder} onSort={handleSort} className="w-[56px]" align="right" />
                      <SortableHead label="最大回撤" field="maxPullbackPct" current={sortField} order={sortOrder} onSort={handleSort} className="w-[68px]" align="right" />
                      <SortableHead label="风险" field="riskScore" current={sortField} order={sortOrder} onSort={handleSort} className="w-[78px]" align="right" />
                      <SortableHead label="换手率" field="turnover" current={sortField} order={sortOrder} onSort={handleSort} className="w-[60px]" align="right" />
                      <SortableHead label="市值" field="marketCap" current={sortField} order={sortOrder} onSort={handleSort} className="w-[64px]" align="right" />
                      <SortableHead label="量比" field="volumeRatio" current={sortField} order={sortOrder} onSort={handleSort} className="w-[50px]" align="right" />
                      <TableHead className="text-[11px] font-medium w-[110px]">走势</TableHead>
                      <TableHead className="text-[11px] font-medium w-[40px] text-center">收藏</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedStocks.map((stock) => {
                      const riskScore = calcRiskScore(stock);
                      const isFav = favorites.includes(stock.symbol);
                      const isExpanded = expandedRows.has(stock.symbol);
                      const isSelected = selectedRowSymbol === stock.symbol;
                      const stickyBg = isSelected
                        ? "bg-primary/10"
                        : "bg-background group-hover:bg-muted/50";

                      return (
                        <React.Fragment key={stock.symbol}>
                          <TableRow
                            className={`group cursor-pointer transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}`}
                            onClick={() => onSelectStock?.(stock.symbol)}
                          >
                            {/* Expand toggle - sticky col 1 */}
                            <TableCell
                              className={`py-2 px-1 text-center sticky left-0 z-[5] border-r border-border/40 ${stickyBg}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleExpand(stock.symbol);
                              }}
                            >
                              <button
                                className="p-1 rounded hover:bg-muted text-muted-foreground"
                                aria-label={isExpanded ? "收起" : "展开"}
                              >
                                {isExpanded
                                  ? <ChevronDown className="w-3.5 h-3.5" />
                                  : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            </TableCell>

                            {/* 代码/名称 - sticky col 2 */}
                            <TableCell
                              className={`py-2 pr-2 sticky z-[5] border-r border-border/40 ${stickyBg}`}
                              style={{ left: "36px" }}
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-mono text-foreground">{stock.symbol}</span>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-[11px] font-medium max-w-[100px] truncate block">
                                        {stock.name}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      {stock.name} ({stock.symbol})
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </TableCell>

                            {/* 涨停日 - text-left */}
                            <TableCell className="text-[11px] font-mono py-2">
                              <div className="flex items-center gap-0.5">
                                <TrendingUp className="w-3 h-3 text-red-500" />
                                {stock.limitUpDate.slice(5)}
                              </div>
                            </TableCell>

                            {/* 涨停涨幅 - text-right */}
                            <TableCell className="text-[11px] font-mono py-2 font-medium text-red-500 text-right">
                              +{stock.limitUpPct.toFixed(2)}%
                            </TableCell>

                            {/* 涨停价 - text-right */}
                            <TableCell className="text-[11px] font-mono py-2 text-red-500/80 text-right">
                              {stock.limitUpClose.toFixed(2)}
                            </TableCell>

                            {/* 起涨点 - text-right */}
                            <TableCell className="text-[11px] font-mono py-2 text-muted-foreground text-right">
                              {stock.preLimitUpClose.toFixed(2)}
                            </TableCell>

                            {/* 当前价 - text-right */}
                            <TableCell className={`text-[11px] font-mono py-2 font-medium text-right ${stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                              {stock.currentPrice.toFixed(2)}
                            </TableCell>

                            {/* 今日涨跌 - text-right (with explicit + / - prefix) */}
                            <TableCell className={`text-[11px] font-mono py-2 font-medium text-right ${stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                              {stock.currentChangePct >= 0 ? "+" : ""}{stock.currentChangePct.toFixed(2)}%
                            </TableCell>

                            {/* 回踩深度 - text-right (ApproachBar keeps internal layout) */}
                            <TableCell className="py-2 pr-2 text-right">
                              <ApproachBar pct={stock.approachPct} />
                            </TableCell>

                            {/* 距涨停 - text-right */}
                            <TableCell className="text-[11px] font-mono py-2 text-muted-foreground text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <Clock className="w-3 h-3" />
                                {stock.daysSinceLimitUp}天
                              </div>
                            </TableCell>

                            {/* 最大回撤 - text-right */}
                            <TableCell className="text-[11px] font-mono py-2 text-red-500/80 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <ArrowDownRight className="w-3 h-3" />
                                -{stock.maxPullbackPct.toFixed(1)}%
                              </div>
                            </TableCell>

                            {/* 风险评分 - text-right */}
                            <TableCell className="py-2 text-right">
                              <RiskBadge score={riskScore} />
                            </TableCell>

                            {/* 换手率 - text-right */}
                            <TableCell className="text-[11px] font-mono py-2 text-foreground text-right">
                              {stock.turnover > 0 ? `${stock.turnover.toFixed(2)}%` : "--"}
                            </TableCell>

                            {/* 市值 - text-right */}
                            <TableCell className="text-[11px] font-mono py-2 text-foreground text-right">
                              {stock.marketCap > 0 ? formatMarketCap(stock.marketCap) : "--"}
                            </TableCell>

                            {/* 量比 - text-right */}
                            <TableCell className={`text-[11px] font-mono py-2 text-right ${stock.volumeRatio >= 1.5 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-foreground"}`}>
                              {stock.volumeRatio > 0 ? stock.volumeRatio.toFixed(2) : "--"}
                            </TableCell>

                            {/* 走势 mini chart - text-left */}
                            <TableCell className="py-2">
                              <MiniKlineChart
                                kline={stock.klineSummary}
                                limitUpDate={stock.limitUpDate}
                                preLimitUpClose={stock.preLimitUpClose}
                              />
                            </TableCell>

                            {/* 收藏 - text-center */}
                            <TableCell
                              className="py-2 text-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(stock.symbol);
                              }}
                            >
                              <button
                                className={`p-1 rounded transition-colors ${
                                  isFav
                                    ? "text-yellow-500 hover:bg-yellow-500/10"
                                    : "text-muted-foreground hover:bg-muted"
                                }`}
                                aria-label={isFav ? "取消收藏" : "收藏"}
                              >
                                <Star className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />
                              </button>
                            </TableCell>
                          </TableRow>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={17} className="p-0">
                                <ExpandedRowDetail stock={stock} />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Card view - mobile 1 col, sm 2 cols, lg 3 cols
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pagedStocks.map((stock) => (
              <StockCardViewItem
                key={stock.symbol}
                stock={stock}
                isFavorite={favorites.includes(stock.symbol)}
                onToggleFavorite={handleToggleFavorite}
                onSelectStock={onSelectStock}
              />
            ))}
          </div>
        )
      ) : result && result.stocks.length === 0 ? (
        <EmptyState totalScanned={result.summary.totalScanned} />
      ) : result && showFavoritesOnly && filteredStocks.length === 0 ? (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Star className="w-8 h-8 mb-2 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {favorites.length === 0 ? "您还没有收藏任何股票" : "当前筛选条件下无收藏股票"}
            </p>
            <p className="text-xs mt-1">
              {favorites.length === 0
                ? "点击表格行的星形图标即可收藏"
                : `已收藏 ${favorites.length} 只，可尝试调整筛选条件或关闭"我的收藏"模式`}
            </p>
            {favorites.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFavoritesOnly(false)}
                className="mt-3 h-7 text-xs gap-1"
              >
                <X className="w-3 h-3" />
                退出收藏模式
              </Button>
            )}
          </CardContent>
        </Card>
      ) : result && filteredStocks.length === 0 ? (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Filter className="w-8 h-8 mb-2" />
            <p className="text-sm font-medium text-foreground">当前筛选条件下无结果</p>
            <p className="text-xs mt-1">原始数据 {result.stocks.length} 只，可尝试降低回踩深度阈值或重置筛选</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="mt-3 h-7 text-xs gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              重置筛选
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Pagination ─────────────────────────────────── */}
      {result && filteredStocks.length > 0 && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredStocks.length}
          onPageChange={(p) => setCurrentPage(Math.max(1, Math.min(totalPages, p)))}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setCurrentPage(1);
          }}
        />
      )}

      {/* ── Keyboard shortcut hints ──────────────────── */}
      {view === "table" && filteredStocks.length > 0 && (
        <KeyboardHints />
      )}

      {/* ── Data timestamp & cache info ─────────────── */}
      {result && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="py-2.5 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  数据时间: {formatTimestamp(result.timestamp)}
                </span>
                {result.cached && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1 bg-muted/40 text-muted-foreground">
                    <Database className="w-2.5 h-2.5" />
                    服务端缓存
                  </Badge>
                )}
              </div>
              <span className="text-[10px]">
                服务端每 10 分钟刷新一次 · 点击右上"刷新"强制更新
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Strategy explanation ─────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <Activity className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">策略说明</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <b>涨停回踩</b>：近半月内曾涨停的股票，此后持续回调，逐渐逼近涨停前起涨点。
                回踩深度越高，说明涨幅回吐越多，可能存在支撑位反弹机会。
                本筛选器在 API 原始 30% 阈值基础上，进一步支持按天数、市值、换手、量比、ST、价格、今日涨跌、板块类型等多维度精细筛选，
                并提供快捷预设、快速标签、风险评分、行内展开详情、CSV 导出、视图切换、策略保存与分页等增强功能。
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                <span className="text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-red-600 dark:text-red-400">≥90%</span> 极度逼近起涨点
                </span>
                <span className="text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  <span className="text-orange-600 dark:text-orange-400">70-90%</span> 深度回踩
                </span>
                <span className="text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <span className="text-yellow-600 dark:text-yellow-400">50-70%</span> 中度回踩
                </span>
                <span className="text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-emerald-600 dark:text-emerald-400">30-50%</span> 浅度回踩
                </span>
                <span className="text-[11px] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-emerald-500" />
                  风险评分 0-100 (低/中/高/极高)
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom scrollbar styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pullback-screener-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .pullback-screener-scroll::-webkit-scrollbar-track { background: transparent; }
        .pullback-screener-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .pullback-screener-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .pullback-screener-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
        .dark .pullback-screener-scroll::-webkit-scrollbar-thumb { background: #475569; }
        .dark .pullback-screener-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
        .dark .pullback-screener-scroll { scrollbar-color: #475569 transparent; }
        .pullback-screener-scroll-x::-webkit-scrollbar { height: 4px; }
        .pullback-screener-scroll-x::-webkit-scrollbar-track { background: transparent; }
        .pullback-screener-scroll-x::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
        .dark .pullback-screener-scroll-x::-webkit-scrollbar-thumb { background: #475569; }
        .pullback-screener-scroll-x { scrollbar-width: thin; }
      ` }} />
    </div>
  );
});

export default LimitUpPullbackScreener;
