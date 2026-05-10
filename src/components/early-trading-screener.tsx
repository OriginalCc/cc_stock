"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
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
  Search, RefreshCw, TrendingUp, TrendingDown, Zap,
  ArrowUpRight, ArrowDownRight, Activity,
  ChevronUp, ChevronDown, ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon, Loader2, BarChart3, Target,
  Database, SlidersHorizontal, Clock, Sun, Gauge,
  Flame, Eye, Rocket, Timer, AlertTriangle,
  CircleDot, Shield, LineChart, Cpu, Star, X,
} from "lucide-react";
import {
  formatMarketCap,
  formatAmount,
  loadWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isInWatchlist,
  type WatchlistItem,
  useAutoRefresh,
  computeScreenerStats,
  getTradingPhaseInfo,
  fetchMiniTimeline,
  type MiniTimelineResult,
  WATCHLIST_CHANGED_EVENT,
} from "@/lib/screener-shared";
import { cachedFetch } from "@/lib/client-cache";

// ── Types ──────────────────────────────────────────────

interface EarlyScreenStock {
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
  openingPatternScore: number;
  openingPatternDetail: string;
  earlyVolumeScore: number;
  earlyVolumeDetail: string;
  earlyVwapScore: number;
  earlyVwapDetail: string;
  earlyTrendScore: number;
  earlyTrendDetail: string;
  earlyMacdScore: number;
  earlyMacdDetail: string;
  earlyCapitalScore: number;
  earlyCapitalDetail: string;
  earlyCoRiseScore: number;
  earlyCoRiseDetail: string;
  earlyBreakoutScore: number;
  earlyBreakoutDetail: string;
  earlyCompositeScore: number;
  earlyCompositeDetail: string;
  patternTag: string;
  openGapRate: number;
  first30MinChange: number;
  first60MinChange: number;
  earlyVolumeRatio: number;
}

interface EarlyScreenResult {
  success: boolean;
  stocks: EarlyScreenStock[];
  totalCount: number;
  filteredCount: number;
  timestamp: string;
  strategy: string;
  tradingPhase: string;
  minutesSinceOpen: number;
  error?: string;
  cached?: boolean;
}

type SortField = "earlyCompositeScore" | "changePercent" | "openingPatternScore" | "earlyVolumeScore" | "earlyVwapScore" | "earlyTrendScore" | "earlyMacdScore" | "earlyCapitalScore" | "earlyCoRiseScore" | "earlyBreakoutScore" | "marketCap" | "turnover" | "volumeRatio" | "mainNetInflow" | "openGapRate";
type SortOrder = "asc" | "desc";

// ── Strategies ─────────────────────────────────────────

const STRATEGIES = [
  { key: "composite", label: "综合评分", icon: Gauge, desc: "多维度综合评分", color: "text-emerald-500" },
  { key: "volume_ratio", label: "量比飙升", icon: BarChart3, desc: "早盘量比异常", color: "text-blue-500" },
  { key: "capital_flow", label: "主力抢筹", icon: TrendingUp, desc: "主力资金早盘流入", color: "text-red-500" },
  { key: "change", label: "涨幅排行", icon: Rocket, desc: "开盘涨幅靠前", color: "text-orange-500" },
  { key: "turnover", label: "换手活跃", icon: Activity, desc: "早盘换手率高", color: "text-purple-500" },
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
  minChange: -2,
  maxChange: 9,
  maxMarketCap: 500,
  minTurnover: 1,
  minVolumeRatio: 1,
  minCompositeScore: 25,
  maxResults: 50,
  enableChiNext: false,
  enableSTAR: false,
};

// ── Module-level client cache ──────────────────────────

interface ClientCacheEntry {
  result: EarlyScreenResult;
  lastFetchTime: string;
  timestamp: number;
  filters: ScreenerFilters;
}
const CLIENT_CACHE_TTL = 2 * 60 * 1000;
let clientCache: ClientCacheEntry | null = null;

// ── Helper functions (local-only, not duplicated in shared) ──

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
  if (tag.includes("V反转") || tag.includes("V型")) return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400" };
  if (tag.includes("阶梯")) return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400" };
  if (tag.includes("高开强走")) return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400" };
  if (tag.includes("低开反转")) return { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-600 dark:text-amber-400" };
  if (tag.includes("突破") || tag.includes("新高")) return { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" };
  if (tag.includes("启动")) return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400" };
  if (tag.includes("强推")) return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400" };
  if (tag.includes("推荐")) return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400" };
  return { bg: "bg-gray-500/10 border-gray-500/30", text: "text-gray-600 dark:text-gray-400" };
}

function getOpenGapStyle(rate: number): { bg: string; text: string } {
  if (rate >= 3) return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600 dark:text-red-400" };
  if (rate >= 1) return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400" };
  if (rate <= -3) return { bg: "bg-green-500/10 border-green-500/30", text: "text-green-600 dark:text-green-400" };
  if (rate <= -1) return { bg: "bg-lime-500/10 border-lime-500/30", text: "text-lime-600 dark:text-lime-400" };
  return { bg: "bg-gray-500/10 border-gray-500/30", text: "text-gray-600 dark:text-gray-400" };
}

function getTradingPhaseIcon(phase: string) {
  if (phase.includes("15分钟")) return <Zap className="w-4 h-4 text-red-500" />;
  if (phase.includes("30分钟")) return <Flame className="w-4 h-4 text-orange-500" />;
  if (phase.includes("1小时")) return <Sun className="w-4 h-4 text-amber-500" />;
  if (phase.includes("盘中")) return <LineChart className="w-4 h-4 text-blue-500" />;
  if (phase.includes("午休")) return <Clock className="w-4 h-4 text-muted-foreground" />;
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

function getTradingPhaseColor(phase: string): string {
  if (phase.includes("15分钟")) return "bg-red-500/10 border-red-500/20 text-red-600";
  if (phase.includes("30分钟")) return "bg-orange-500/10 border-orange-500/20 text-orange-600";
  if (phase.includes("1小时")) return "bg-amber-500/10 border-amber-500/20 text-amber-600";
  if (phase.includes("盘中")) return "bg-blue-500/10 border-blue-500/20 text-blue-600";
  return "bg-muted/50 border-border text-muted-foreground";
}

// ── Rank badge helper ──
function getRankBadge(idx: number) {
  if (idx === 0) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">1</span>;
  if (idx === 1) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-400 text-white text-[10px] font-bold">2</span>;
  if (idx === 2) return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-700 text-white text-[10px] font-bold">3</span>;
  return <span className="text-[10px] text-muted-foreground">{idx + 1}</span>;
}

// ── Mini SVG Timeline Chart ──
function SVGMiniTimeline({ data, prevClose }: { data: MiniTimelineResult; prevClose: number }) {
  const items = data.items;
  if (items.length < 2) return <div className="text-[10px] text-muted-foreground text-center py-4">暂无分时数据</div>;

  const prices = items.map((d) => d.price);
  const avgPrices = items.map((d) => d.avgPrice);
  const minP = Math.min(...prices, ...avgPrices, prevClose) * 0.998;
  const maxP = Math.max(...prices, ...avgPrices, prevClose) * 1.002;
  const range = maxP - minP || 1;

  const w = 280;
  const h = 100;
  const px = 4;
  const py = 8;

  const toX = (i: number) => px + (i / (items.length - 1)) * (w - 2 * px);
  const toY = (p: number) => py + (1 - (p - minP) / range) * (h - 2 * py);

  const pricePath = items.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.price).toFixed(1)}`).join(" ");
  const avgPath = items.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.avgPrice).toFixed(1)}`).join(" ");
  const prevCloseY = toY(prevClose);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full">
      {/* Prev close line */}
      <line x1={px} y1={prevCloseY} x2={w - px} y2={prevCloseY} stroke="currentColor" className="text-muted-foreground" strokeWidth="0.5" strokeDasharray="3,2" />
      {/* Price line */}
      <path d={pricePath} fill="none" stroke="rgb(239, 68, 68)" strokeWidth="1.5" />
      {/* Avg price line */}
      <path d={avgPath} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="1" strokeDasharray="2,2" />
      {/* Last point dot */}
      {items.length > 0 && (
        <circle cx={toX(items.length - 1)} cy={toY(items[items.length - 1].price)} r="2.5" fill="rgb(239, 68, 68)" />
      )}
    </svg>
  );
}

// ── Component ──────────────────────────────────────────

interface EarlyTradingScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

export function EarlyTradingScreener({ onSelectStock }: EarlyTradingScreenerProps) {
  const [result, setResult] = useState<EarlyScreenResult | null>(clientCache?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("earlyCompositeScore");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [lastFetchTime, setLastFetchTime] = useState<string>(clientCache?.lastFetchTime ?? "");
  const [isFromCache, setIsFromCache] = useState(!!clientCache);

  // Filter states
  const [filters, setFilters] = useState<ScreenerFilters>(clientCache?.filters ?? DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // ── Watchlist state ──
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // ── Mini Timeline popup state ──
  const [timelinePopup, setTimelinePopup] = useState<{ symbol: string; name: string; openGapRate?: number; first30MinChange?: number; earlyVolumeRatio?: number } | null>(null);
  const [timelineData, setTimelineData] = useState<MiniTimelineResult | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Countdown timer
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Load watchlist on mount ──
  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  // ── Listen for watchlist changes (cross-component / cross-tab) ──
  useEffect(() => {
    const handler = () => setWatchlist(loadWatchlist());
    window.addEventListener(WATCHLIST_CHANGED_EVENT, handler);
    // storage event for cross-tab
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(WATCHLIST_CHANGED_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // ── Auto-refresh during trading hours ──
  // Early screener is especially active during 9:30-10:30 golden window
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  useAutoRefresh(() => fetchData(false), autoRefreshEnabled);

  // Check if currently in golden screening window (9:30-10:30)
  const isInGoldenWindow = useMemo(() => {
    const phaseInfo = getTradingPhaseInfo();
    return phaseInfo.isTradingHours && phaseInfo.minutesSinceOpen <= 60;
  }, [currentTime]);

  const tradingPhase = result?.tradingPhase || "非交易时间";
  const minutesSinceOpen = result?.minutesSinceOpen || 0;

  const fetchData = useCallback(async (forceRefresh = false, customFilters?: ScreenerFilters) => {
    const f = customFilters || filters;
    setLoading(true);
    setError(null);
    setIsFromCache(false);
    try {
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

      const data: EarlyScreenResult = await cachedFetch<EarlyScreenResult>(
        `early-screen:${params.toString()}`,
        async () => {
          const res = await fetch(`/api/stock/early-screen?${params}`);
          if (!res.ok) throw new Error("选股失败");
          return res.json();
        },
        forceRefresh ? 0 : 120_000
      );

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        setIsFromCache(!!data.cached);
        clientCache = { result: data, lastFetchTime: fetchTime, timestamp: Date.now(), filters: f };
      } else {
        setError(data.error || "选股失败");
      }
    } catch (e: any) {
      setError(e.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Auto-fetch on mount
  useEffect(() => {
    if (clientCache) {
      setResult(clientCache.result);
      setLastFetchTime(clientCache.lastFetchTime);
      setFilters(clientCache.filters);
      setIsFromCache(true);
      if (Date.now() - clientCache.timestamp >= CLIENT_CACHE_TTL) {
        fetchData(false, clientCache.filters);
      }
    } else {
      fetchData();
    }
  }, []);

  // ── Handle timeline popup fetch ──
  const handleTimelineFetch = useCallback(async (stock: EarlyScreenStock) => {
    if (timelinePopup?.symbol === stock.symbol) {
      setTimelinePopup(null);
      setTimelineData(null);
      return;
    }
    setTimelinePopup({
      symbol: stock.symbol,
      name: stock.name,
      openGapRate: stock.openGapRate,
      first30MinChange: stock.first30MinChange,
      earlyVolumeRatio: stock.earlyVolumeRatio,
    });
    setTimelineData(null);
    setTimelineLoading(true);
    try {
      const data = await fetchMiniTimeline(stock.symbol);
      setTimelineData(data);
    } catch {
      setTimelineData(null);
    } finally {
      setTimelineLoading(false);
    }
  }, [timelinePopup]);

  // Close timeline popup on outside click
  useEffect(() => {
    if (!timelinePopup) return;
    const handler = (e: MouseEvent) => {
      if (timelineRef.current && !timelineRef.current.contains(e.target as Node)) {
        setTimelinePopup(null);
        setTimelineData(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [timelinePopup]);

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

  // ── Compute stats summary ──
  const screenerStats = useMemo(() => {
    if (!sortedStocks.length) return null;
    const scores = sortedStocks.map((s) => s.earlyCompositeScore);
    return computeScreenerStats(scores);
  }, [sortedStocks]);

  // Pattern tag distribution
  const patternTagDist = useMemo(() => {
    if (!sortedStocks.length) return [];
    const map = new Map<string, number>();
    sortedStocks.forEach((s) => {
      const tag = s.patternTag || "无标签";
      map.set(tag, (map.get(tag) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag, count }));
  }, [sortedStocks]);

  // Open gap rate distribution (高开/平开/低开)
  const gapDist = useMemo(() => {
    if (!sortedStocks.length) return { high: 0, flat: 0, low: 0 };
    let high = 0, flat = 0, low = 0;
    sortedStocks.forEach((s) => {
      if (s.openGapRate >= 1) high++;
      else if (s.openGapRate <= -1) low++;
      else flat++;
    });
    return { high, flat, low };
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

  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  const cacheRemaining = useMemo(() => {
    if (!clientCache) return 0;
    const elapsed = Date.now() - clientCache.timestamp;
    return Math.max(0, Math.ceil((CLIENT_CACHE_TTL - elapsed) / 1000));
  }, [lastFetchTime, isFromCache]);

  // Time to optimal screening
  const timeInfo = useMemo(() => {
    const now = currentTime;
    const chinaOffset = 8 * 60;
    const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
    const h = chinaTime.getHours();
    const m = chinaTime.getMinutes();
    const s = chinaTime.getSeconds();
    const dayOfWeek = chinaTime.getDay();

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Calculate time to 10:30 (optimal screening time)
    const currentMinutes = h * 60 + m;
    const targetMinutes = 10 * 60 + 30; // 10:30
    const openMinutes = 9 * 60 + 30; // 9:30

    if (isWeekend) {
      return { status: "weekend" as const, message: "周末休市" };
    }

    if (currentMinutes < openMinutes) {
      const diff = openMinutes - currentMinutes;
      const dh = Math.floor(diff / 60);
      const dm = diff % 60;
      return { status: "before" as const, message: `距开盘 ${dh > 0 ? `${dh}时` : ""}${dm}分${s}秒` };
    }

    if (currentMinutes <= targetMinutes) {
      const diff = targetMinutes - currentMinutes;
      return { status: "optimal" as const, message: `黄金选股窗口 (${diff}分钟后最佳)` };
    }

    if (currentMinutes <= 11 * 60 + 30) {
      return { status: "active" as const, message: "交易时段，可随时刷新" };
    }

    return { status: "closed" as const, message: "已收盘，结果为当日数据" };
  }, [currentTime]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header with Trading Phase */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              开盘1小时选股
              <Badge variant="outline" className={`text-[10px] h-5 ml-1 ${getTradingPhaseColor(tradingPhase)}`}>
                {getTradingPhaseIcon(tradingPhase)}
                <span className="ml-1">{tradingPhase}</span>
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Auto-refresh indicator */}
              {autoRefreshEnabled && (
                <Badge
                  variant="outline"
                  className={`text-[10px] h-5 px-1.5 gap-1 cursor-pointer ${
                    isInGoldenWindow
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 animate-pulse"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  }`}
                  onClick={() => setAutoRefreshEnabled(false)}
                >
                  <RefreshCw className="w-3 h-3" />
                  {isInGoldenWindow ? "黄金窗口自动刷新中" : "自动刷新"}
                </Badge>
              )}
              {!autoRefreshEnabled && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-1.5 gap-1 cursor-pointer bg-muted/50 border-border text-muted-foreground"
                  onClick={() => setAutoRefreshEnabled(true)}
                >
                  <RefreshCw className="w-3 h-3" />
                  开启自动刷新
                </Badge>
              )}
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
          {/* Real-time timer banner */}
          <div className={`mb-3 p-3 rounded-lg border flex items-center gap-3 ${
            timeInfo.status === "optimal" 
              ? "bg-amber-500/5 border-amber-500/20" 
              : timeInfo.status === "before"
              ? "bg-blue-500/5 border-blue-500/20"
              : timeInfo.status === "weekend"
              ? "bg-muted/30 border-border"
              : "bg-emerald-500/5 border-emerald-500/20"
          }`}>
            <div className={`p-1.5 rounded-md ${
              timeInfo.status === "optimal" 
                ? "bg-amber-500/10" 
                : timeInfo.status === "before"
                ? "bg-blue-500/10"
                : "bg-emerald-500/10"
            }`}>
              {timeInfo.status === "optimal" ? (
                <Timer className="w-4 h-4 text-amber-500" />
              ) : timeInfo.status === "before" ? (
                <Clock className="w-4 h-4 text-blue-500" />
              ) : (
                <Sun className="w-4 h-4 text-emerald-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium">
                {timeInfo.status === "optimal" && "🔥 黄金选股窗口期"}
                {timeInfo.status === "before" && "⏰ 等待开盘"}
                {timeInfo.status === "active" && "📊 交易时段"}
                {timeInfo.status === "closed" && "📈 盘后复盘"}
                {timeInfo.status === "weekend" && "🏖️ 周末休市"}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{timeInfo.message}</div>
            </div>
            {minutesSinceOpen > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 bg-background">
                已开 {minutesSinceOpen} 分钟
              </Badge>
            )}
          </div>

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
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
              <Sun className="w-3 h-3" />
              严格09:30-10:30
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
              <TrendingUp className="w-3 h-3" />
              涨幅{filters.minChange}%~{filters.maxChange}%
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
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
                  <Slider
                    min={10}
                    max={5000}
                    step={50}
                    value={[filters.maxMarketCap]}
                    onValueChange={([v]) => handleFilterChange("maxMarketCap", v)}
                  />
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

              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" onClick={handleApplyFilters} disabled={loading} className="h-8 text-xs gap-1">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  应用筛选
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="h-8 text-xs"
                >
                  重置默认
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy Explanation Card */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Shield className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium mb-1">开盘1小时选股策略说明</div>
              <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                <p>本页面专注于<span className="text-foreground font-medium">开盘首小时(9:30-10:30)</span>的分时数据，通过8大早盘特有维度，在盘中即可选出强势股，无需等到收盘：</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mt-2">
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-red-600 dark:text-red-400">开盘形态 (20%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">高开强走/低开反转</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400">早盘量能 (20%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">开盘放量/量比飙升</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">均价线 (12%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">快速突破均价线</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400">早盘趋势 (12%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">V型反转/阶梯启动</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-purple-600 dark:text-purple-400">早盘MACD (8%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">金叉/红柱出现</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-rose-600 dark:text-rose-400">主力抢筹 (8%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">早盘资金大幅流入</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-teal-600 dark:text-teal-400">量价齐升 (12%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">量增价涨持续</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <div className="text-[10px] font-medium text-cyan-600 dark:text-cyan-400">突破新高 (8%)</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">突破前高/放量确认</div>
                  </div>
                </div>
                <div className="mt-2 flex items-start gap-1.5 p-2 rounded-md bg-amber-500/5 border border-amber-500/10">
                  <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-[10px]">
                    <span className="font-medium text-amber-600 dark:text-amber-400">最佳使用时间：</span>
                    9:30-10:30 期间，10:30左右数据最充分，选股效果最佳。也可盘后使用查看当日结果。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
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

      {/* Loading */}
      {loading && !result && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">正在分析早盘数据，扫描开盘形态中...</span>
            </div>
            <div className="mt-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && result.success && (
        <>
          {/* Stats bar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>扫描: <span className="font-medium text-foreground">{result.totalCount}</span> 只</span>
            <span>符合条件: <span className="font-medium text-amber-500">{result.filteredCount}</span> 只</span>
            <span>显示: <span className="font-medium text-foreground">{sortedStocks.length}</span> 只</span>
            {result.cached && <Badge variant="outline" className="text-[10px] py-0 bg-blue-500/5 border-blue-500/20 text-blue-600">缓存</Badge>}
          </div>

          {/* ── Compact Watchlist Section ── */}
          {watchlist.length > 0 && (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-xs font-medium">自选股</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">{watchlist.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {watchlist.slice(0, 10).map((item) => {
                    const stockData = sortedStocks.find((s) => s.symbol === item.symbol);
                    const changePct = stockData?.changePercent ?? item.changePercent ?? 0;
                    return (
                      <button
                        key={item.symbol}
                        onClick={() => onSelectStock?.(item.symbol)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors text-[10px]"
                      >
                        <span className="font-medium">{item.name}</span>
                        <span className={`tabular-nums ${changePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                          {changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%
                        </span>
                      </button>
                    );
                  })}
                  {watchlist.length > 10 && (
                    <span className="text-[10px] text-muted-foreground self-center">+{watchlist.length - 10}更多</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Result Statistics Summary ── */}
          {screenerStats && sortedStocks.length > 0 && (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium">选股统计</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Score distribution */}
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">综合评分分布</div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground">均:</span>
                      <span className="font-medium text-foreground tabular-nums">{screenerStats.avg}</span>
                      <span className="text-muted-foreground">中位:</span>
                      <span className="font-medium text-foreground tabular-nums">{screenerStats.median}</span>
                      <span className="text-muted-foreground">P75:</span>
                      <span className="font-medium text-foreground tabular-nums">{screenerStats.top25}</span>
                    </div>
                    {/* Mini distribution bar */}
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/30">
                      {screenerStats.distribution.slice(0, 10).map((bucket, i) => {
                        if (bucket.count === 0) return null;
                        const colors = [
                          "bg-gray-400", "bg-lime-500", "bg-lime-500", "bg-yellow-500",
                          "bg-yellow-500", "bg-orange-500", "bg-orange-500", "bg-red-500",
                          "bg-red-500", "bg-red-600",
                        ];
                        return (
                          <div
                            key={i}
                            className={`${colors[i]} transition-all`}
                            style={{ width: `${bucket.percent}%`, minWidth: bucket.count > 0 ? "2px" : "0" }}
                            title={`${bucket.range}: ${bucket.count}只 (${bucket.percent}%)`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Pattern tag distribution */}
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">形态标签分布</div>
                    <div className="flex flex-wrap gap-1">
                      {patternTagDist.map(({ tag, count }) => {
                        const style = getPatternTagStyle(tag);
                        return (
                          <Badge key={tag} variant="outline" className={`text-[8px] h-3.5 px-1 ${style.bg} ${style.text}`}>
                            {tag} {count}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* Open gap rate distribution */}
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">开盘缺口分布</div>
                    <div className="flex gap-2 text-[10px]">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        <span>高开 <span className="font-medium text-foreground">{gapDist.high}</span></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                        <span>平开 <span className="font-medium text-foreground">{gapDist.flat}</span></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        <span>低开 <span className="font-medium text-foreground">{gapDist.low}</span></span>
                      </div>
                    </div>
                    {/* Mini bar */}
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/30">
                      <div className="bg-red-500" style={{ width: `${(gapDist.high / sortedStocks.length) * 100}%`, minWidth: gapDist.high > 0 ? "2px" : "0" }} />
                      <div className="bg-gray-400" style={{ width: `${(gapDist.flat / sortedStocks.length) * 100}%`, minWidth: gapDist.flat > 0 ? "2px" : "0" }} />
                      <div className="bg-green-500" style={{ width: `${(gapDist.low / sortedStocks.length) * 100}%`, minWidth: gapDist.low > 0 ? "2px" : "0" }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results Table */}
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40px] text-center text-[10px]">#</TableHead>
                    <TableHead className="text-[10px] min-w-[100px]">股票</TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("earlyCompositeScore")}>
                      <div className="flex items-center gap-0.5">早盘评分 <SortIcon field="earlyCompositeScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px]">形态标签</TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("changePercent")}>
                      <div className="flex items-center gap-0.5">涨跌幅 <SortIcon field="changePercent" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("openGapRate")}>
                      <div className="flex items-center gap-0.5">开盘缺口 <SortIcon field="openGapRate" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("openingPatternScore")}>
                      <div className="flex items-center gap-0.5">开盘形态 <SortIcon field="openingPatternScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("earlyVolumeScore")}>
                      <div className="flex items-center gap-0.5">早盘量能 <SortIcon field="earlyVolumeScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("earlyVwapScore")}>
                      <div className="flex items-center gap-0.5">均价线 <SortIcon field="earlyVwapScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("earlyTrendScore")}>
                      <div className="flex items-center gap-0.5">趋势 <SortIcon field="earlyTrendScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("earlyMacdScore")}>
                      <div className="flex items-center gap-0.5">MACD <SortIcon field="earlyMacdScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("earlyCapitalScore")}>
                      <div className="flex items-center gap-0.5">资金 <SortIcon field="earlyCapitalScore" /></div>
                    </TableHead>
                    <TableHead className="text-[10px] cursor-pointer select-none" onClick={() => handleSort("volumeRatio")}>
                      <div className="flex items-center gap-0.5">量比 <SortIcon field="volumeRatio" /></div>
                    </TableHead>
                    <TableHead className="text-[10px]">前30分</TableHead>
                    <TableHead className="text-[10px]">市值</TableHead>
                    <TableHead className="text-[10px] w-[72px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStocks.map((stock, idx) => {
                    const isUp = stock.changePercent >= 0;
                    const priceColor = isUp ? "text-red-500" : "text-green-500";
                    const tagStyle = getPatternTagStyle(stock.patternTag);
                    const gapStyle = getOpenGapStyle(stock.openGapRate);
                    const inWatchlist = watchlist.some((w) => w.symbol === stock.symbol);

                    return (
                      <TableRow
                        key={stock.symbol}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors group ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                        onClick={() => onSelectStock?.(stock.symbol)}
                      >
                        <TableCell className="text-center py-2">
                          {getRankBadge(idx)}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              className="shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (inWatchlist) {
                                  removeFromWatchlist(stock.symbol);
                                } else {
                                  addToWatchlist(stock.symbol, stock.name, "early-screen", stock.price, stock.changePercent);
                                }
                                setWatchlist(loadWatchlist());
                              }}
                            >
                              <Star className={`w-3.5 h-3.5 transition-colors ${inWatchlist ? "text-amber-500 fill-amber-500" : "text-muted-foreground/40 hover:text-amber-400"}`} />
                            </button>
                            <div>
                              <div className="text-xs font-medium">{stock.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{stock.symbol}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5">
                            <div className={`text-sm font-bold tabular-nums ${getScoreColor(stock.earlyCompositeScore)}`}>
                              {stock.earlyCompositeScore}
                            </div>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 ${getScoreBg(stock.earlyCompositeScore)}`}>
                              {getCompositeLabel(stock.earlyCompositeScore)}
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
                          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${gapStyle.bg} ${gapStyle.text}`}>
                            {stock.openGapRate > 0 ? "+" : ""}{stock.openGapRate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.openingPatternScore)}`}>
                                  {stock.openingPatternScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.openingPatternDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.earlyVolumeScore)}`}>
                                  {stock.earlyVolumeScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.earlyVolumeDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.earlyVwapScore)}`}>
                                  {stock.earlyVwapScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.earlyVwapDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.earlyTrendScore)}`}>
                                  {stock.earlyTrendScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.earlyTrendDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.earlyMacdScore)}`}>
                                  {stock.earlyMacdScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.earlyMacdDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs font-medium tabular-nums cursor-help ${getScoreColor(stock.earlyCapitalScore)}`}>
                                  {stock.earlyCapitalScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[200px]">
                                <p className="text-xs">{stock.earlyCapitalDetail || "无详情"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className={`text-xs font-medium tabular-nums ${stock.volumeRatio >= 2 ? "text-red-500" : stock.volumeRatio >= 1.5 ? "text-orange-500" : "text-muted-foreground"}`}>
                            {stock.volumeRatio.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className={`text-[10px] font-medium tabular-nums ${stock.first30MinChange >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {stock.first30MinChange > 0 ? "+" : ""}{stock.first30MinChange.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="text-[10px] text-muted-foreground">{formatMarketCap(stock.marketCap)}</span>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTimelineFetch(stock);
                              }}
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* ── Mini Timeline Popup ── */}
          {timelinePopup && (
            <Card className="border-border/50 shadow-sm relative" ref={timelineRef}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <LineChart className="w-4 h-4 text-amber-500" />
                    {timelinePopup.name} ({timelinePopup.symbol}) 早盘分时预览
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setTimelinePopup(null); setTimelineData(null); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {timelineLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">加载分时数据中...</span>
                  </div>
                ) : timelineData && timelineData.items.length > 0 ? (
                  <div className="space-y-3">
                    <SVGMiniTimeline data={timelineData} prevClose={timelineData.prevClose} />
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="inline-block w-4 h-0.5 bg-red-500" /> 价格
                      <span className="inline-block w-4 h-0.5 border-t border-dashed border-blue-500 ml-2" /> 均价
                      <span className="inline-block w-4 h-0.5 border-t border-dashed border-muted-foreground ml-2" /> 昨收
                    </div>
                    {/* Early-specific data */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 rounded-md bg-muted/30 border border-border/50">
                        <div className="text-[9px] text-muted-foreground">开盘缺口率</div>
                        <div className={`text-xs font-bold tabular-nums ${timelinePopup.openGapRate !== undefined && timelinePopup.openGapRate >= 0 ? "text-red-500" : "text-green-500"}`}>
                          {timelinePopup.openGapRate !== undefined ? `${timelinePopup.openGapRate > 0 ? "+" : ""}${timelinePopup.openGapRate.toFixed(1)}%` : "--"}
                        </div>
                      </div>
                      <div className="p-2 rounded-md bg-muted/30 border border-border/50">
                        <div className="text-[9px] text-muted-foreground">前30分钟涨跌</div>
                        <div className={`text-xs font-bold tabular-nums ${timelinePopup.first30MinChange !== undefined && timelinePopup.first30MinChange >= 0 ? "text-red-500" : "text-green-500"}`}>
                          {timelinePopup.first30MinChange !== undefined ? `${timelinePopup.first30MinChange > 0 ? "+" : ""}${timelinePopup.first30MinChange.toFixed(2)}%` : "--"}
                        </div>
                      </div>
                      <div className="p-2 rounded-md bg-muted/30 border border-border/50">
                        <div className="text-[9px] text-muted-foreground">早盘量比</div>
                        <div className={`text-xs font-bold tabular-nums ${timelinePopup.earlyVolumeRatio !== undefined && timelinePopup.earlyVolumeRatio >= 2 ? "text-red-500" : "text-foreground"}`}>
                          {timelinePopup.earlyVolumeRatio !== undefined ? timelinePopup.earlyVolumeRatio.toFixed(2) : "--"}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground text-center py-4">暂无分时数据</div>
                )}
              </CardContent>
            </Card>
          )}

          {/* No results hint */}
          {sortedStocks.length === 0 && !loading && (
            <Card className="border-border/50">
              <CardContent className="p-8 text-center">
                <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <div className="text-sm font-medium mb-1">暂无符合条件的股票</div>
                <div className="text-xs text-muted-foreground">
                  {tradingPhase === "非交易时间"
                    ? "当前非交易时间，请在交易日9:30-10:30使用"
                    : "尝试放宽筛选条件，降低最低综合评分或量比要求"}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
