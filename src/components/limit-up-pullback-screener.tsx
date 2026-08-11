"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
}

const DEFAULT_FILTERS: PullbackFilters = {
  minApproachPct: 30,
  maxDaysSinceLimitUp: 10,
  maxMarketCap: 1000,
  minTurnover: 0,
  minVolumeRatio: 0,
  excludeST: true,
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
  | "preLimitUpClose";

type SortOrder = "asc" | "desc";

interface LimitUpPullbackScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

// ── Memory keys ────────────────────────────────────────

const LAST_RESULT_KEY = "limit-up-pullback-screener-last-result";
const LAST_FILTERS_KEY = "limit-up-pullback-screener-last-filters";

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

// ── Sub-Components ─────────────────────────────────────

function MiniKlineChart({ kline, limitUpDate, preLimitUpClose }: {
  kline: KLineDay[];
  limitUpDate: string;
  preLimitUpClose: number;
}) {
  if (!kline || kline.length < 3) {
    return <span className="text-[10px] text-muted-foreground">无数据</span>;
  }

  const width = 110;
  const height = 36;
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
    <svg width={width} height={height} className="shrink-0">
      <line x1={padding} y1={refY} x2={width - padding} y2={refY}
        stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" className="text-muted-foreground/60" />
      <path d={closePath} fill="none" stroke="#10b981" strokeWidth="1" />
      {limitUpIdx >= 0 && (
        <circle cx={toX(limitUpIdx)} cy={toY(kline[limitUpIdx].close)} r="2" fill="#ef4444" />
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
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
          <div className="flex items-center gap-1.5 w-full min-w-[110px]">
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

/** Summary statistics card */
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <BarChart3 className="w-3 h-3" />
          <span>扫描总数</span>
        </div>
        <span className="text-lg font-bold font-mono text-red-600 dark:text-red-400">{totalScanned}</span>
        <span className="text-[10px] text-muted-foreground">涨停候选股</span>
      </div>
      <div className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Filter className="w-3 h-3" />
          <span>符合筛选</span>
        </div>
        <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{total}</span>
        <span className="text-[10px] text-muted-foreground">满足全部条件</span>
      </div>
      <div className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg bg-orange-500/5 border border-orange-500/10">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Target className="w-3 h-3" />
          <span>深度回踩</span>
        </div>
        <span className="text-lg font-bold font-mono text-orange-600 dark:text-orange-400">{deepPullback}</span>
        <span className="text-[10px] text-muted-foreground">回踩 ≥ 70%</span>
      </div>
      <div className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Activity className="w-3 h-3" />
          <span>平均回踩</span>
        </div>
        <span className="text-lg font-bold font-mono text-yellow-600 dark:text-yellow-400">{avgApproach.toFixed(0)}%</span>
        <span className="text-[10px] text-muted-foreground">符合筛选均值</span>
      </div>
    </div>
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
  return (
    <div className="space-y-4">
      {/* Row 1: Approach slider + Days input */}
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

      <Separator />

      {/* Row 2: market cap + turnover */}
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

      <Separator />

      {/* Row 3: volume ratio + ST exclude */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* Reset */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <SlidersHorizontal className="w-3 h-3" />
          <span>所有筛选条件自动保存到本地</span>
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
}: {
  label: string;
  field: SortField;
  current: SortField;
  order: SortOrder;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = current === field;
  return (
    <TableHead
      className={`text-[11px] font-medium cursor-pointer select-none hover:bg-muted/50 transition-colors ${className ?? ""}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
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

// ── Main Component ─────────────────────────────────────

export const LimitUpPullbackScreener = React.memo(function LimitUpPullbackScreener({
  onSelectStock,
}: LimitUpPullbackScreenerProps) {
  const cacheKey = "pullback-screener:default";

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

  // Filters (with localStorage persistence)
  const [filters, setFilters] = useState<PullbackFilters>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    try {
      const saved = localStorage.getItem(LAST_FILTERS_KEY);
      if (saved) return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_FILTERS;
  });
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Sort
  const [sortField, setSortField] = useState<SortField>("approachPct");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleSort = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortOrder(prev => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }, [sortField]);

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

  // Persist filters to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(LAST_FILTERS_KEY, JSON.stringify(filters));
    } catch {}
  }, [filters]);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // ── Apply filters + sort ──────────────────────────────
  const filteredStocks = useMemo(() => {
    if (!result?.stocks) return [];
    const filtered = result.stocks.filter((s) => {
      if (s.approachPct < filters.minApproachPct) return false;
      if (s.daysSinceLimitUp > filters.maxDaysSinceLimitUp) return false;
      if (filters.maxMarketCap > 0 && s.marketCap > filters.maxMarketCap) return false;
      if (s.turnover < filters.minTurnover) return false;
      if (s.volumeRatio < filters.minVolumeRatio) return false;
      if (filters.excludeST && (s.name.includes("ST") || s.name.includes("*ST"))) return false;
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (sortOrder === "desc") return (bVal as number) - (aVal as number);
      return (aVal as number) - (bVal as number);
    });
    return sorted;
  }, [result, filters, sortField, sortOrder]);

  const isDefaultFilters = useMemo(
    () => JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS),
    [filters]
  );

  // ── Render ────────────────────────────────────────────

  if (loading && !result) {
    return <LoadingSkeleton />;
  }

  if (error && !result) {
    return <ErrorState error={error} onRetry={() => fetchData(true)} />;
  }

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
            <div className="flex items-center gap-2">
              {isFromCache && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-1 bg-muted/50 text-muted-foreground">
                  <Database className="w-3 h-3" />
                  缓存
                </Badge>
              )}
              {lastFetchTime && (
                <span className="text-[11px] text-muted-foreground hidden sm:inline">{lastFetchTime}</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(true)}
                disabled={loading}
                className="h-7 text-xs gap-1"
              >
                {loading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                刷新
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            筛选近半月内曾涨停、此后回落逼近涨停前起涨点的股票。支持多维度筛选、表头排序、记忆上次条件与结果。
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

      {/* ── Filter Panel ─────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
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
                isDefault={isDefaultFilters}
              />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ── Stock Table ──────────────────────────────── */}
      {result && filteredStocks.length > 0 ? (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto pullback-screener-scroll">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent sticky top-0 bg-background z-10">
                    <TableHead className="text-[11px] font-medium w-[110px]">代码 / 名称</TableHead>
                    <TableHead className="text-[11px] font-medium w-[80px]">涨停日</TableHead>
                    <SortableHead label="涨停涨幅" field="limitUpPct" current={sortField} order={sortOrder} onSort={handleSort} className="w-[68px]" />
                    <SortableHead label="涨停价" field="limitUpClose" current={sortField} order={sortOrder} onSort={handleSort} className="w-[56px]" />
                    <SortableHead label="起涨点" field="preLimitUpClose" current={sortField} order={sortOrder} onSort={handleSort} className="w-[56px]" />
                    <SortableHead label="当前价" field="currentPrice" current={sortField} order={sortOrder} onSort={handleSort} className="w-[60px]" />
                    <SortableHead label="今日涨跌" field="currentChangePct" current={sortField} order={sortOrder} onSort={handleSort} className="w-[64px]" />
                    <SortableHead label="回踩深度" field="approachPct" current={sortField} order={sortOrder} onSort={handleSort} className="w-[130px]" />
                    <SortableHead label="距涨停" field="daysSinceLimitUp" current={sortField} order={sortOrder} onSort={handleSort} className="w-[56px]" />
                    <SortableHead label="最大回撤" field="maxPullbackPct" current={sortField} order={sortOrder} onSort={handleSort} className="w-[68px]" />
                    <SortableHead label="换手率" field="turnover" current={sortField} order={sortOrder} onSort={handleSort} className="w-[60px]" />
                    <SortableHead label="市值" field="marketCap" current={sortField} order={sortOrder} onSort={handleSort} className="w-[64px]" />
                    <SortableHead label="量比" field="volumeRatio" current={sortField} order={sortOrder} onSort={handleSort} className="w-[50px]" />
                    <TableHead className="text-[11px] font-medium w-[110px]">走势</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStocks.map((stock) => {
                    const approachStyle = getApproachStyle(stock.approachPct);
                    return (
                      <TableRow
                        key={stock.symbol}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => onSelectStock?.(stock.symbol)}
                      >
                        {/* 代码/名称 */}
                        <TableCell className="py-2 pr-2">
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

                        {/* 涨停日 */}
                        <TableCell className="text-[11px] font-mono py-2">
                          <div className="flex items-center gap-0.5">
                            <TrendingUp className="w-3 h-3 text-red-500" />
                            {stock.limitUpDate.slice(5)}
                          </div>
                        </TableCell>

                        {/* 涨停涨幅 */}
                        <TableCell className="text-[11px] font-mono py-2 font-medium text-red-500">
                          +{stock.limitUpPct.toFixed(2)}%
                        </TableCell>

                        {/* 涨停价 */}
                        <TableCell className="text-[11px] font-mono py-2 text-red-500/80">
                          {stock.limitUpClose.toFixed(2)}
                        </TableCell>

                        {/* 起涨点 */}
                        <TableCell className="text-[11px] font-mono py-2 text-muted-foreground">
                          {stock.preLimitUpClose.toFixed(2)}
                        </TableCell>

                        {/* 当前价 */}
                        <TableCell className={`text-[11px] font-mono py-2 font-medium ${stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                          {stock.currentPrice.toFixed(2)}
                        </TableCell>

                        {/* 今日涨跌 */}
                        <TableCell className={`text-[11px] font-mono py-2 font-medium ${stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                          {stock.currentChangePct >= 0 ? "+" : ""}{stock.currentChangePct.toFixed(2)}%
                        </TableCell>

                        {/* 回踩深度 (with progress bar) */}
                        <TableCell className="py-2 pr-2">
                          <ApproachBar pct={stock.approachPct} />
                        </TableCell>

                        {/* 距涨停 */}
                        <TableCell className="text-[11px] font-mono py-2 text-muted-foreground">
                          <div className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {stock.daysSinceLimitUp}天
                          </div>
                        </TableCell>

                        {/* 最大回撤 */}
                        <TableCell className="text-[11px] font-mono py-2 text-red-500/80">
                          <div className="flex items-center gap-0.5">
                            <ArrowDownRight className="w-3 h-3" />
                            -{stock.maxPullbackPct.toFixed(1)}%
                          </div>
                        </TableCell>

                        {/* 换手率 */}
                        <TableCell className="text-[11px] font-mono py-2 text-foreground">
                          {stock.turnover > 0 ? `${stock.turnover.toFixed(2)}%` : "--"}
                        </TableCell>

                        {/* 市值 */}
                        <TableCell className="text-[11px] font-mono py-2 text-foreground">
                          {stock.marketCap > 0 ? formatMarketCap(stock.marketCap) : "--"}
                        </TableCell>

                        {/* 量比 */}
                        <TableCell className={`text-[11px] font-mono py-2 ${stock.volumeRatio >= 1.5 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-foreground"}`}>
                          {stock.volumeRatio > 0 ? stock.volumeRatio.toFixed(2) : "--"}
                        </TableCell>

                        {/* 走势 mini chart */}
                        <TableCell className="py-2">
                          <MiniKlineChart
                            kline={stock.klineSummary}
                            limitUpDate={stock.limitUpDate}
                            preLimitUpClose={stock.preLimitUpClose}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : result && result.stocks.length === 0 ? (
        <EmptyState totalScanned={result.summary.totalScanned} />
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
                本筛选器在 API 原始 30% 阈值基础上，进一步支持按天数、市值、换手、量比、ST 等多维度精细筛选。
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
      ` }} />
    </div>
  );
});

export default LimitUpPullbackScreener;
