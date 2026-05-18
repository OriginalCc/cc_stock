"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ChevronUp,
  ChevronDown,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Loader2,
  BarChart3,
  Target,
  Database,
  SlidersHorizontal,
  Cpu,
  Shield,
  LineChart,
  CandlestickChart,
  Gauge,
  Waves,
  CircleDot,
  Flame,
  Eye,
  Star,
  X,
  ChevronRight,
  Clock,
  BookOpen,
  AlertTriangle,
  Scale,
  Info,
} from "lucide-react";
import {
  formatMarketCap,
  formatAmount,
  loadWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isInWatchlist,
  type WatchlistItem,
  useAutoSaveScreener,
  computeScreenerStats,
  fetchMiniTimeline,
  type MiniTimelineResult,
  isTradingHours,
} from "@/lib/screener-shared";
import { fetchWithSWR, getCachedData, isCacheFresh } from "@/lib/client-cache";

// ── Types ──────────────────────────────────────────────

interface IntradayStock {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  amount: number;
  turnover: number;
  marketCap: number;
  circulatingMarketCap: number;
  pe: number;
  amplitude: number;
  mainNetInflow: number;
  volumeRatio: number;
  vwapScore: number;
  vwapDetail: string;
  volumePatternScore: number;
  volumePatternDetail: string;
  trendPatternScore: number;
  trendPatternDetail: string;
  macdScore: number;
  macdDetail: string;
  capitalFlowScore: number;
  capitalFlowDetail: string;
  compositeScore: number;
  compositeDetail: string;
  patternTag: string;
  coRiseScore: number;
  coRiseDetail: string;
  breakoutScore: number;
  breakoutDetail: string;
}

interface IntradayScreenerResult {
  success: boolean;
  stocks: IntradayStock[];
  totalCount: number;
  filteredCount: number;
  timestamp: string;
  strategy: string;
  timeWindow: string;
  timeWindowDetail: string;
  error?: string;
  cached?: boolean;
}

type SortField = "compositeScore" | "changePercent" | "vwapScore" | "volumePatternScore" | "trendPatternScore" | "macdScore" | "capitalFlowScore" | "coRiseScore" | "breakoutScore" | "marketCap" | "turnover" | "volumeRatio" | "mainNetInflow";
type SortOrder = "asc" | "desc";

// ── Strategies ─────────────────────────────────────────

const STRATEGIES = [
  { key: "composite", label: "综合评分", icon: Gauge, desc: "多维度综合评分筛选", color: "text-emerald-500" },
  { key: "volume_ratio", label: "量比排行", icon: BarChart3, desc: "量比靠前的活跃股", color: "text-blue-500" },
  { key: "capital_flow", label: "资金流入", icon: TrendingUp, desc: "主力资金净流入排行", color: "text-red-500" },
  { key: "turnover", label: "换手活跃", icon: Activity, desc: "换手率高的活跃股", color: "text-orange-500" },
  { key: "amount", label: "成交额", icon: Waves, desc: "成交额排行", color: "text-purple-500" },
];

// ── Filter State ───────────────────────────────────────

interface ScreenerFilters {
  strategy: string;
  minChange: number;
  maxChange: number;
  maxMarketCap: number;
  minTurnover: number;
  minVolumeRatio: number;
  minCompositeScore: number;
  maxResults: number;
  enableChiNext: boolean;
  enableSTAR: boolean;
}

const DEFAULT_FILTERS: ScreenerFilters = {
  strategy: "composite",
  minChange: -3,
  maxChange: 9,
  maxMarketCap: 500,
  minTurnover: 1,
  minVolumeRatio: 0.5,
  minCompositeScore: 30,
  maxResults: 50,
  enableChiNext: false,
  enableSTAR: false,
};

// ── Helper functions ───────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 50) return "text-orange-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 15) return "text-lime-500";
  return "text-gray-400";
}

function getScoreBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/30";
  if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 15) return "bg-lime-500/10 border-lime-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getCompositeLabel(score: number): string {
  if (score >= 70) return "强推";
  if (score >= 55) return "推荐";
  if (score >= 40) return "关注";
  if (score >= 25) return "观望";
  return "偏弱";
}

function getPatternTagStyle(tag: string): { bg: string; text: string } {
  if (tag.includes("V型反转")) return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400" };
  if (tag.includes("阶梯")) return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400" };
  if (tag.includes("突破")) return { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" };
  if (tag.includes("反弹")) return { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-600 dark:text-yellow-400" };
  if (tag.includes("稳步")) return { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-600 dark:text-blue-400" };
  if (tag === "强推") return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400" };
  if (tag === "推荐") return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400" };
  return { bg: "bg-gray-500/10 border-gray-500/30", text: "text-gray-600 dark:text-gray-400" };
}

function getPatternTagChartColor(tag: string): string {
  if (tag.includes("V型反转")) return "#ef4444";
  if (tag.includes("阶梯")) return "#f97316";
  if (tag.includes("突破")) return "#10b981";
  if (tag.includes("反弹")) return "#eab308";
  if (tag.includes("稳步")) return "#3b82f6";
  return "#6b7280";
}

// ── Component ──────────────────────────────────────────

interface IntradayScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

export const IntradayScreener = React.memo(function IntradayScreener({ onSelectStock }: IntradayScreenerProps) {
  const [result, setResult] = useState<IntradayScreenerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("compositeScore");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [lastFetchTime, setLastFetchTime] = useState<string>("");
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastFetchTimestamp, setLastFetchTimestamp] = useState(0);

  // Filter states
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Score detail popover
  const [detailStock, setDetailStock] = useState<IntradayStock | null>(null);

  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(false); // kept for UI compatibility

  // Stats section state
  const [statsExpanded, setStatsExpanded] = useState(false);

  // Trading rules panel state
  const [rulesExpanded, setRulesExpanded] = useState(false);

  // Mini timeline preview state
  const [previewStock, setPreviewStock] = useState<IntradayStock | null>(null);
  const [previewData, setPreviewData] = useState<MiniTimelineResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async (forceRefresh = false, customFilters?: ScreenerFilters) => {
    const f = customFilters || filters;

    // Build params and cache key
    const params = new URLSearchParams({
      strategy: f.strategy,
      minChange: String(f.minChange),
      maxChange: String(f.maxChange),
      maxMarketCap: String(f.maxMarketCap),
      minTurnover: String(f.minTurnover),
      minVolumeRatio: String(f.minVolumeRatio),
      minCompositeScore: String(f.minCompositeScore),
      maxResults: String(f.maxResults),
    });
    if (f.enableChiNext) params.set("chiNext", "true");
    if (f.enableSTAR) params.set("star", "true");
    if (forceRefresh) params.set("refresh", "1");

    const cacheKey = `intraday-screener:${params.toString()}`;

    // Check for fresh cached data to avoid loading flash on tab switch
    const cachedResult = getCachedData<IntradayScreenerResult>(cacheKey);
    const hasFreshCache = cachedResult && isCacheFresh(cacheKey, 3_600_000);

    if (!hasFreshCache || forceRefresh) {
      setLoading(true);
    } else {
      setResult(cachedResult);
      setIsFromCache(true);
      setLastFetchTimestamp(Date.now());
    }

    setError(null);
    setIsFromCache(false);
    try {
      const { data, fromCache } = await fetchWithSWR<IntradayScreenerResult>(
        cacheKey,
        async () => {
          const res = await fetch(`/api/stock/intraday-screener?${params}`);
          if (!res.ok) throw new Error("选股失败");
          return res.json();
        },
        3_600_000, // 1 hour TTL – click refresh to update
        { forceRefresh }
      );

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        setIsFromCache(fromCache);
        setLastFetchTimestamp(Date.now());
      } else {
        setError(data.error || "选股失败");
      }
    } catch (e: any) {
      setError(e.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Watchlist: load on mount + listen for changes
  useEffect(() => {
    setWatchlist(loadWatchlist());
    const handler = () => setWatchlist(loadWatchlist());
    window.addEventListener("screener-watchlist-changed", handler);
    return () => window.removeEventListener("screener-watchlist-changed", handler);
  }, []);

  // No auto-refresh – 1 hour cache, only refresh on button click

  // Auto-fetch on mount: fetchWithSWR returns cached data instantly
  useEffect(() => {
    fetchData();
  }, []);

  // Sort stocks
  const sortedStocks = useMemo(() => {
    if (!result?.stocks) return [];
    const stocks = [...result.stocks];
    stocks.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (sortOrder === "desc") return (bVal as number) - (aVal as number);
      return (aVal as number) - (bVal as number);
    });
    return stocks;
  }, [result?.stocks, sortField, sortOrder]);

  // Auto-save screener results for historical verification
  useAutoSaveScreener(
    sortedStocks,
    "intraday",
    filters.strategy || "综合策略",
    filters,
    sortedStocks.length > 0
  );

  // Compute stats
  const screenerStats = useMemo(() => {
    if (!sortedStocks.length) return null;
    return computeScreenerStats(sortedStocks.map((s) => s.compositeScore));
  }, [sortedStocks]);

  // Pattern tag distribution
  const patternTagDist = useMemo(() => {
    if (!sortedStocks.length) return [];
    const counts: Record<string, number> = {};
    sortedStocks.forEach((s) => {
      const tag = s.patternTag || "无标签";
      counts[tag] = (counts[tag] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count, percent: Number(((count / sortedStocks.length) * 100).toFixed(1)) }))
      .sort((a, b) => b.count - a.count);
  }, [sortedStocks]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortOrder === "desc"
      ? <ChevronDown className="w-3 h-3 opacity-80" />
      : <ChevronUp className="w-3 h-3 opacity-80" />;
  };

  const handleFilterChange = (key: keyof ScreenerFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    fetchData(true);
  };

  const filtersChanged = useMemo(() => {
    return JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  }, [filters]);

  const cacheRemaining = useMemo(() => {
    if (!lastFetchTimestamp) return 0;
    const elapsed = Date.now() - lastFetchTimestamp;
    return Math.max(0, Math.ceil((180_000 - elapsed) / 1000));
  }, [lastFetchTime, isFromCache]);

  // Watchlist toggle handler
  const handleToggleWatchlist = (stock: IntradayStock, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInWatchlist(stock.symbol)) {
      removeFromWatchlist(stock.symbol);
    } else {
      addToWatchlist(stock.symbol, stock.name, "intraday", stock.price, stock.changePercent);
    }
    setWatchlist(loadWatchlist());
  };

  // Mini timeline preview handler
  const handlePreview = async (stock: IntradayStock, e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewStock?.symbol === stock.symbol) {
      setPreviewStock(null);
      setPreviewData(null);
      setPreviewPos(null);
      return;
    }
    setPreviewStock(stock);
    setPreviewData(null);
    setPreviewLoading(true);
    // Position popup near click
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tableRect = (e.currentTarget as HTMLElement).closest(".overflow-x-auto")?.getBoundingClientRect();
    setPreviewPos({
      top: rect.bottom + 4,
      left: Math.min(rect.left, (tableRect?.right ?? window.innerWidth) - 320),
    });
    try {
      const data = await fetchMiniTimeline(stock.symbol);
      setPreviewData(data);
    } catch {
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Close preview on outside click
  useEffect(() => {
    if (!previewStock) return;
    const handler = (e: MouseEvent) => {
      if (previewRef.current && !previewRef.current.contains(e.target as Node)) {
        setPreviewStock(null);
        setPreviewData(null);
        setPreviewPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [previewStock]);

  // ── Dimension Score Radar ──
  const RadarChart = ({ stock }: { stock: IntradayStock }) => {
    const dimensions = [
      { key: "vwapScore", label: "均价线", value: stock.vwapScore },
      { key: "volumePatternScore", label: "量价配合", value: stock.volumePatternScore },
      { key: "trendPatternScore", label: "趋势形态", value: stock.trendPatternScore },
      { key: "macdScore", label: "MACD", value: stock.macdScore },
      { key: "capitalFlowScore", label: "资金流向", value: stock.capitalFlowScore },
      { key: "coRiseScore", label: "量价齐升", value: stock.coRiseScore },
      { key: "breakoutScore", label: "突破新高", value: stock.breakoutScore },
    ];

    const maxVal = 100;
    const center = 60;
    const radius = 50;
    const angleStep = (2 * Math.PI) / dimensions.length;
    const startAngle = -Math.PI / 2;

    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

    return (
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        {gridLevels.map((level) => {
          const r = radius * level;
          const points = dimensions.map((_, i) => {
            const angle = startAngle + i * angleStep;
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
          }).join(" ");
          return <polygon key={level} points={points} fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="0.5" />;
        })}
        {dimensions.map((_, i) => {
          const angle = startAngle + i * angleStep;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          return <line key={i} x1={center} y1={center} x2={x2} y2={y2} stroke="currentColor" className="text-muted/20" strokeWidth="0.5" />;
        })}
        <polygon
          points={dimensions.map((d, i) => {
            const angle = startAngle + i * angleStep;
            const r = radius * (d.value / maxVal);
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
          }).join(" ")}
          fill="rgba(16, 185, 129, 0.15)"
          stroke="rgb(16, 185, 129)"
          strokeWidth="1.5"
        />
        {dimensions.map((d, i) => {
          const angle = startAngle + i * angleStep;
          const r = radius * (d.value / maxVal);
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);
          return <circle key={i} cx={x} cy={y} r="2" fill={d.value >= 50 ? "rgb(16, 185, 129)" : "rgb(156, 163, 175)"} />;
        })}
      </svg>
    );
  };

  // ── Mini Timeline Line Chart ──
  const MiniLineChart = ({ data }: { data: MiniTimelineResult }) => {
    if (!data.items || data.items.length < 2) {
      return <div className="text-[10px] text-muted-foreground text-center py-4">暂无分时数据</div>;
    }
    const prices = data.items.map((d) => d.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const w = 260;
    const h = 80;
    const padY = 4;
    const points = prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * w;
      const y = padY + ((maxP - p) / range) * (h - padY * 2);
      return `${x},${y}`;
    }).join(" ");

    // prevClose line
    const prevCloseY = data.prevClose > 0
      ? padY + ((maxP - data.prevClose) / range) * (h - padY * 2)
      : null;

    const lastItem = data.items[data.items.length - 1];
    const isUp = lastItem.changePercent >= 0;
    const lineColor = isUp ? "#ef4444" : "#22c55e";
    const fillColor = isUp ? "rgba(239, 68, 68, 0.08)" : "rgba(34, 197, 94, 0.08)";

    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full">
        {prevCloseY !== null && (
          <line x1="0" y1={prevCloseY} x2={w} y2={prevCloseY} stroke="currentColor" className="text-muted/30" strokeWidth="0.5" strokeDasharray="3,3" />
        )}
        <polygon
          points={`0,${h} ${points} ${w},${h}`}
          fill={fillColor}
        />
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-500" />
              分时智能选股
              <Badge variant="outline" className="text-[10px] h-5 ml-1 bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                全市场
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {isFromCache && cacheRemaining > 0 && (
                <Badge variant="outline" className="text-xs py-0 px-1.5 gap-1 bg-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-300">
                  <Database className="w-3 h-3" />
                  缓存 {cacheRemaining}s
                </Badge>
              )}
              {lastFetchTime && (
                <span className="text-xs text-muted-foreground">更新于 {lastFetchTime}</span>
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
        </CardHeader>
        <CardContent className="pt-0">
          {/* Strategy Selector */}
          <div className="flex flex-wrap gap-2 mb-3">
            {STRATEGIES.map((s) => {
              const Icon = s.icon;
              const isActive = filters.strategy === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => handleFilterChange("strategy", s.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 border-primary/30 text-primary shadow-sm"
                      : "bg-background border-border hover:bg-muted hover:border-muted-foreground/20"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? s.color : ""}`} />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Active filter tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <Target className="w-3 h-3" />
              全市场扫描
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
              <Clock className="w-3 h-3" />
              {result?.timeWindow === "09:30-10:30" ? "09:30-10:30 严格早段" : "全天数据"}
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <TrendingUp className="w-3 h-3" />
              涨幅{filters.minChange}%~{filters.maxChange}%
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <BarChart3 className="w-3 h-3" />
              市值&lt;{filters.maxMarketCap}亿
            </Badge>
            {filters.minTurnover > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                换手≥{filters.minTurnover}%
              </Badge>
            )}
            {filters.minVolumeRatio > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-300">
                量比≥{filters.minVolumeRatio}
              </Badge>
            )}
            {filters.minCompositeScore > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
                综合评分≥{filters.minCompositeScore}
              </Badge>
            )}
            {filters.enableChiNext && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-purple-500/5 border-purple-500/20 text-purple-700 dark:text-purple-300">
                含创业板
              </Badge>
            )}
            {filters.enableSTAR && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-cyan-500/5 border-cyan-500/20 text-cyan-700 dark:text-cyan-300">
                含科创板
              </Badge>
            )}
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300">
              排除ST
            </Badge>
          </div>

          {/* Watchlist section */}
          {watchlist.length > 0 && (
            <div className="mb-3 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  自选股 ({watchlist.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {watchlist.map((item) => {
                  const changeColor = (item.changePercent ?? 0) >= 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400";
                  return (
                    <Badge
                      key={item.symbol}
                      variant="outline"
                      className="text-[10px] py-0.5 px-2 gap-1 cursor-pointer hover:bg-amber-500/10 border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300 transition-colors"
                      onClick={() => onSelectStock?.(item.symbol)}
                    >
                      {item.name}
                      {item.changePercent != null && (
                        <span className={`tabular-nums ${changeColor}`}>
                          {item.changePercent > 0 ? "+" : ""}{item.changePercent.toFixed(2)}%
                        </span>
                      )}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expand/Collapse Filter Panel */}
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="w-3 h-3" />
            {filtersExpanded ? "收起筛选条件" : "编辑筛选条件"}
            {filtersExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
            {filtersChanged && !filtersExpanded && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            )}
          </button>

          {/* Editable Filter Panel */}
          {filtersExpanded && (
            <div className="mt-3 p-4 rounded-lg border border-border/50 bg-muted/30 space-y-4">
              {/* Row 1: Change range + Market cap */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    涨幅范围 ({filters.minChange}% ~ {filters.maxChange}%)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={-5}
                      max={10}
                      step={0.5}
                      value={[filters.minChange, filters.maxChange]}
                      onValueChange={([min, max]) => {
                        handleFilterChange("minChange", min);
                        handleFilterChange("maxChange", max);
                      }}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.minChange}
                      onChange={(e) => handleFilterChange("minChange", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">~</span>
                    <Input
                      type="number"
                      value={filters.maxChange}
                      onChange={(e) => handleFilterChange("maxChange", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最大市值 ({filters.maxMarketCap}亿)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={10}
                      max={5000}
                      step={50}
                      value={[filters.maxMarketCap]}
                      onValueChange={([v]) => handleFilterChange("maxMarketCap", v)}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.maxMarketCap}
                      onChange={(e) => handleFilterChange("maxMarketCap", parseFloat(e.target.value) || 500)}
                      className="h-7 text-xs w-20"
                      step={50}
                    />
                    <span className="text-xs text-muted-foreground">亿元</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Turnover + Volume ratio + Composite score */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最低换手率 ({filters.minTurnover}%)
                  </Label>
                  <Slider
                    min={0}
                    max={30}
                    step={0.5}
                    value={[filters.minTurnover]}
                    onValueChange={([v]) => handleFilterChange("minTurnover", v)}
                  />
                  <Input
                    type="number"
                    value={filters.minTurnover}
                    onChange={(e) => handleFilterChange("minTurnover", parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs w-20"
                    step={0.5}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最低量比 ({filters.minVolumeRatio})
                  </Label>
                  <Slider
                    min={0}
                    max={5}
                    step={0.1}
                    value={[filters.minVolumeRatio]}
                    onValueChange={([v]) => handleFilterChange("minVolumeRatio", v)}
                  />
                  <Input
                    type="number"
                    value={filters.minVolumeRatio}
                    onChange={(e) => handleFilterChange("minVolumeRatio", parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs w-20"
                    step={0.1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最低综合评分 ({filters.minCompositeScore})
                  </Label>
                  <Slider
                    min={0}
                    max={80}
                    step={5}
                    value={[filters.minCompositeScore]}
                    onValueChange={([v]) => handleFilterChange("minCompositeScore", v)}
                  />
                  <Input
                    type="number"
                    value={filters.minCompositeScore}
                    onChange={(e) => handleFilterChange("minCompositeScore", parseInt(e.target.value) || 0)}
                    className="h-7 text-xs w-20"
                    step={5}
                  />
                </div>
              </div>

              {/* Row 3: Board options + Max results */}
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={filters.enableChiNext}
                    onCheckedChange={(v) => handleFilterChange("enableChiNext", v)}
                  />
                  <Label className="text-xs">含创业板(300xxx)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={filters.enableSTAR}
                    onCheckedChange={(v) => handleFilterChange("enableSTAR", v)}
                  />
                  <Label className="text-xs">含科创板(688xxx)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">最多显示</Label>
                  <Select
                    value={String(filters.maxResults)}
                    onValueChange={(v) => handleFilterChange("maxResults", parseInt(v))}
                  >
                    <SelectTrigger className="h-7 text-xs w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20条</SelectItem>
                      <SelectItem value="50">50条</SelectItem>
                      <SelectItem value="100">100条</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" onClick={handleApplyFilters} disabled={loading} className="h-8 text-xs gap-1">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  应用筛选
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                  }}
                  className="h-8 text-xs"
                >
                  重置默认
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy Description Card */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Shield className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium mb-1">分时选股策略说明</div>
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                <p>本页面采用<span className="text-foreground font-medium">全市场扫描</span>方式，从沪深A股中筛选，不再局限于单一板块。通过7大维度评分系统，选出分时走势最可靠的股票：</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-2">
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">均价线关系 (15%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">站上均价线、突破均价线</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400">量价配合 (20%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">上涨放量、递增放量</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400">趋势形态 (20%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">V型反转、阶梯上涨</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-purple-600 dark:text-purple-400">分时MACD (10%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">金叉、DIF转正</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-red-600 dark:text-red-400">资金流向 (10%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">主力净流入、资金推升</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-teal-600 dark:text-teal-400">量价齐升 (15%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">量增价涨持续</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-cyan-600 dark:text-cyan-400">突破新高 (10%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">突破前高/放量确认</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trading Rules Card */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2">
          <button
            onClick={() => setRulesExpanded(!rulesExpanded)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-500" />
              交易规矩
            </CardTitle>
            {rulesExpanded ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground" /> : <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {rulesExpanded && (
          <CardContent className="pt-0 space-y-4">
            {/* 核心规矩 */}
            <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">核心规矩：大盘+板块+个股三维仓位控制（以深证成指为主）</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                <div className="p-2.5 rounded-md border border-red-500/15 bg-red-500/5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">1/4</span>
                    <span className="text-red-600 dark:text-red-400 font-semibold text-xs">深证↓ + 板块↓ + 个股↓ → 最多用1/4仓位参与（三跌最危险）</span>
                  </div>
                  <p>当深证成指下跌（大盘弱势）、个股所属板块下跌、且个股本身也在下跌时，三个层面全面看空，<strong className="text-foreground">仓位严格控制在总资金的1/4以内</strong>。</p>
                  <div className="mt-2 p-2 rounded border border-red-500/10 bg-red-500/5">
                    <p className="text-red-600 dark:text-red-400 font-medium text-[11px] mb-1">为什么三跌用1/4？</p>
                    <div className="space-y-1 text-[11px]">
                      <p>1. 深证成指下跌说明整个市场系统性承压，80%个股跟随下跌</p>
                      <p>2. 板块下跌说明行业/概念整体弱势，个股难独善其身</p>
                      <p>3. 个股下跌确认了自身弱势，做T是逆三重趋势操作</p>
                      <p>4. 1/4仓位即使亏损3%，总资金也只损失0.75%，风险极度可控</p>
                      <p>5. 保留3/4资金作为后备，可在大盘企稳后加仓</p>
                    </div>
                  </div>
                </div>
                <div className="p-2.5 rounded-md border border-red-500/15 bg-red-500/5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">1/3</span>
                    <span className="text-red-600 dark:text-red-400 font-semibold text-xs">板块↓ + 个股↓（大盘不跌时）→ 最多用1/3仓位参与</span>
                  </div>
                  <p>当大盘（深证）未下跌，但板块和个股双跌时，<strong className="text-foreground">仓位控制在总资金的1/3以内</strong>。大盘不跌说明市场不差，但板块和个股弱势仍需谨慎。</p>
                  <div className="mt-2 p-2 rounded border border-red-500/10 bg-red-500/5">
                    <p className="text-red-600 dark:text-red-400 font-medium text-[11px] mb-1">为什么是1/3？</p>
                    <div className="space-y-1 text-[11px]">
                      <p>1. 板块下跌说明行业/概念整体承压，个股难独善其身</p>
                      <p>2. 个股下跌确认了弱势，做T的方向是逆势操作</p>
                      <p>3. 1/3仓位即使亏损3%，总资金也只损失1%，风险可控</p>
                      <p>4. 保留2/3资金作为后备，可在更低价位补仓或转战其他机会</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 大盘影响说明 */}
            <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">大盘（深证成指）影响规则</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                <p className="text-foreground font-medium">以深证成指为大盘方向参考，大盘方向作为仓位调节器：</p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="p-2 rounded border border-red-500/15 bg-red-500/5">
                    <p className="text-red-600 dark:text-red-400 font-medium text-[11px] mb-1">🔻 深证成指下跌时的仓位调节</p>
                    <div className="space-y-1 text-[11px]">
                      <p>• 板块↓+个股↓ → 从1/3仓降为1/4仓（三跌最危险）</p>
                      <p>• 板块↓+个股↑ → 从20-30%降为1/3仓上限</p>
                      <p>• 板块↑+个股↓ → 从20-30%降为15-20%（大盘拖累）</p>
                      <p>• 板块↑+个股↑ → 从30-40%降为20-30%（大盘压制）</p>
                    </div>
                  </div>
                  <div className="p-2 rounded border border-green-500/15 bg-green-500/5">
                    <p className="text-green-600 dark:text-green-400 font-medium text-[11px] mb-1">🔺 深证成指上涨时的仓位调节</p>
                    <div className="space-y-1 text-[11px]">
                      <p>• 板块↓+个股↓ → 维持1/3仓（大盘有支撑，但板块仍弱）</p>
                      <p>• 板块↓+个股↑ → 可从20-30%提升至25-30%（大盘助力）</p>
                      <p>• 板块↑+个股↓ → 可从20-30%提升至25-30%（回调低吸好时机）</p>
                      <p>• 板块↑+个股↑ → 维持30-40%积极仓位（三涨最强）</p>
                    </div>
                  </div>
                </div>
                <div className="mt-1 p-2 rounded border border-orange-500/10 bg-orange-500/5">
                  <p className="text-orange-600 dark:text-orange-400 font-medium text-[11px] mb-1">为什么选深证成指？</p>
                  <div className="space-y-1 text-[11px]">
                    <p>1. 深证成指覆盖深市核心标的，更能反映中小盘和成长股走势</p>
                    <p>2. 深市个股数量远多于沪市，大部分做T标的在深市</p>
                    <p>3. 深证成指波动性适中，比上证50更灵敏，比创业板指更稳定</p>
                    <p>4. 深证成指跌破关键支撑时，往往意味着市场整体走弱</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 仓位对照表 */}
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <Scale className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">仓位对照表（三维：大盘×板块×个股）</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-amber-500/10">
                      <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">深证成指</th>
                      <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">板块方向</th>
                      <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">个股方向</th>
                      <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">建议仓位</th>
                      <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/30 bg-red-500/8">
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-bold">≤ 1/4</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-600 dark:text-red-400 font-medium">三跌！极度危险</span></td>
                    </tr>
                    <tr className="border-b border-border/30 bg-red-500/5">
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-bold">≤ 1/3</span></td>
                      <td className="py-1.5 px-2">逆势走强，但大环境差</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2 font-medium">15-20%</td>
                      <td className="py-1.5 px-2">大盘拖累，板块独木难支</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2 font-medium">20-30%</td>
                      <td className="py-1.5 px-2">逆势板块，大盘压制</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-bold">≤ 1/3</span></td>
                      <td className="py-1.5 px-2">大盘好但板块差，仍需控仓</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2 font-medium">25-30%</td>
                      <td className="py-1.5 px-2">大盘支撑，个股逆板块</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 下跌</span></td>
                      <td className="py-1.5 px-2 font-medium">25-30%</td>
                      <td className="py-1.5 px-2">大盘+板块支撑，回调低吸</td>
                    </tr>
                    <tr className="border-b border-border/30 bg-green-500/5">
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 上涨</span></td>
                      <td className="py-1.5 px-2 font-medium">30-40%</td>
                      <td className="py-1.5 px-2"><span className="text-green-600 dark:text-green-400 font-medium">三涨！可积极做T</span></td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2"><span className="text-gray-400">— 横盘</span></td>
                      <td className="py-1.5 px-2"><span className="text-gray-400">— 横盘</span></td>
                      <td className="py-1.5 px-2"><span className="text-gray-400">— 横盘</span></td>
                      <td className="py-1.5 px-2 font-medium">15-25%</td>
                      <td className="py-1.5 px-2">方向不明，轻仓试探</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 其他规矩 */}
            <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">其他交易规矩</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">1</span>
                  <div>
                    <span className="text-foreground font-medium">深证成指暴跌（跌幅 &gt; 2%）时不参与任何做T</span>
                    <p>系统性风险下所有技术分析失效，大盘暴跌时80%以上个股跟跌，空仓等待是最好的策略。</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">2</span>
                  <div>
                    <span className="text-foreground font-medium">深证成指连续3天以上下跌，仓位上限减半</span>
                    <p>大盘持续下跌说明市场信心崩塌，即使个股有信号也要极度谨慎。原1/3仓降为1/6，原30%降为15%。</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">3</span>
                  <div>
                    <span className="text-foreground font-medium">板块暴跌时，即使个股上涨也要减仓</span>
                    <p>板块暴跌说明有行业级利空，个股上涨可能只是暂时的抗跌。若大盘也下跌，直接清仓观望。</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">4</span>
                  <div>
                    <span className="text-foreground font-medium">单只股票仓位不超过总资金的40%</span>
                    <p>无论信号多强，单一标的风险过于集中。大盘下跌时应进一步降至25%以下。</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">5</span>
                  <div>
                    <span className="text-foreground font-medium">做T必须当天完成买卖，不隔夜</span>
                    <p>做T本质是利用日内波动赚取差价，不持仓过夜规避隔夜风险。大盘弱势时尤其不能隔夜。</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">6</span>
                  <div>
                    <span className="text-foreground font-medium">连续2次做T亏损，当天停止交易</span>
                    <p>连续亏损说明当前市场节奏与你的判断不一致，停下来观察。大盘下跌时1次亏损即停止。</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">7</span>
                  <div>
                    <span className="text-foreground font-medium">深证成指翻红（由跌转涨）是加仓信号</span>
                    <p>大盘由弱转强时，可从保守仓位提升至正常仓位。如1/4仓→1/3仓，20%→30%。这是大盘给的"安全通行证"。</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">8</span>
                  <div>
                    <span className="text-foreground font-medium">ST股、退市风险股不参与</span>
                    <p>基本面风险无法通过技术分析化解，ST股的低开/下跌可能不是错杀而是价值归零。</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 实战案例 */}
            <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <Info className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">实战案例：三维仓位规矩的应用</span>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                <div className="p-2 rounded-md border border-red-500/10 bg-red-500/5">
                  <p className="text-red-600 dark:text-red-400 font-medium mb-1">场景1：深证成指跌1.8%，半导体板块跌1.5%，某半导体个股跌2.3%</p>
                  <div className="space-y-1">
                    <p>大盘、板块和个股都在下跌，属于<strong className="text-foreground">三跌</strong>情况（最危险）。</p>
                    <p>假设总资金10万元：</p>
                    <p className="pl-2">• 可用仓位：≤ 1/4 = ≤ 2.5万元</p>
                    <p className="pl-2">• 买入2.5万元，个股继续跌3% → 亏损750元，占总资金0.75%，极度可控</p>
                    <p className="pl-2">• 如果满仓10万买入，跌3% → 亏损3000元，占总资金3%，损失过大</p>
                    <p className="pl-2">• 保留7.5万元，等待大盘企稳后再考虑加仓</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-rose-500/10 bg-rose-500/5">
                  <p className="text-rose-600 dark:text-rose-400 font-medium mb-1">场景2：深证成指涨0.8%，半导体板块跌1.5%，某半导体个股跌2.3%</p>
                  <div className="space-y-1">
                    <p>大盘上涨但板块和个股双跌，属于<strong className="text-foreground">大盘强+板块弱+个股弱</strong>。</p>
                    <p>大盘有支撑但板块弱势，仓位仍需控制：</p>
                    <p className="pl-2">• 建议仓位：≤ 1/3，约3.3万元</p>
                    <p className="pl-2">• 大盘上涨提供了市场信心底线，但板块不配合不宜重仓</p>
                    <p className="pl-2">• 如果板块转涨，可提升至25-30%仓位</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-green-500/10 bg-green-500/5">
                  <p className="text-green-600 dark:text-green-400 font-medium mb-1">场景3：深证成指涨1.2%，半导体板块涨0.8%，某半导体个股涨1.5%</p>
                  <div className="space-y-1">
                    <p>大盘、板块和个股都在上涨，属于<strong className="text-foreground">三涨</strong>情况（最安全）。</p>
                    <p>三个层面共振向上，做T成功率高：</p>
                    <p className="pl-2">• 建议仓位：30-40%，约3-4万元</p>
                    <p className="pl-2">• 顺势做T，正T（先买后卖）和反T（先卖后买）均可</p>
                    <p className="pl-2">• 但如果大盘突然翻绿，立即降仓至1/3以下</p>
                  </div>
                </div>
                <div className="p-2 rounded-md border border-emerald-500/10 bg-emerald-500/5">
                  <p className="text-emerald-600 dark:text-emerald-400 font-medium mb-1">场景4：深证成指跌0.5%，半导体板块涨1.2%，某半导体个股涨2.3%</p>
                  <div className="space-y-1">
                    <p>大盘下跌但板块和个股逆势上涨，属于<strong className="text-foreground">大盘弱+板块强+个股强</strong>。</p>
                    <p>板块和个股逆大盘走强，说明有独立行情，但大盘压制下需控制仓位：</p>
                    <p className="pl-2">• 建议仓位：20-30%，约2-3万元</p>
                    <p className="pl-2">• 如果大盘转涨，可提升至30-40%</p>
                    <p className="pl-2">• 如果板块也转跌，立即降仓到1/4以下</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => fetchData(true)} className="mt-2 h-7 text-xs">
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {loading && !result && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">正在全市场扫描，分析分时数据中...</span>
            </div>
            <div className="mt-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {result && result.success && (
        <>
          {/* Stats bar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>扫描: <span className="font-medium text-foreground">{result.totalCount}</span> 只</span>
            <span>符合条件: <span className="font-medium text-emerald-500">{result.filteredCount}</span> 只</span>
            <span>显示: <span className="font-medium text-foreground">{sortedStocks.length}</span> 只</span>
            {result.cached && <Badge variant="outline" className="text-[10px] py-0 bg-blue-500/5 border-blue-500/20 text-blue-600">缓存</Badge>}
            <button
              onClick={() => setStatsExpanded(!statsExpanded)}
              className="flex items-center gap-1 ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <BarChart3 className="w-3 h-3" />
              {statsExpanded ? "收起统计" : "分布统计"}
              {statsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Collapsible Statistics Section */}
          {statsExpanded && screenerStats && (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Score Distribution */}
                  <div>
                    <div className="text-xs font-medium mb-2">综合评分分布</div>
                    <div className="flex items-center gap-3 mb-2 text-[10px] text-muted-foreground">
                      <span>均值: <span className="font-medium text-foreground">{screenerStats.avg}</span></span>
                      <span>中位数: <span className="font-medium text-foreground">{screenerStats.median}</span></span>
                      <span>P75: <span className="font-medium text-foreground">{screenerStats.top25}</span></span>
                    </div>
                    <div className="space-y-1">
                      {screenerStats.distribution.map((d) => {
                        const maxCount = Math.max(...screenerStats.distribution.map((x) => x.count), 1);
                        const barWidth = (d.count / maxCount) * 100;
                        let barColor = "bg-gray-400";
                        if (d.range === "70-80" || d.range === "90-100") barColor = "bg-red-500";
                        else if (d.range === "50-60" || d.range === "60-70") barColor = "bg-orange-500";
                        else if (d.range === "30-40" || d.range === "40-50") barColor = "bg-yellow-500";
                        else if (d.range === "10-20" || d.range === "20-30") barColor = "bg-lime-500";
                        return (
                          <div key={d.range} className="flex items-center gap-2">
                            <span className="w-10 text-[9px] text-muted-foreground tabular-nums text-right">{d.range}</span>
                            <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${barColor} transition-all`}
                                style={{ width: `${barWidth}%`, opacity: d.count > 0 ? 0.8 : 0.2 }}
                              />
                            </div>
                            <span className="w-8 text-[9px] text-muted-foreground tabular-nums text-right">{d.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Pattern Tag Distribution */}
                  <div>
                    <div className="text-xs font-medium mb-2">形态标签分布</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {patternTagDist.map((d) => {
                        const maxCount = patternTagDist[0]?.count || 1;
                        const barWidth = (d.count / maxCount) * 100;
                        const tagColor = getPatternTagChartColor(d.tag);
                        return (
                          <div key={d.tag} className="flex items-center gap-2">
                            <span className="w-16 text-[9px] text-muted-foreground truncate" title={d.tag}>{d.tag}</span>
                            <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${barWidth}%`, backgroundColor: tagColor, opacity: 0.7 }}
                              />
                            </div>
                            <span className="w-6 text-[9px] text-muted-foreground tabular-nums text-right">{d.count}</span>
                            <span className="w-9 text-[9px] text-muted-foreground tabular-nums text-right">{d.percent}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results Table */}
          <Card className="border-border/50 shadow-sm overflow-hidden relative">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40px] text-center text-[10px]">#</TableHead>
                    <TableHead className="text-[10px] min-w-[100px]">股票</TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("compositeScore")}>
                      <div className="flex items-center gap-0.5">综合评分 <SortIcon field="compositeScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px]">形态标签</TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("changePercent")}>
                      <div className="flex items-center gap-0.5">涨跌幅 <SortIcon field="changePercent" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("vwapScore")}>
                      <div className="flex items-center gap-0.5">均价线 <SortIcon field="vwapScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("volumePatternScore")}>
                      <div className="flex items-center gap-0.5">量价 <SortIcon field="volumePatternScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("trendPatternScore")}>
                      <div className="flex items-center gap-0.5">趋势 <SortIcon field="trendPatternScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("macdScore")}>
                      <div className="flex items-center gap-0.5">MACD <SortIcon field="macdScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("capitalFlowScore")}>
                      <div className="flex items-center gap-0.5">资金 <SortIcon field="capitalFlowScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("volumeRatio")}>
                      <div className="flex items-center gap-0.5">量比 <SortIcon field="volumeRatio" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("turnover")}>
                      <div className="flex items-center gap-0.5">换手% <SortIcon field="turnover" /></div>
                    </TableHead>
                    <TableHead className="text-[10px]">市值</TableHead>
                    <TableHead className="text-[10px] w-[80px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStocks.map((stock, idx) => {
                    const isUp = stock.changePercent >= 0;
                    const priceColor = isUp ? "text-red-500" : "text-green-500";
                    const tagStyle = getPatternTagStyle(stock.patternTag);
                    const inWatchlist = watchlist.some((w) => w.symbol === stock.symbol);
                    const rowBg = idx % 2 === 1 ? "bg-muted/20" : "";
                    // Rank badge for top 3
                    const rankBadge = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;

                    return (
                      <TableRow
                        key={stock.symbol}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors group ${rowBg}`}
                        onClick={() => onSelectStock?.(stock.symbol)}
                      >
                        <TableCell className="text-center text-[10px] text-muted-foreground py-2">
                          {rankBadge ? (
                            <span className="text-sm">{rankBadge}</span>
                          ) : (
                            idx + 1
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="text-xs font-medium">{stock.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{stock.symbol}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5">
                            <div className={`text-sm font-bold tabular-nums ${getScoreColor(stock.compositeScore)}`}>
                              {stock.compositeScore}
                            </div>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${getScoreBg(stock.compositeScore)}`}>
                              {getCompositeLabel(stock.compositeScore)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          {stock.patternTag ? (
                            <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${tagStyle.bg} ${tagStyle.text}`}>
                              {stock.patternTag}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${priceColor}`}>
                            {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {stock.changePercent > 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">{stock.price.toFixed(2)}</div>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.vwapScore)}`}>
                                  {stock.vwapScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.vwapDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.volumePatternScore)}`}>
                                  {stock.volumePatternScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.volumePatternDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.trendPatternScore)}`}>
                                  {stock.trendPatternScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.trendPatternDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.macdScore)}`}>
                                  {stock.macdScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.macdDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.capitalFlowScore)}`}>
                                  {stock.capitalFlowScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.capitalFlowDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="text-xs font-medium tabular-nums">
                            {stock.volumeRatio > 0 ? stock.volumeRatio.toFixed(2) : "--"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="text-xs tabular-nums">{stock.turnover > 0 ? stock.turnover.toFixed(2) : "--"}</span>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {formatMarketCap(stock.marketCap)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-0.5">
                            {/* Star / Watchlist button */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-6 w-6 p-0 transition-opacity ${inWatchlist ? "opacity-100 text-amber-500" : "opacity-0 group-hover:opacity-100"}`}
                                    onClick={(e) => handleToggleWatchlist(stock, e)}
                                  >
                                    <Star className={`w-3 h-3 ${inWatchlist ? "fill-amber-500" : ""}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  {inWatchlist ? "移出自选" : "加入自选"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {/* Eye / Preview button */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity ${previewStock?.symbol === stock.symbol ? "text-emerald-500 opacity-100" : ""}`}
                                    onClick={(e) => handlePreview(stock, e)}
                                  >
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  分时预览
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sortedStocks.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8 text-sm text-muted-foreground">
                        暂无符合条件的股票，请调整筛选条件
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mini Timeline Preview Popup */}
            {previewStock && previewPos && (
              <div
                ref={previewRef}
                className="fixed z-50 w-[300px] rounded-lg border border-border/50 shadow-lg bg-background p-3"
                style={{ top: previewPos.top, left: previewPos.left }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{previewStock.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{previewStock.symbol}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewStock(null);
                      setPreviewData(null);
                      setPreviewPos(null);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-bold tabular-nums">{previewStock.price.toFixed(2)}</span>
                  <span className={`text-xs font-medium tabular-nums ${previewStock.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
                    {previewStock.changePercent > 0 ? "+" : ""}{previewStock.changePercent.toFixed(2)}%
                  </span>
                </div>
                {previewLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-[10px] text-muted-foreground">加载分时数据...</span>
                  </div>
                ) : previewData && previewData.items.length > 1 ? (
                  <MiniLineChart data={previewData} />
                ) : (
                  <div className="text-[10px] text-muted-foreground text-center py-4">暂无分时数据</div>
                )}
                {previewData && previewData.items.length > 0 && (
                  <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground">
                    <span>{previewData.items[0]?.time}</span>
                    <span>{previewData.items[previewData.items.length - 1]?.time}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Detail Panel for selected stock */}
          {detailStock && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <LineChart className="w-4 h-4 text-emerald-500" />
                    {detailStock.name} ({detailStock.symbol}) 分时分析详情
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDetailStock(null)}>
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 flex-col sm:flex-row">
                  {/* Radar Chart */}
                  <RadarChart stock={detailStock} />

                  {/* Dimension Details */}
                  <div className="flex-1 space-y-2">
                    {[
                      { label: "均价线关系", score: detailStock.vwapScore, detail: detailStock.vwapDetail, weight: "15%", color: "bg-emerald-500" },
                      { label: "量价配合", score: detailStock.volumePatternScore, detail: detailStock.volumePatternDetail, weight: "20%", color: "bg-blue-500" },
                      { label: "趋势形态", score: detailStock.trendPatternScore, detail: detailStock.trendPatternDetail, weight: "20%", color: "bg-orange-500" },
                      { label: "分时MACD", score: detailStock.macdScore, detail: detailStock.macdDetail, weight: "10%", color: "bg-purple-500" },
                      { label: "资金流向", score: detailStock.capitalFlowScore, detail: detailStock.capitalFlowDetail, weight: "10%", color: "bg-red-500" },
                      { label: "量价齐升", score: detailStock.coRiseScore, detail: detailStock.coRiseDetail, weight: "15%", color: "bg-teal-500" },
                      { label: "突破新高", score: detailStock.breakoutScore, detail: detailStock.breakoutDetail, weight: "10%", color: "bg-cyan-500" },
                    ].map((dim) => (
                      <div key={dim.label} className="flex items-center gap-3">
                        <div className="w-20 text-[10px] text-muted-foreground shrink-0">{dim.label}</div>
                        <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${dim.color}`}
                            style={{ width: `${dim.score}%`, opacity: dim.score >= 30 ? 1 : 0.4 }}
                          />
                        </div>
                        <div className="w-8 text-[10px] text-right tabular-nums font-medium" style={{ color: dim.score >= 50 ? '#10b981' : dim.score >= 30 ? '#f59e0b' : '#9ca3af' }}>
                          {dim.score}
                        </div>
                        <div className="text-[10px] text-muted-foreground shrink-0 w-8">{dim.weight}</div>
                        <div className="text-[10px] text-muted-foreground min-w-0 truncate max-w-[200px]">{dim.detail}</div>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex items-center gap-3">
                      <div className="w-20 text-[10px] font-medium">综合评分</div>
                      <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${detailStock.compositeScore}%` }}
                        />
                      </div>
                      <div className={`w-8 text-sm font-bold text-right tabular-nums ${getScoreColor(detailStock.compositeScore)}`}>
                        {detailStock.compositeScore}
                      </div>
                      <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${getScoreBg(detailStock.compositeScore)}`}>
                        {getCompositeLabel(detailStock.compositeScore)}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">{detailStock.compositeDetail}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
});
