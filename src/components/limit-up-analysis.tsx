"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  Target,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
  Filter,
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

interface LimitUpAnalysisProps {
  onSelectStock?: (symbol: string) => void;
}

// ── Helper Functions ───────────────────────────────────

/** Get approach level styling */
function getApproachStyle(pct: number): { bg: string; text: string; label: string } {
  if (pct >= 90) return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600", label: "极度逼近" };
  if (pct >= 70) return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600", label: "深度回踩" };
  if (pct >= 50) return { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-600", label: "中度回踩" };
  return { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600", label: "浅度回踩" };
}

/** Get approach bar color */
function getApproachBarColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-orange-500";
  if (pct >= 50) return "bg-yellow-500";
  return "bg-emerald-500";
}

/** Format market cap */
function formatMarketCap(val: number): string {
  if (val >= 10000) return `${(val / 10000).toFixed(1)}万亿`;
  if (val >= 100) return `${val.toFixed(0)}亿`;
  if (val >= 1) return `${val.toFixed(1)}亿`;
  return `${(val * 10000).toFixed(0)}万`;
}

/** Mini K-line chart using SVG */
function MiniKlineChart({ kline, limitUpDate, preLimitUpClose }: {
  kline: KLineDay[];
  limitUpDate: string;
  preLimitUpClose: number;
}) {
  if (kline.length < 3) return null;

  const width = 120;
  const height = 40;
  const padding = 2;

  const allPrices = kline.flatMap(d => [d.high, d.low]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;

  const toY = (price: number) => padding + (1 - (price - minP) / range) * (height - 2 * padding);
  const toX = (idx: number) => padding + (idx / (kline.length - 1)) * (width - 2 * padding);

  // Find limit-up day index
  const limitUpIdx = kline.findIndex(d => d.date.startsWith(limitUpDate));

  // Build path for close line
  const closePath = kline.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.close)}`).join(" ");

  // Pre-limit-up reference line
  const refY = toY(preLimitUpClose);

  return (
    <svg width={width} height={height} className="shrink-0">
      {/* Pre-limit-up reference line (dashed) */}
      <line x1={padding} y1={refY} x2={width - padding} y2={refY}
        stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2" />
      {/* Close price line */}
      <path d={closePath} fill="none" stroke="#3b82f6" strokeWidth="1" />
      {/* Limit-up day marker */}
      {limitUpIdx >= 0 && (
        <circle cx={toX(limitUpIdx)} cy={toY(kline[limitUpIdx].close)} r="2" fill="#ef4444" />
      )}
    </svg>
  );
}

// ── Sub-Components ─────────────────────────────────────

/** Full-page loading skeleton */
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
      {Array.from({ length: 5 }).map((_, i) => (
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
              <Skeleton className="w-16 h-4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Error state with retry */
function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertCircle className="w-10 h-10 mb-3 text-red-400" />
        <p className="text-sm font-medium text-foreground">加载失败</p>
        <p className="text-xs mt-1 max-w-[280px] text-center">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4 gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          重试
        </Button>
      </CardContent>
    </Card>
  );
}

/** Empty state */
function EmptyState() {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <TrendingDown className="w-10 h-10 mb-3" />
        <p className="text-sm font-medium text-foreground">近两周无涨停回踩股票</p>
        <p className="text-xs mt-1">可能非交易时段或市场无符合条件个股</p>
      </CardContent>
    </Card>
  );
}

/** Approach progress bar */
function ApproachBar({ pct }: { pct: number }) {
  const style = getApproachStyle(pct);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 w-full min-w-[100px]">
            <div className="flex-1">
              <div className={`h-2 rounded-full ${style.bg}`}>
                <div
                  className={`h-full rounded-full transition-all ${getApproachBarColor(pct)}`}
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
          回踩深度: {pct.toFixed(1)}% — {style.label}
          {pct >= 90 ? " (已回到起涨点附近)" : pct >= 70 ? " (接近起涨点)" : pct >= 50 ? " (回踩过半)" : " (回踩较少)"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Summary statistics card */
function SummaryCard({ stocks, totalScanned }: { stocks: PullbackStock[]; totalScanned: number }) {
  const total = stocks.length;
  const deepPullback = stocks.filter(s => s.approachPct >= 70).length;
  const nearStart = stocks.filter(s => s.approachPct >= 90).length;
  const avgApproach = total > 0 ? stocks.reduce((s, st) => s + st.approachPct, 0) / total : 0;
  const avgDays = total > 0 ? stocks.reduce((s, st) => s + st.daysSinceLimitUp, 0) / total : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
        <span className="text-[11px] text-muted-foreground">回踩个股</span>
        <span className="text-lg font-bold font-mono text-red-600">{total}</span>
        <span className="text-[10px] text-muted-foreground">扫描{totalScanned}只涨停股</span>
      </div>
      <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
        <span className="text-[11px] text-muted-foreground">深度回踩</span>
        <span className="text-lg font-bold font-mono text-orange-600">{deepPullback}</span>
        <span className="text-[10px] text-muted-foreground">回踩≥70%</span>
      </div>
      <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
        <span className="text-[11px] text-muted-foreground">逼近起涨点</span>
        <span className="text-lg font-bold font-mono text-yellow-600">{nearStart}</span>
        <span className="text-[10px] text-muted-foreground">回踩≥90%</span>
      </div>
      <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <span className="text-[11px] text-muted-foreground">平均回踩</span>
        <span className="text-lg font-bold font-mono text-blue-600">{avgApproach.toFixed(0)}%</span>
        <span className="text-[10px] text-muted-foreground">平均{avgDays.toFixed(1)}天</span>
      </div>
    </div>
  );
}

/** Stock detail row expanded content */
function StockDetailPanel({ stock }: { stock: PullbackStock }) {
  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/50">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* 价格分析 */}
        <div className="space-y-1.5">
          <span className="text-muted-foreground font-medium">价格分析</span>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">起涨点</span>
              <span className="font-mono text-foreground">{stock.preLimitUpClose.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">涨停价</span>
              <span className="font-mono text-red-500">{stock.limitUpClose.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">现价</span>
              <span className={`font-mono ${stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                {stock.currentPrice.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 回撤分析 */}
        <div className="space-y-1.5">
          <span className="text-muted-foreground font-medium">回撤分析</span>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">最大回撤</span>
              <span className="font-mono text-red-500">-{stock.maxPullbackPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">最大回撤日</span>
              <span className="font-mono text-foreground">{stock.maxPullbackDate.slice(5)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">距涨停</span>
              <span className="font-mono text-foreground">{stock.daysSinceLimitUp}天</span>
            </div>
          </div>
        </div>

        {/* 基本面 */}
        <div className="space-y-1.5">
          <span className="text-muted-foreground font-medium">基本面</span>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">换手率</span>
              <span className="font-mono text-foreground">{stock.turnover > 0 ? `${stock.turnover.toFixed(2)}%` : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">量比</span>
              <span className="font-mono text-foreground">{stock.volumeRatio > 0 ? stock.volumeRatio.toFixed(1) : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">总市值</span>
              <span className="font-mono text-foreground">{stock.marketCap > 0 ? formatMarketCap(stock.marketCap) : "--"}</span>
            </div>
          </div>
        </div>

        {/* 迷你K线 */}
        <div className="space-y-1.5">
          <span className="text-muted-foreground font-medium">近期走势</span>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block w-2 h-0.5 bg-blue-500"></span> 收盘价
            <span className="inline-block w-2 h-0.5 border-t border-dashed border-slate-400"></span> 起涨点
            <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> 涨停日
          </div>
          <MiniKlineChart kline={stock.klineSummary} limitUpDate={stock.limitUpDate} preLimitUpClose={stock.preLimitUpClose} />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

const LAST_RESULT_KEY = "limit-up-screener-last-result";
const LAST_FILTER_LEVEL_KEY = "limit-up-screener-last-filter-level";

export const LimitUpAnalysis = React.memo(function LimitUpAnalysis({ onSelectStock }: LimitUpAnalysisProps) {
  // ── Initialize from cache on mount (instant display on tab switch) ──
  const [initialCache] = useState(() => getCachedData<PullbackResult>("pullback:default"));

  const [result, setResult] = useState<PullbackResult | null>(() => {
    if (typeof window === "undefined") return initialCache;
    try {
      const saved = localStorage.getItem(LAST_RESULT_KEY);
      return saved ? JSON.parse(saved) : initialCache;
    } catch { return initialCache; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filterLevel, setFilterLevel] = useState<number>(() => {
    if (typeof window === "undefined") return 30;
    try {
      const saved = localStorage.getItem(LAST_FILTER_LEVEL_KEY);
      return saved ? Number(saved) : 30;
    } catch { return 30; }
  });

  const toggleRow = useCallback((symbol: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  // ── Fetch data ────────────────────────────────────────
  const fetchData = useCallback(async (forceRefresh = false) => {
    const cacheKey = `pullback:default`;

    const cachedResult = getCachedData<PullbackResult>(cacheKey);
    const hasFreshCache = cachedResult && isCacheFresh(cacheKey, 600_000);

    if (!hasFreshCache || forceRefresh) {
      setLoading(true);
    } else {
      setResult(cachedResult);
    }

    setError(null);
    try {
      const data: PullbackResult = await cachedFetch<PullbackResult>(
        cacheKey,
        async () => {
          const res = await fetch(`/api/stock/limit-up-pullback${forceRefresh ? "?refresh=1" : ""}`);
          if (!res.ok) throw new Error("涨停回踩分析失败");
          return res.json();
        },
        forceRefresh ? 0 : 600_000 // 10 min cache
      );

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        // Persist to localStorage so next mount shows last result immediately
        try { localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(data)); } catch {}
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

  // Persist filterLevel to localStorage on change
  useEffect(() => {
    try { localStorage.setItem(LAST_FILTER_LEVEL_KEY, String(filterLevel)); } catch {}
  }, [filterLevel]);

  // ── Filtered stocks ──────────────────────────────────
  const filteredStocks = useMemo(() => {
    if (!result?.stocks) return [];
    return result.stocks.filter(s => s.approachPct >= filterLevel);
  }, [result, filterLevel]);

  // ── Render ────────────────────────────────────────────

  if (loading && !result) {
    return <LoadingSkeleton />;
  }

  if (error && !result) {
    return <ErrorState error={error} onRetry={() => fetchData(true)} />;
  }

  if (result && result.stocks.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-orange-500" />
                涨停回踩
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={loading} className="h-7 text-xs gap-1">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                刷新
              </Button>
            </div>
          </CardHeader>
        </Card>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header Card ──────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-orange-500" />
              <CardTitle className="text-base font-semibold">涨停回踩</CardTitle>
              <Badge variant="outline" className="text-[11px] py-0 px-1.5 gap-1 bg-orange-500/5 border-orange-500/20 text-orange-600">
                <TrendingUp className="w-3 h-3" />
                近两周
              </Badge>
              {result?.date && (
                <span className="text-xs text-muted-foreground">{result.date}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {lastFetchTime && (
                <span className="text-[11px] text-muted-foreground">{lastFetchTime}</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(true)}
                disabled={loading}
                className="h-7 text-xs gap-1"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                刷新
              </Button>
            </div>
          </div>
          {/* Description */}
          <p className="text-xs text-muted-foreground mt-1">
            筛选近两周曾涨停，此后持续下跌、接近起涨点的股票。回踩深度越高，越接近涨停前起涨价。
          </p>
        </CardHeader>
      </Card>

      {/* ── Summary ──────────────────────────────────── */}
      {result && (
        <SummaryCard stocks={result.stocks} totalScanned={result.summary.totalScanned} />
      )}

      {/* ── Filter Bar ───────────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="py-2.5 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">回踩深度</span>
            </div>
            {[
              { label: "全部", value: 30 },
              { label: "≥50%", value: 50 },
              { label: "≥70%", value: 70 },
              { label: "≥90%", value: 90 },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterLevel(opt.value)}
                className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                  filterLevel === opt.value
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <span className="text-[11px] text-muted-foreground ml-auto">
              共 <span className="font-mono font-medium text-foreground">{filteredStocks.length}</span> 只
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Stock Table ──────────────────────────────── */}
      {filteredStocks.length > 0 ? (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent sticky top-0 bg-background z-10">
                    <TableHead className="text-[11px] font-medium w-[28px]"></TableHead>
                    <TableHead className="text-[11px] font-medium w-[62px]">代码</TableHead>
                    <TableHead className="text-[11px] font-medium w-[72px]">名称</TableHead>
                    <TableHead className="text-[11px] font-medium w-[80px]">涨停日</TableHead>
                    <TableHead className="text-[11px] font-medium w-[56px]">涨停涨幅</TableHead>
                    <TableHead className="text-[11px] font-medium w-[100px]">回踩深度</TableHead>
                    <TableHead className="text-[11px] font-medium w-[56px]">回落幅度</TableHead>
                    <TableHead className="text-[11px] font-medium w-[52px]">距涨停</TableHead>
                    <TableHead className="text-[11px] font-medium w-[72px]">现价</TableHead>
                    <TableHead className="text-[11px] font-medium w-[56px]">今日涨跌</TableHead>
                    <TableHead className="text-[11px] font-medium w-[120px]">走势</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStocks.map((stock) => {
                    const isExpanded = expandedRows.has(stock.symbol);
                    const approachStyle = getApproachStyle(stock.approachPct);
                    const rowBg = "";

                    return (
                      <React.Fragment key={stock.symbol}>
                        <TableRow
                          className={`cursor-pointer hover:bg-muted/50 transition-colors ${rowBg}`}
                          onClick={() => toggleRow(stock.symbol)}
                        >
                          {/* Expand toggle */}
                          <TableCell className="py-2 pr-0 w-[28px]">
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </TableCell>

                          {/* 代码 */}
                          <TableCell className="text-[11px] font-mono py-2">
                            {stock.symbol}
                          </TableCell>

                          {/* 名称 */}
                          <TableCell className="text-[11px] font-medium py-2 max-w-[72px] truncate">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="truncate block">{stock.name}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  {stock.name} ({stock.symbol})
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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

                          {/* 回踩深度 */}
                          <TableCell className="py-2 pr-2">
                            <ApproachBar pct={stock.approachPct} />
                          </TableCell>

                          {/* 回落幅度 */}
                          <TableCell className="text-[11px] font-mono py-2">
                            <div className="flex items-center gap-0.5">
                              <ArrowDownRight className="w-3 h-3 text-green-500" />
                              <span className="text-green-500">-{stock.pullbackPct.toFixed(1)}%</span>
                            </div>
                          </TableCell>

                          {/* 距涨停 */}
                          <TableCell className="text-[11px] font-mono py-2 text-muted-foreground">
                            <div className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {stock.daysSinceLimitUp}天
                            </div>
                          </TableCell>

                          {/* 现价 */}
                          <TableCell className={`text-[11px] font-mono py-2 font-medium ${stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {stock.currentPrice.toFixed(2)}
                          </TableCell>

                          {/* 今日涨跌 */}
                          <TableCell className={`text-[11px] font-mono py-2 font-medium ${stock.currentChangePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {stock.currentChangePct >= 0 ? "+" : ""}{stock.currentChangePct.toFixed(2)}%
                          </TableCell>

                          {/* 迷你走势 */}
                          <TableCell className="py-2">
                            <MiniKlineChart kline={stock.klineSummary} limitUpDate={stock.limitUpDate} preLimitUpClose={stock.preLimitUpClose} />
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={11} className="p-0">
                              <StockDetailPanel stock={stock} />
                              {/* Click to select stock */}
                              <div className="px-4 py-2 bg-muted/10 border-t border-border/30 flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[11px] gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectStock?.(stock.symbol);
                                  }}
                                >
                                  <Target className="w-3 h-3" />
                                  查看分时
                                </Button>
                                <span className="text-[10px] text-muted-foreground">
                                  点击查看该股实时分时图与做T信号
                                </span>
                              </div>
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
        <Card className="border-border/50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Filter className="w-8 h-8 mb-2" />
            <p className="text-sm">无符合筛选条件的股票</p>
            <p className="text-xs mt-1">尝试降低回踩深度筛选条件</p>
          </CardContent>
        </Card>
      )}

      {/* ── Explanation Card ─────────────────────────── */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <Activity className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">策略说明</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <b>涨停回踩</b>：近两周内曾涨停的股票，此后持续回调，逐渐逼近涨停前起涨点。
                回踩深度越高，说明涨幅回吐越多，可能存在支撑位反弹机会。
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                <span className="text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-red-600">≥90%</span> 极度逼近起涨点
                </span>
                <span className="text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  <span className="text-orange-600">70-90%</span> 深度回踩
                </span>
                <span className="text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <span className="text-yellow-600">50-70%</span> 中度回踩
                </span>
                <span className="text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-emerald-600">30-50%</span> 浅度回踩
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
