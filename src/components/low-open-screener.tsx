"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingDown, RefreshCw, ArrowUpRight, ArrowDownRight,
  Search, ChevronUp, ChevronDown, Loader2, BarChart3,
  Target, Database, ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon, X, SlidersHorizontal,
  Bookmark, BookmarkPlus, Star, Clock, AlertCircle,
  TrendingUp, Activity, Flame,
} from "lucide-react";

import {
  formatMarketCap, formatAmount, loadWatchlist, addToWatchlist,
  removeFromWatchlist, isInWatchlist, useAutoRefresh, isTradingHours,
} from "@/lib/screener-shared";

// ── Types ──────────────────────────────────────────────

interface LowOpenStock {
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
  pe: number;
  amplitude: number;
  mainNetInflow: number;
  volumeRatio: number;
  openGapRate: number;
  recoveryRate: number;
  recoveryScore: number;
  recoveryDetail: string;
  lowOpenPattern: string;
  sectorName: string;
}

interface LowOpenResult {
  success: boolean;
  stocks: LowOpenStock[];
  totalCount: number;
  filteredCount: number;
  sectorName: string;
  timestamp: string;
  error?: string;
  cached?: boolean;
}

type SortField = "recoveryScore" | "openGapRate" | "recoveryRate" | "changePercent" | "marketCap" | "turnover" | "volumeRatio" | "amplitude";
type SortOrder = "asc" | "desc";

// ── Helpers ────────────────────────────────────────────

const POPULAR_SECTORS = [
  // ── 科技 ──
  { label: "通信", emoji: "📡" }, { label: "半导体", emoji: "💎" },
  { label: "人工智能", emoji: "🤖" }, { label: "算力", emoji: "🖥️" },
  { label: "软件", emoji: "💻" }, { label: "信创", emoji: "🔒" },
  { label: "消费电子", emoji: "📱" }, { label: "机器人", emoji: "🦾" },
  { label: "华为", emoji: "📲" }, { label: "鸿蒙", emoji: "🦋" },
  { label: "游戏", emoji: "🎮" }, { label: "传媒", emoji: "🎬" },
  { label: "云计算", emoji: "☁️" }, { label: "大数据", emoji: "📊" },
  { label: "网络安全", emoji: "🔐" }, { label: "元宇宙", emoji: "🥽" },
  { label: "物联网", emoji: "🔗" }, { label: "数字货币", emoji: "💰" },
  // ── 新能源 ──
  { label: "新能源", emoji: "☀️" }, { label: "光伏", emoji: "🌞" },
  { label: "锂电池", emoji: "🔋" }, { label: "储能", emoji: "🔌" },
  { label: "新能源车", emoji: "🚗" }, { label: "汽车", emoji: "🚘" },
  { label: "充电桩", emoji: "⛽" }, { label: "风电", emoji: "🌬️" },
  { label: "氢能源", emoji: "🧪" }, { label: "核能", emoji: "☢️" },
  // ── 医药 ──
  { label: "医药", emoji: "💊" }, { label: "中药", emoji: "🌿" },
  { label: "创新药", emoji: "💉" }, { label: "医疗器械", emoji: "🏥" },
  { label: "医美", emoji: "💆" }, { label: "CRO", emoji: "🔬" },
  { label: "疫苗", emoji: "🦠" }, { label: "血制品", emoji: "🩸" },
  // ── 金融 ──
  { label: "银行", emoji: "🏦" }, { label: "证券", emoji: "📈" },
  { label: "保险", emoji: "🛡️" }, { label: "多元金融", emoji: "🏛️" },
  // ── 消费 ──
  { label: "消费", emoji: "🛒" }, { label: "白酒", emoji: "🍶" },
  { label: "食品", emoji: "🍜" }, { label: "家电", emoji: "📺" },
  { label: "旅游", emoji: "✈️" }, { label: "零售", emoji: "🏪" },
  { label: "纺织服装", emoji: "🧵" }, { label: "宠物", emoji: "🐾" },
  { label: "预制菜", emoji: "🍱" },
  // ── 周期/资源 ──
  { label: "煤炭", emoji: "⛏️" }, { label: "钢铁", emoji: "🔩" },
  { label: "有色", emoji: "🟡" }, { label: "稀土", emoji: "🧲" },
  { label: "黄金", emoji: "🥇" }, { label: "石油", emoji: "🛢️" },
  { label: "化工", emoji: "🧫" }, { label: "建材", emoji: "🧱" },
  { label: "水泥", emoji: "🧱" },
  // ── 制造 ──
  { label: "军工", emoji: "🛡️" }, { label: "国防", emoji: "🎖️" },
  { label: "航空", emoji: "🛩️" }, { label: "造船", emoji: "🚢" },
  { label: "电力", emoji: "⚡" }, { label: "绿电", emoji: "🌱" },
  { label: "机械", emoji: "⚙️" }, { label: "地产", emoji: "🏠" },
  { label: "建筑", emoji: "🏗️" },
  // ── 农业 ──
  { label: "农业", emoji: "🌾" }, { label: "养殖", emoji: "🐷" },
  { label: "种业", emoji: "🌱" }, { label: "化肥", emoji: "🧴" },
  // ── 交通物流 ──
  { label: "物流", emoji: "📦" }, { label: "港口", emoji: "⚓" },
  { label: "高铁", emoji: "🚄" },
  // ── 环保 ──
  { label: "环保", emoji: "♻️" }, { label: "碳交易", emoji: "🌍" },
  // ── 其他 ──
  { label: "教育", emoji: "📚" }, { label: "跨境电商", emoji: "🌐" },
];

function getPatternStyle(pattern: string): { bg: string; text: string; icon: string } {
  switch (pattern) {
    case "低开高走": return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", icon: "🔥" };
    case "低开企稳": return { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", icon: "📊" };
    case "低开震荡": return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300", icon: "↔️" };
    case "低开低走": return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", icon: "📉" };
    default: return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500", icon: "" };
  }
}

function getRecoveryScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 50) return "text-orange-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 15) return "text-lime-500";
  return "text-gray-400";
}

function getRecoveryScoreBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/30";
  if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 15) return "bg-lime-500/10 border-lime-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

// ── Module-level client cache ──────────────────────────

interface ClientCacheEntry {
  result: LowOpenResult;
  lastFetchTime: string;
  timestamp: number;
  filters: LowOpenFilters;
}
const CLIENT_CACHE_TTL = 3 * 60 * 1000;
let clientCache: ClientCacheEntry | null = null;

// ── Filter State ───────────────────────────────────────

interface LowOpenFilters {
  sector: string;
  minOpenGap: number;        // e.g. -5 means low open >= 5%
  maxMarketCap: number;       // 亿元, 0=no limit
  minMarketCap: number;       // 亿元, 0=no limit
  includeChiNext: boolean;
  includeSTAR: boolean;
  minTurnover: number;
  maxTurnover: number;
  minVolumeRatio: number;
  sortBy: string;
  limit: number;
}

const DEFAULT_FILTERS: LowOpenFilters = {
  sector: "",
  minOpenGap: -5,
  maxMarketCap: 0,
  minMarketCap: 0,
  includeChiNext: false,
  includeSTAR: false,
  minTurnover: 0,
  maxTurnover: 100,
  minVolumeRatio: 0,
  sortBy: "recoveryScore",
  limit: 50,
};

// ── Component ──────────────────────────────────────────

interface LowOpenScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

export function LowOpenScreener({ onSelectStock }: LowOpenScreenerProps) {
  const [result, setResult] = useState<LowOpenResult | null>(clientCache?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("recoveryScore");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [lastFetchTime, setLastFetchTime] = useState<string>(clientCache?.lastFetchTime ?? "");
  const [isFromCache, setIsFromCache] = useState(!!clientCache);

  // Filter states
  const [filters, setFilters] = useState<LowOpenFilters>(clientCache?.filters ?? DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sectorInput, setSectorInput] = useState(clientCache?.filters.sector ?? "");
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);

  // Watchlist
  const [watchlist, setWatchlist] = useState<ReturnType<typeof loadWatchlist>>([]);

  // Auto-refresh
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  // Load watchlist on mount
  useEffect(() => { setWatchlist(loadWatchlist()); }, []);
  useEffect(() => {
    const handler = () => setWatchlist(loadWatchlist());
    window.addEventListener("screener-watchlist-changed", handler);
    return () => window.removeEventListener("screener-watchlist-changed", handler);
  }, []);

  // Track page visibility
  useEffect(() => {
    const handleVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Auto-refresh during trading hours
  useAutoRefresh(() => {
    if (!loading) fetchData(false);
  }, autoRefreshEnabled && pageVisible);

  // Close sector dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sectorDropdownRef.current && !sectorDropdownRef.current.contains(e.target as Node)) {
        setShowSectorDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = useCallback(async (forceRefresh = false, customFilters?: LowOpenFilters) => {
    const f = customFilters || filters;
    setLoading(true);
    setError(null);
    setIsFromCache(false);
    try {
      const params = new URLSearchParams({
        minOpenGap: String(f.minOpenGap),
        maxMarketCap: String(f.maxMarketCap),
        minMarketCap: String(f.minMarketCap),
        minTurnover: String(f.minTurnover),
        maxTurnover: String(f.maxTurnover),
        minVolumeRatio: String(f.minVolumeRatio),
        sortBy: f.sortBy,
        limit: String(f.limit),
      });
      if (f.sector) params.set("sector", f.sector);
      if (f.includeChiNext) params.set("includeChiNext", "true");
      if (f.includeSTAR) params.set("includeSTAR", "true");
      if (forceRefresh) params.set("refresh", "1");

      const res = await fetch(`/api/stock/low-open?${params}`);
      const data: LowOpenResult = await res.json();

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        setIsFromCache(!!data.cached);
        clientCache = { result: data, lastFetchTime: fetchTime, timestamp: Date.now(), filters: f };
      } else {
        setError(data.error || "查询失败");
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
      setSectorInput(clientCache.filters.sector);
      setIsFromCache(true);
      if (Date.now() - clientCache.timestamp >= CLIENT_CACHE_TTL) {
        fetchData(false, clientCache.filters);
      }
    } else {
      fetchData();
    }
  }, []);

  // Sorted stocks
  const sortedStocks = React.useMemo(() => {
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

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(prev => prev === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortOrder("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortOrder === "desc" ? <ChevronDown className="w-3 h-3 opacity-80" /> : <ChevronUp className="w-3 h-3 opacity-80" />;
  };

  const handleFilterChange = (key: keyof LowOpenFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSectorSelect = (sector: string) => {
    setSectorInput(sector);
    handleFilterChange("sector", sector);
    setShowSectorDropdown(false);
  };

  const handleApplyFilters = () => {
    if (sectorInput.trim() !== filters.sector) {
      const newFilters = { ...filters, sector: sectorInput.trim() };
      setFilters(newFilters);
      fetchData(true, newFilters);
    } else {
      fetchData(true);
    }
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSectorInput("");
  };

  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  const cacheRemaining = React.useMemo(() => {
    if (!clientCache) return 0;
    const elapsed = Date.now() - clientCache.timestamp;
    return Math.max(0, Math.ceil((CLIENT_CACHE_TTL - elapsed) / 1000));
  }, [lastFetchTime, isFromCache]);

  // ── Pattern distribution stats ──
  const patternStats = React.useMemo(() => {
    if (!result?.stocks) return { "低开高走": 0, "低开企稳": 0, "低开震荡": 0, "低开低走": 0 };
    const stats: Record<string, number> = { "低开高走": 0, "低开企稳": 0, "低开震荡": 0, "低开低走": 0 };
    for (const s of result.stocks) {
      if (stats[s.lowOpenPattern] !== undefined) stats[s.lowOpenPattern]++;
      else stats["低开低走"]++;
    }
    return stats;
  }, [result?.stocks]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-500" />
              低开选股
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={autoRefreshEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                      className="h-7 text-xs gap-1 relative"
                    >
                      <Clock className="w-3 h-3" />
                      {autoRefreshEnabled && isTradingHours() && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {autoRefreshEnabled ? "自动刷新已开启" : "自动刷新已关闭"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
          {/* Active Criteria Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <TrendingDown className="w-3 h-3" />
              低开{Math.abs(filters.minOpenGap)}%及以上
            </Badge>
            {filters.sector ? (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                <BarChart3 className="w-3 h-3" />
                {filters.sector}板块
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-300">
                <BarChart3 className="w-3 h-3" />
                全市场
              </Badge>
            )}
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <Target className="w-3 h-3" />
              主板
            </Badge>
            {filters.includeChiNext && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-purple-500/5 border-purple-500/20 text-purple-700 dark:text-purple-300">
                创业板
              </Badge>
            )}
            {filters.includeSTAR && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                科创板
              </Badge>
            )}
            {filters.minTurnover > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                换手{filters.minTurnover}~{filters.maxTurnover}%
              </Badge>
            )}
            {filters.minVolumeRatio > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-teal-500/5 border-teal-500/20 text-teal-700 dark:text-teal-300">
                量比≥{filters.minVolumeRatio}
              </Badge>
            )}
            {filters.maxMarketCap > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                市值≤{filters.maxMarketCap}亿
              </Badge>
            )}
            {filters.minMarketCap > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                市值≥{filters.minMarketCap}亿
              </Badge>
            )}
          </div>

          {/* Pattern Distribution Summary */}
          {result && result.stocks.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs text-muted-foreground">模式分布:</span>
              {Object.entries(patternStats).filter(([, count]) => count > 0).map(([pattern, count]) => {
                const style = getPatternStyle(pattern);
                return (
                  <span key={pattern} className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md border ${style.bg} ${style.text}`}>
                    {style.icon} {pattern} {count}
                  </span>
                );
              })}
            </div>
          )}

          {/* Watchlist */}
          {watchlist.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-500" />自选
              </span>
              {watchlist.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => onSelectStock?.(item.symbol)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border border-yellow-500/20 bg-yellow-500/5 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-500/10 transition-colors"
                >
                  <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
                  {item.name}
                  {item.changePercent !== undefined && (
                    <span className={item.changePercent >= 0 ? "text-red-500" : "text-green-500"}>
                      {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(2)}%
                    </span>
                  )}
                </button>
              ))}
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
            {filtersChanged && !filtersExpanded && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />}
          </button>

          {/* Filter Panel */}
          {filtersExpanded && (
            <div className="mt-3 p-4 rounded-lg border border-border/50 bg-muted/30 space-y-4">
              {/* Row 1: Sector */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">板块关键词（留空=全市场）</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-xs" ref={sectorDropdownRef}>
                    <div className="relative">
                      <Input
                        value={sectorInput}
                        onChange={(e) => { setSectorInput(e.target.value); setShowSectorDropdown(true); }}
                        onFocus={() => setShowSectorDropdown(true)}
                        onKeyDown={(e) => { if (e.key === "Enter") { handleFilterChange("sector", sectorInput.trim()); setShowSectorDropdown(false); } }}
                        placeholder="输入板块名称或留空扫描全市场..."
                        className="h-8 text-xs pr-8"
                      />
                      {sectorInput && (
                        <button onClick={() => { setSectorInput(""); handleFilterChange("sector", ""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {showSectorDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-2 max-h-48 overflow-y-auto">
                        <div className="text-xs text-muted-foreground mb-1.5 px-1">热门板块</div>
                        <div className="flex flex-wrap gap-1">
                          {POPULAR_SECTORS.filter(s => !sectorInput || s.label.includes(sectorInput)).map((s) => (
                            <button
                              key={s.label}
                              onClick={() => handleSectorSelect(s.label)}
                              className={`text-xs px-2 py-1 rounded-md border transition-colors ${filters.sector === s.label ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border hover:bg-muted"}`}
                            >
                              {s.emoji} {s.label}
                            </button>
                          ))}
                          {sectorInput && !POPULAR_SECTORS.some(s => s.label === sectorInput) && (
                            <button
                              onClick={() => handleSectorSelect(sectorInput.trim())}
                              className="text-xs px-2 py-1 rounded-md border border-dashed border-primary/30 text-primary hover:bg-primary/10"
                            >
                              🔍 搜索 &quot;{sectorInput}&quot;
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Low-open gap & Market cap */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最低低开幅度 ({Math.abs(filters.minOpenGap)}% 及以上)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={-10} max={-1} step={0.5}
                      value={[filters.minOpenGap]}
                      onValueChange={([v]) => handleFilterChange("minOpenGap", v)}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.minOpenGap}
                      onChange={(e) => handleFilterChange("minOpenGap", parseFloat(e.target.value) || -5)}
                      className="h-7 text-xs w-20"
                      step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">% (负数，如-5表示低开5%及以上)</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    市值范围 ({filters.minMarketCap}~{filters.maxMarketCap > 0 ? `${filters.maxMarketCap}亿` : "不限"}亿)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.minMarketCap || ""}
                      onChange={(e) => handleFilterChange("minMarketCap", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      placeholder="最小"
                    />
                    <span className="text-xs text-muted-foreground">~</span>
                    <Input
                      type="number"
                      value={filters.maxMarketCap || ""}
                      onChange={(e) => handleFilterChange("maxMarketCap", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      placeholder="不限"
                    />
                    <span className="text-xs text-muted-foreground">亿元</span>
                  </div>
                </div>
              </div>

              {/* Row 3: Board selection & Other filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Target className="w-3 h-3" /> 板块选择
                  </Label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={filters.includeChiNext} onCheckedChange={(v) => handleFilterChange("includeChiNext", v)} />
                      <span className="text-xs">创业板</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Switch checked={filters.includeSTAR} onCheckedChange={(v) => handleFilterChange("includeSTAR", v)} />
                      <span className="text-xs">科创板</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    换手率 ({filters.minTurnover}~{filters.maxTurnover}%)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.minTurnover}
                      onChange={(e) => handleFilterChange("minTurnover", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-16"
                      step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">~</span>
                    <Input
                      type="number"
                      value={filters.maxTurnover}
                      onChange={(e) => handleFilterChange("maxTurnover", parseFloat(e.target.value) || 100)}
                      className="h-7 text-xs w-16"
                      step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最低量比 ({filters.minVolumeRatio})
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.minVolumeRatio}
                      onChange={(e) => handleFilterChange("minVolumeRatio", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      step={0.5}
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Sort & Limit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">排序方式</Label>
                  <Select value={filters.sortBy} onValueChange={(v) => handleFilterChange("sortBy", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recoveryScore">恢复评分优先</SelectItem>
                      <SelectItem value="openGapRate">低开幅度优先</SelectItem>
                      <SelectItem value="recoveryRate">恢复幅度优先</SelectItem>
                      <SelectItem value="changePercent">涨跌幅优先</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">最多显示 ({filters.limit})</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.limit}
                      onChange={(e) => handleFilterChange("limit", parseInt(e.target.value) || 50)}
                      className="h-7 text-xs w-20"
                      min={10} max={200}
                    />
                    <span className="text-xs text-muted-foreground">只</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" onClick={handleApplyFilters} disabled={loading} className="h-8 text-xs gap-1">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  应用筛选
                </Button>
                <Button size="sm" variant="outline" onClick={handleResetFilters} className="h-8 text-xs gap-1">
                  重置
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {error && (
        <Card className="border-destructive/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !result && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      )}

      {result && result.stocks.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                筛选结果: {result.filteredCount} 只低开股票
                {result.sectorName && <span className="text-muted-foreground ml-1">({result.sectorName})</span>}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-10">★</TableHead>
                    <TableHead className="text-xs">代码/名称</TableHead>
                    <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("openGapRate")}>
                      <div className="flex items-center gap-0.5">低开幅度 <SortIcon field="openGapRate" /></div>
                    </TableHead>
                    <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("recoveryRate")}>
                      <div className="flex items-center gap-0.5">恢复幅度 <SortIcon field="recoveryRate" /></div>
                    </TableHead>
                    <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("recoveryScore")}>
                      <div className="flex items-center gap-0.5">恢复评分 <SortIcon field="recoveryScore" /></div>
                    </TableHead>
                    <TableHead className="text-xs">模式</TableHead>
                    <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("changePercent")}>
                      <div className="flex items-center gap-0.5">涨跌幅 <SortIcon field="changePercent" /></div>
                    </TableHead>
                    <TableHead className="text-xs">现价/开盘</TableHead>
                    <TableHead className="text-xs">量比</TableHead>
                    <TableHead className="text-xs">换手</TableHead>
                    <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("marketCap")}>
                      <div className="flex items-center gap-0.5">市值 <SortIcon field="marketCap" /></div>
                    </TableHead>
                    <TableHead className="text-xs">主力净流入</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStocks.map((stock) => {
                    const patternStyle = getPatternStyle(stock.lowOpenPattern);
                    const inWatchlist = isInWatchlist(stock.symbol);
                    return (
                      <TableRow
                        key={stock.symbol}
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => onSelectStock?.(stock.symbol)}
                      >
                        <TableCell className="text-xs py-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              if (inWatchlist) { removeFromWatchlist(stock.symbol); }
                              else { addToWatchlist(stock.symbol, stock.name, "low-open", stock.price, stock.changePercent); }
                              setWatchlist(loadWatchlist());
                            }}
                            className={`p-1 rounded transition-colors ${inWatchlist ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground hover:text-yellow-500"}`}
                          >
                            <Star className="w-3.5 h-3.5" fill={inWatchlist ? "currentColor" : "none"} />
                          </button>
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <div className="font-medium">{stock.symbol}</div>
                          <div className="text-muted-foreground text-[11px] truncate max-w-[80px]">{stock.name}</div>
                          {stock.sectorName && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[80px]">{stock.sectorName}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <span className="font-mono font-semibold text-green-600 dark:text-green-400">
                            {stock.openGapRate.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <span className={`font-mono font-medium ${stock.recoveryRate >= 2 ? "text-red-500" : stock.recoveryRate >= 0 ? "text-orange-500" : "text-green-500"}`}>
                            {stock.recoveryRate >= 0 ? "+" : ""}{stock.recoveryRate.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center justify-center w-10 h-5 rounded-md text-[11px] font-semibold border ${getRecoveryScoreBg(stock.recoveryScore)} ${getRecoveryScoreColor(stock.recoveryScore)}`}>
                                  {stock.recoveryScore}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-xs max-w-xs">
                                {stock.recoveryDetail}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <span className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md border ${patternStyle.bg} ${patternStyle.text}`}>
                            {patternStyle.icon} {stock.lowOpenPattern}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <span className={`font-mono ${stock.changePercent >= 0 ? "text-red-500" : "text-green-500"}`}>
                            {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <div className="font-mono">{stock.price.toFixed(2)}</div>
                          <div className="text-[11px] text-muted-foreground">开 {stock.open.toFixed(2)}</div>
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <span className={`font-mono ${stock.volumeRatio >= 2 ? "text-red-500 font-semibold" : stock.volumeRatio >= 1.5 ? "text-orange-500" : ""}`}>
                            {stock.volumeRatio.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs py-2 font-mono">
                          {stock.turnover.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-xs py-2 font-mono">
                          {formatMarketCap(stock.marketCap)}
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <span className={`font-mono ${stock.mainNetInflow > 0 ? "text-red-500" : stock.mainNetInflow < 0 ? "text-green-500" : ""}`}>
                            {stock.mainNetInflow > 0 ? "+" : ""}{formatAmount(stock.mainNetInflow)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && result.stocks.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <TrendingDown className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {error ? error : "暂无符合条件的低开股票"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              尝试调整低开幅度阈值或切换到全市场扫描
            </p>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="border-border/30 bg-muted/20">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">低开选股</strong>：筛选开盘价低于昨收价一定幅度的股票，分析其恢复潜力。</p>
              <p>• <strong>低开高走</strong>：低开后价格反弹超过2%，恢复潜力最大</p>
              <p>• <strong>低开企稳</strong>：低开后价格小幅回升，趋势待确认</p>
              <p>• <strong>低开震荡</strong>：低开后价格在开盘价附近震荡</p>
              <p>• <strong>低开低走</strong>：低开后价格继续下跌，风险较大</p>
              <p>• 恢复评分综合考虑：反弹幅度、量能配合、主力资金流向、换手率等因素</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
