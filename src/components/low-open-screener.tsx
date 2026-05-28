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
  TrendingUp, Activity, Flame, BookOpen, Info, Shield, Zap, BarChart2, Layers,
  ChevronRight, Gauge, PieChart, Filter, Eye, Plus,
} from "lucide-react";

import {
  formatMarketCap, formatAmount, loadWatchlist, addToWatchlist,
  removeFromWatchlist, isInWatchlist, isTradingHours,
  useAutoSaveScreener, useWatchlistInit,
} from "@/lib/screener-shared";
import { fetchWithSWR, getCachedData, isCacheFresh } from "@/lib/client-cache";

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
  // ── Enhanced Factors ──
  gapFillRate: number;
  supportStrength: number;
  volumeConfirm: number;
  mainForceScore: number;
  valuationSafety: number;
  elasticityScore: number;
  gapDepthScore: number;      // legacy
  turnoverHealth: number;
  compositeScore: number;
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

type SortField = "compositeScore" | "recoveryScore" | "openGapRate" | "recoveryRate" | "changePercent" | "marketCap" | "turnover" | "volumeRatio" | "amplitude";
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

function getCompositeScoreColor(score: number): string {
  if (score >= 70) return "text-rose-600 dark:text-rose-400";
  if (score >= 55) return "text-orange-500";
  if (score >= 40) return "text-amber-500";
  if (score >= 25) return "text-yellow-600 dark:text-yellow-400";
  return "text-gray-400";
}

function getCompositeScoreBg(score: number): string {
  if (score >= 70) return "bg-rose-500/10 border-rose-500/30";
  if (score >= 55) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 40) return "bg-amber-500/10 border-amber-500/30";
  if (score >= 25) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getFactorBarWidth(score: number): string {
  return `${Math.max(4, Math.min(100, score))}%`;
}

function getFactorBarColor(score: number): string {
  if (score >= 70) return "bg-rose-500";
  if (score >= 55) return "bg-orange-500";
  if (score >= 40) return "bg-amber-500";
  if (score >= 25) return "bg-yellow-500";
  return "bg-gray-400";
}

function getSentimentInfo(score: number): { label: string; bgClass: string; textClass: string } {
  if (score >= 70) return { label: "强势", bgClass: "bg-rose-500/10 border-rose-500/30", textClass: "text-rose-600 dark:text-rose-400" };
  if (score >= 50) return { label: "偏多", bgClass: "bg-orange-500/10 border-orange-500/30", textClass: "text-orange-600 dark:text-orange-400" };
  if (score >= 30) return { label: "中性", bgClass: "bg-yellow-500/10 border-yellow-500/30", textClass: "text-yellow-600 dark:text-yellow-400" };
  return { label: "偏空", bgClass: "bg-green-500/10 border-green-500/30", textClass: "text-green-600 dark:text-green-400" };
}

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
  // ── Client-side filters ──
  maxPE: number;              // 0=no limit
  excludeST: boolean;
  minCompositeScore: number;  // 0=no filter
  patternFilter: string;      // ""=no filter
  minMainForceScore: number;  // 0=no filter
}

const DEFAULT_FILTERS: LowOpenFilters = {
  sector: "",
  minOpenGap: -4,
  maxMarketCap: 0,
  minMarketCap: 0,
  includeChiNext: false,
  includeSTAR: false,
  minTurnover: 0,
  maxTurnover: 100,
  minVolumeRatio: 0,
  sortBy: "compositeScore",
  limit: 50,
  maxPE: 0,
  excludeST: false,
  minCompositeScore: 0,
  patternFilter: "",
  minMainForceScore: 0,
};

// ── Preset definitions ──
type PresetKey = "高胜率" | "低开高走" | "放量反弹" | "主力抄底" | "深度低开" | "全市场" | "";

const PRESET_CONFIGS: Record<string, Partial<LowOpenFilters>> = {
  "高胜率": { minOpenGap: -4, minCompositeScore: 60 },
  "低开高走": { patternFilter: "低开高走" },
  "放量反弹": { minVolumeRatio: 1.5 },
  "主力抄底": { minMainForceScore: 60 },
  "深度低开": { minOpenGap: -7 },
  "全市场": {},
};

// ── Component ──────────────────────────────────────────

interface LowOpenScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

const LAST_RESULT_KEY = "low-open-last-result";

// 7 factor definitions for expansion
const FACTOR_DEFS: { key: keyof LowOpenStock; label: string; weight: string }[] = [
  { key: "gapFillRate", label: "缺口回补", weight: "18%" },
  { key: "volumeConfirm", label: "量价确认", weight: "18%" },
  { key: "mainForceScore", label: "主力资金", weight: "15%" },
  { key: "turnoverHealth", label: "换手健康", weight: "15%" },
  { key: "supportStrength", label: "支撑强度", weight: "12%" },
  { key: "elasticityScore", label: "弹性评分", weight: "12%" },
  { key: "valuationSafety", label: "估值安全", weight: "10%" },
];

export const LowOpenScreener = React.memo(function LowOpenScreener({ onSelectStock }: LowOpenScreenerProps) {
  // Initialize from localStorage so last query result shows instantly on mount
  const [result, setResult] = useState<LowOpenResult | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem(LAST_RESULT_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("compositeScore");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [lastFetchTime, setLastFetchTime] = useState<string>("");
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastFetchTimestamp, setLastFetchTimestamp] = useState(0);

  // Filter states
  const [filters, setFilters] = useState<LowOpenFilters>(DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sectorInput, setSectorInput] = useState("");
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);

  // Strategy panel
  const [strategyExpanded, setStrategyExpanded] = useState(false);
  const [strategyTab, setStrategyTab] = useState<string>("策略概览");

  // Preset & expansion states
  const [activePreset, setActivePreset] = useState<PresetKey>("");
  const [expandedStock, setExpandedStock] = useState<string | null>(null);

  // Watchlist
  const [watchlist, setWatchlist] = useState<ReturnType<typeof loadWatchlist>>([]);

  // Auto-refresh state (disabled – 1 hour cache, manual refresh only)

  // Load watchlist on mount (init from DB first)
  useWatchlistInit();
  useEffect(() => { setWatchlist(loadWatchlist()); }, []);
  useEffect(() => {
    const handler = () => setWatchlist(loadWatchlist());
    window.addEventListener("screener-watchlist-changed", handler);
    return () => window.removeEventListener("screener-watchlist-changed", handler);
  }, []);

  // No auto-refresh – 1 hour cache, only refresh on button click

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

  // Helper: build cache key from filters
  const buildCacheKey = useCallback((f: LowOpenFilters) => {
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
    return `low-open:${params.toString()}`;
  }, []);

  const fetchData = useCallback(async (forceRefresh = false, customFilters?: LowOpenFilters) => {
    const f = customFilters || filters;
    const cacheKey = buildCacheKey(f);

    // Check for fresh cached data to avoid loading flash on tab switch
    const cachedResult = getCachedData<LowOpenResult>(cacheKey);
    const hasFreshCache = cachedResult && isCacheFresh(cacheKey, 3_600_000);

    // Only show loading skeleton if there's no cached data to display
    if (!hasFreshCache || forceRefresh) {
      setLoading(true);
    } else {
      // Restore cached data immediately so the UI never blanks out
      setResult(cachedResult);
      setIsFromCache(true);
      setLastFetchTimestamp(Date.now());
    }

    setError(null);
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

      const { data, fromCache } = await fetchWithSWR<LowOpenResult>(
        cacheKey,
        async () => {
          const res = await fetch(`/api/stock/low-open?${params}`);
          if (!res.ok) throw new Error("查询失败");
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
        // Persist to localStorage so next mount shows last result immediately
        try { localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(data)); } catch {}
      } else {
        setError(data.error || "查询失败");
      }
    } catch (e: any) {
      setError(e.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [filters, buildCacheKey]);

  // Auto-fetch on mount: fetchWithSWR returns cached data instantly
  useEffect(() => {
    fetchData();
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

  // Client-side filtered stocks (applied on top of sortedStocks)
  const filteredStocks = React.useMemo(() => {
    let stocks = sortedStocks;
    if (filters.maxPE > 0) {
      stocks = stocks.filter(s => s.pe > 0 && s.pe <= filters.maxPE);
    }
    if (filters.excludeST) {
      stocks = stocks.filter(s => !s.name.includes("ST") && !s.name.includes("*ST"));
    }
    if (filters.minCompositeScore > 0) {
      stocks = stocks.filter(s => s.compositeScore >= filters.minCompositeScore);
    }
    if (filters.patternFilter) {
      stocks = stocks.filter(s => s.lowOpenPattern === filters.patternFilter);
    }
    if (filters.minMainForceScore > 0) {
      stocks = stocks.filter(s => s.mainForceScore >= filters.minMainForceScore);
    }
    return stocks;
  }, [sortedStocks, filters.maxPE, filters.excludeST, filters.minCompositeScore, filters.patternFilter, filters.minMainForceScore]);

  // Auto-save screener results for historical verification (must be after sortedStocks definition)
  useAutoSaveScreener(
    sortedStocks,
    "low_open",
    filters.sector || "全市场",
    filters,
    sortedStocks.length > 0
  );

  // ── Statistics Overview ──
  const statsOverview = React.useMemo(() => {
    if (!result?.stocks || result.stocks.length === 0) return null;
    const stocks = result.stocks;
    const avgComposite = stocks.reduce((s, st) => s + st.compositeScore, 0) / stocks.length;
    const avgRecovery = stocks.reduce((s, st) => s + st.recoveryRate, 0) / stocks.length;
    const highScoreCount = stocks.filter(s => s.compositeScore >= 70).length;
    const patternUpCount = stocks.filter(s => s.lowOpenPattern === "低开高走").length;
    const avgVolumeRatio = stocks.reduce((s, st) => s + st.volumeRatio, 0) / stocks.length;
    return { avgComposite, avgRecovery, highScoreCount, patternUpCount, avgVolumeRatio, totalCount: stocks.length };
  }, [result?.stocks]);

  // ── Sentiment Gauge ──
  const sentimentScore = React.useMemo(() => {
    if (!result?.stocks || result.stocks.length === 0) return 50;
    let total = 0;
    for (const s of result.stocks) {
      switch (s.lowOpenPattern) {
        case "低开高走": total += 2; break;
        case "低开企稳": total += 1; break;
        case "低开震荡": total += 0; break;
        case "低开低走": total -= 2; break;
      }
    }
    const raw = (total / (result.stocks.length * 2)) * 100;
    return Math.max(0, Math.min(100, 50 + raw / 2));
  }, [result?.stocks]);

  // ── Sector Distribution ──
  const sectorDistribution = React.useMemo(() => {
    if (!result?.stocks) return [];
    const map: Record<string, number> = {};
    for (const s of result.stocks) {
      const sector = s.sectorName || "未分类";
      map[sector] = (map[sector] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [result?.stocks]);

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
    setActivePreset("");
  };

  const handlePresetClick = (preset: PresetKey) => {
    if (preset === activePreset) {
      // Deactivate preset
      setActivePreset("");
      const resetFilters = { ...filters };
      // Reset preset-specific client-side filters
      resetFilters.minCompositeScore = 0;
      resetFilters.patternFilter = "";
      resetFilters.minMainForceScore = 0;
      setFilters(resetFilters);
      return;
    }
    setActivePreset(preset);

    if (preset === "全市场") {
      setFilters(DEFAULT_FILTERS);
      setSectorInput("");
      fetchData(true, DEFAULT_FILTERS);
      return;
    }

    const config = PRESET_CONFIGS[preset];
    const newFilters = { ...DEFAULT_FILTERS, ...config };
    setFilters(newFilters);
    setSectorInput("");

    // If preset changes API-level filters (minOpenGap, minVolumeRatio), need to re-fetch
    if (config.minOpenGap !== undefined || config.minVolumeRatio !== undefined) {
      fetchData(true, newFilters);
    }
  };

  const filtersChanged = useMemo(() => {
    return JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  }, [filters]);

  const cacheRemaining = useMemo(() => {
    if (!lastFetchTimestamp) return 0;
    const elapsed = Date.now() - lastFetchTimestamp;
    return Math.max(0, Math.ceil((180_000 - elapsed) / 1000));
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
            {filters.maxPE > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
                PE≤{filters.maxPE}
              </Badge>
            )}
            {filters.excludeST && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300">
                排除ST
              </Badge>
            )}
            {filters.minCompositeScore > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-300">
                胜率≥{filters.minCompositeScore}
              </Badge>
            )}
            {filters.patternFilter && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300">
                {filters.patternFilter}
              </Badge>
            )}
            {filters.minMainForceScore > 0 && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-orange-500/5 border-orange-500/20 text-orange-700 dark:text-orange-300">
                主力≥{filters.minMainForceScore}
              </Badge>
            )}
          </div>

          {/* Quick Filter Presets */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Filter className="w-3 h-3" />快捷:
            </span>
            {(["高胜率", "低开高走", "放量反弹", "主力抄底", "深度低开", "全市场"] as PresetKey[]).map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  activePreset === preset
                    ? "bg-primary/10 border-primary/30 text-primary font-medium"
                    : "bg-background border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {preset}
              </button>
            ))}
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
                      {item.changePercent >= 0 ? "+" : ""}{(item.changePercent ?? 0).toFixed(2)}%
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
                      <SelectItem value="compositeScore">综合胜率优先</SelectItem>
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

              {/* Row 5: PE & ST filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最大PE ({filters.maxPE > 0 ? `≤${filters.maxPE}` : "不限"})
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.maxPE || ""}
                      onChange={(e) => handleFilterChange("maxPE", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                      placeholder="不限"
                      min={0}
                    />
                    <span className="text-xs text-muted-foreground">0=不限, 排除高估值</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> 排除ST
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={filters.excludeST} onCheckedChange={(v) => handleFilterChange("excludeST", v)} />
                    <span className="text-xs">排除ST/*ST股票</span>
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

      {/* Statistical Overview Card */}
      {statsOverview && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {/* Avg Composite Score */}
              <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/30">
                <Gauge className="w-4 h-4 text-muted-foreground" />
                <span className={`text-lg font-bold ${getCompositeScoreColor(statsOverview.avgComposite)}`}>
                  {(statsOverview.avgComposite ?? 0).toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground">平均胜率</span>
              </div>
              {/* Avg Recovery Rate */}
              <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/30">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span className={`text-lg font-bold ${statsOverview.avgRecovery >= 2 ? "text-red-500" : statsOverview.avgRecovery >= 0 ? "text-orange-500" : "text-green-500"}`}>
                  {statsOverview.avgRecovery >= 0 ? "+" : ""}{(statsOverview.avgRecovery ?? 0).toFixed(2)}%
                </span>
                <span className="text-[10px] text-muted-foreground">平均恢复</span>
              </div>
              {/* High Score Count */}
              <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/30">
                <Flame className="w-4 h-4 text-rose-500" />
                <span className="text-lg font-bold text-rose-600 dark:text-rose-400">{statsOverview.highScoreCount}</span>
                <span className="text-[10px] text-muted-foreground">高胜率(≥70)</span>
              </div>
              {/* Low Open Up Count */}
              <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/30">
                <Activity className="w-4 h-4 text-red-500" />
                <span className="text-lg font-bold text-red-600 dark:text-red-400">{statsOverview.patternUpCount}</span>
                <span className="text-[10px] text-muted-foreground">低开高走</span>
              </div>
              {/* Avg Volume Ratio */}
              <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/30">
                <BarChart2 className="w-4 h-4 text-muted-foreground" />
                <span className={`text-lg font-bold ${statsOverview.avgVolumeRatio >= 2 ? "text-red-500" : statsOverview.avgVolumeRatio >= 1.5 ? "text-orange-500" : ""}`}>
                  {(statsOverview.avgVolumeRatio ?? 0).toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground">平均量比</span>
              </div>
              {/* Sentiment Gauge */}
              <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/30">
                <PieChart className="w-4 h-4 text-muted-foreground" />
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-md border ${getSentimentInfo(sentimentScore).bgClass} ${getSentimentInfo(sentimentScore).textClass}`}>
                  {getSentimentInfo(sentimentScore).label}
                </span>
                <span className="text-[10px] text-muted-foreground">市场情绪</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sector Distribution Panel */}
      {sectorDistribution.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              板块分布 (Top {sectorDistribution.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {sectorDistribution.map(([sector, count]) => {
                const maxCount = sectorDistribution[0]?.[1] || 1;
                const widthPercent = Math.max(4, (count / maxCount) * 100);
                return (
                  <div key={sector} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-20 truncate shrink-0" title={sector}>{sector}</span>
                    <div className="flex-1 h-4 bg-muted/50 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all ${count === sectorDistribution[0]?.[1] ? "bg-rose-500/60" : count >= maxCount * 0.6 ? "bg-orange-500/50" : "bg-amber-500/40"}`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground w-8 text-right shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      
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
                筛选结果: {filteredStocks.length} 只低开股票
                {filteredStocks.length !== result.filteredCount && (
                  <span className="text-muted-foreground ml-1">(共{result.filteredCount}只, 筛选后{filteredStocks.length}只)</span>
                )}
                {result.sectorName && <span className="text-muted-foreground ml-1">({result.sectorName})</span>}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-8"></TableHead>
                    <TableHead className="text-xs w-10">★</TableHead>
                    <TableHead className="text-xs">代码/名称</TableHead>
                    <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("compositeScore")}>
                      <div className="flex items-center gap-0.5">综合胜率 <SortIcon field="compositeScore" /></div>
                    </TableHead>
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
                  {filteredStocks.map((stock) => {
                    const patternStyle = getPatternStyle(stock.lowOpenPattern);
                    const inWatchlist = isInWatchlist(stock.symbol);
                    const isExpanded = expandedStock === stock.symbol;
                    return (
                      <React.Fragment key={stock.symbol}>
                        <TableRow
                          className={`cursor-pointer hover:bg-accent/50 transition-colors ${isExpanded ? "bg-accent/30" : ""}`}
                          onClick={() => onSelectStock?.(stock.symbol)}
                        >
                          {/* Expand toggle */}
                          <TableCell className="text-xs py-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setExpandedStock(isExpanded ? null : stock.symbol)}
                              className="p-0.5 rounded transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </button>
                          </TableCell>
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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`inline-flex items-center justify-center w-11 h-6 rounded-md text-[11px] font-bold border cursor-default ${getCompositeScoreBg(stock.compositeScore)} ${getCompositeScoreColor(stock.compositeScore)}`}>
                                    {stock.compositeScore}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs max-w-[280px] p-2">
                                  <div className="font-semibold mb-1.5 text-foreground">因子分解 (综合 {stock.compositeScore})</div>
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="w-20 text-muted-foreground shrink-0">缺口回补</span>
                                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${getFactorBarColor(stock.gapFillRate)}`} style={{ width: getFactorBarWidth(Math.max(0, stock.gapFillRate)) }} />
                                      </div>
                                      <span className="w-10 text-right font-mono">{stock.gapFillRate}%</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="w-20 text-muted-foreground shrink-0">量价确认</span>
                                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${getFactorBarColor(stock.volumeConfirm)}`} style={{ width: getFactorBarWidth(stock.volumeConfirm) }} />
                                      </div>
                                      <span className="w-10 text-right font-mono">{stock.volumeConfirm}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="w-20 text-muted-foreground shrink-0">主力资金</span>
                                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${getFactorBarColor(stock.mainForceScore)}`} style={{ width: getFactorBarWidth(stock.mainForceScore) }} />
                                      </div>
                                      <span className="w-10 text-right font-mono">{stock.mainForceScore}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="w-20 text-muted-foreground shrink-0">换手健康</span>
                                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${getFactorBarColor(stock.turnoverHealth)}`} style={{ width: getFactorBarWidth(stock.turnoverHealth) }} />
                                      </div>
                                      <span className="w-10 text-right font-mono">{stock.turnoverHealth}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="w-20 text-muted-foreground shrink-0">支撑强度</span>
                                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${getFactorBarColor(stock.supportStrength)}`} style={{ width: getFactorBarWidth(stock.supportStrength) }} />
                                      </div>
                                      <span className="w-10 text-right font-mono">{stock.supportStrength}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="w-20 text-muted-foreground shrink-0">弹性评分</span>
                                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${getFactorBarColor(stock.elasticityScore)}`} style={{ width: getFactorBarWidth(stock.elasticityScore) }} />
                                      </div>
                                      <span className="w-10 text-right font-mono">{stock.elasticityScore}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="w-20 text-muted-foreground shrink-0">估值安全</span>
                                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${getFactorBarColor(stock.valuationSafety)}`} style={{ width: getFactorBarWidth(stock.valuationSafety) }} />
                                      </div>
                                      <span className="w-10 text-right font-mono">{stock.valuationSafety}</span>
                                    </div>
                                  </div>
                                  <div className="mt-1.5 pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                                    权重: 回补18% + 量价18% + 主力15% + 换手15% + 支撑12% + 弹性12% + 估值10%
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell className="text-xs py-2">
                            <span className="font-mono font-semibold text-green-600 dark:text-green-400">
                              {(stock.openGapRate ?? 0).toFixed(2)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-xs py-2">
                            <span className={`font-mono font-medium ${stock.recoveryRate >= 2 ? "text-red-500" : stock.recoveryRate >= 0 ? "text-orange-500" : "text-green-500"}`}>
                              {stock.recoveryRate >= 0 ? "+" : ""}{(stock.recoveryRate ?? 0).toFixed(2)}%
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
                              {stock.changePercent >= 0 ? "+" : ""}{(stock.changePercent ?? 0).toFixed(2)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-xs py-2">
                            <div className="font-mono">{(stock.price ?? 0).toFixed(2)}</div>
                            <div className="text-[11px] text-muted-foreground">开 {(stock.open ?? 0).toFixed(2)}</div>
                          </TableCell>
                          <TableCell className="text-xs py-2">
                            <span className={`font-mono ${stock.volumeRatio >= 2 ? "text-red-500 font-semibold" : stock.volumeRatio >= 1.5 ? "text-orange-500" : ""}`}>
                              {(stock.volumeRatio ?? 0).toFixed(1)}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs py-2 font-mono">
                            {(stock.turnover ?? 0).toFixed(1)}%
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
                        {/* Expanded Detail Row */}
                        {isExpanded && (
                          <TableRow className="bg-accent/20 hover:bg-accent/20">
                            <TableCell colSpan={14} className="p-4">
                              <div className="space-y-3">
                                {/* Factor progress bars in 2-column grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                                  {FACTOR_DEFS.map(({ key, label, weight }) => {
                                    const val = stock[key] as number;
                                    return (
                                      <div key={key} className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground w-20 shrink-0">{label} <span className="text-[10px] opacity-60">({weight})</span></span>
                                        <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all ${getFactorBarColor(val)}`}
                                            style={{ width: getFactorBarWidth(Math.max(0, val)) }}
                                          />
                                        </div>
                                        <span className={`text-xs font-mono font-medium w-10 text-right ${getCompositeScoreColor(val)}`}>{val}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Recovery detail & action buttons */}
                                <div className="flex items-center justify-between gap-4 pt-1 border-t border-border/30">
                                  <span className="text-[11px] text-muted-foreground">
                                    {stock.recoveryDetail}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs gap-1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isInWatchlist(stock.symbol)) {
                                          addToWatchlist(stock.symbol, stock.name, "low-open", stock.price, stock.changePercent);
                                          setWatchlist(loadWatchlist());
                                        }
                                      }}
                                    >
                                      <Plus className="w-3 h-3" />
                                      加入自选
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs gap-1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectStock?.(stock.symbol);
                                      }}
                                    >
                                      <Eye className="w-3 h-3" />
                                      查看详情
                                    </Button>
                                  </div>
                                </div>
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
      )}

      {result && result.stocks.length > 0 && filteredStocks.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Filter className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              客户端筛选后无匹配结果
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              尝试调整PE、ST或胜率等客户端筛选条件
            </p>
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
              <p>• <strong>低开高走</strong>：低开后价格反弹超过3%，恢复潜力最大</p>
              <p>• <strong>低开企稳</strong>：低开后价格回升1-3%，趋势待确认</p>
              <p>• <strong>低开震荡</strong>：低开后价格在开盘价附近震荡</p>
              <p>• <strong>低开低走</strong>：低开后价格继续下跌，风险较大</p>
              <p>• <strong className="text-foreground">综合胜率</strong>：7因子加权评分，悬停查看因子分解，点击行展开查看详情</p>
              <p className="text-[11px]">缺口回补18% + 量价确认18% + 主力资金15% + 换手健康15% + 支撑强度12% + 弹性评分12% + 估值安全10%</p>
            </div>
          </div>
        </CardContent>
      </Card>

{/* Strategy Panel */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2">
          <button
            onClick={() => setStrategyExpanded(!strategyExpanded)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-500" />
              低开选股策略说明
            </CardTitle>
            {strategyExpanded ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground" /> : <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {strategyExpanded && (
          <CardContent className="pt-0 space-y-4">
            {/* Tab Navigation */}
            <div className="flex items-center gap-1 border-b border-border/50 pb-0">
              {([
                { key: "策略概览", icon: Zap, color: "text-amber-500" },
                { key: "七大因子", icon: Layers, color: "text-rose-500" },
                { key: "买入逻辑", icon: TrendingUp, color: "text-emerald-500" },
                { key: "实战要点", icon: Activity, color: "text-orange-500" },
                { key: "风险提示", icon: AlertCircle, color: "text-red-500" },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStrategyTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
                    strategyTab === tab.key
                      ? "border-primary text-primary font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <tab.icon className={`w-3.5 h-3.5 ${strategyTab === tab.key ? tab.color : ""}`} />
                  {tab.key}
                </button>
              ))}
            </div>

            {/* Tab: 策略概览 */}
            {strategyTab === "策略概览" && (
              <div className="space-y-4">
                {/* 核心策略逻辑 */}
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">核心策略逻辑</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    低开选股的核心逻辑：<strong className="text-foreground">低开是恐慌性抛售造成的短期价格偏离</strong>，当市场情绪修复时，价格有向均值回归的趋势。
                    低开高走的股票往往具备以下特征：有主力资金承接、放量确认、换手健康、估值安全。
                    综合胜率分通过7个因子加权计算，帮助快速筛选出低开后大概率恢复的标的。v2版本优化了权重分配，新增换手健康因子替代缺口深度。
                  </p>
                </div>

                {/* 综合胜率分 */}
                <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Shield className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">综合胜率分 = 七因子加权求和</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
                    <p>综合胜率 = 缺口回补×18% + 量价确认×18% + 主力资金×15% + 换手健康×15% + 支撑强度×12% + 弹性评分×12% + 估值安全×10%</p>
                    <p className="text-foreground font-medium mt-1.5">分数解读：</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                      <span className="text-rose-500 font-medium">70分以上：强势反弹信号</span>
                      <span>多个因子共振，低开高走概率极高</span>
                      <span className="text-orange-500 font-medium">55-70分：较好反弹机会</span>
                      <span>部分因子偏弱，需结合板块趋势判断</span>
                      <span className="text-amber-500 font-medium">40-55分：一般性机会</span>
                      <span>恢复力度有限，需谨慎参与</span>
                      <span className="text-yellow-600 dark:text-yellow-400 font-medium">25-40分：偏弱</span>
                      <span>低开后恢复困难，不建议追入</span>
                      <span className="text-gray-400 font-medium">25分以下：弱势</span>
                      <span>可能存在利空，远离为宜</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: 七大因子 */}
            {strategyTab === "七大因子" && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-xs font-semibold">七大因子详解（综合胜率 = 加权求和）</span>
                </div>

                {/* 因子1: 缺口回补率 */}
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">1</span>
                      <span className="text-xs font-semibold">缺口回补率 (权重18%)</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-300">核心因子</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">计算方式：</strong>(现价 - 开盘价) / (昨收 - 开盘价) x 100%
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">含义：</strong>衡量低开缺口被回补的程度。100%表示完全回补缺口（价格回到昨收），&gt;100%表示超额回补，&lt;0%表示缺口扩大。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">使用要点：</strong>缺口回补率越高，说明低开后的恢复力度越强。关注&gt;50%的标的，这是多头力量积极反击的信号。
                  </p>
                </div>

                {/* 因子2: 量价确认 */}
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">2</span>
                      <span className="text-xs font-semibold">量价确认分 (权重18%)</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-300">核心因子</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">计算方式：</strong>综合量比+反弹力度+成交额三维度精细打分(0-100)，强反弹与弱反弹分档计算
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">含义：</strong>&quot;低开+放量+反弹&quot;是最经典的量价配合形态。量比&gt;1.5且价格反弹，说明有真实资金在低开价位承接，反弹可靠性高。大额成交额外加成。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">使用要点：</strong>量价确认分&gt;70的标的值得关注。缩量反弹(量比&lt;1)的可靠性较低，可能是技术性反抽而非趋势性恢复。
                  </p>
                </div>

                {/* 因子3: 主力资金分 */}
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20">3</span>
                      <span className="text-xs font-semibold">主力资金分 (权重15%)</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">计算方式：</strong>基于主力净流入/成交额比例，使用平方根缩放换算为0-100分。50为中性，&gt;50为净流入，&lt;50为净流出。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">含义：</strong>主力资金是低开反弹的核心驱动力。低开时主力大举买入，说明机构认为低开是错杀，有意识地逢低建仓。平方根缩放使小幅流入也有区分度。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">使用要点：</strong>主力资金分&gt;70是强信号，说明大资金在积极承接。如果主力大幅流出（&lt;30），即使反弹也可能是散户拉抬，持续性差。
                  </p>
                </div>

                {/* 因子4: 换手健康度 */}
                <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">4</span>
                      <span className="text-xs font-semibold">换手健康度 (权重15%)</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-300">v2新增</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">计算方式：</strong>基于换手率分段打分。2-8%为最佳区间(85-95分)，1-2%偏低(50分)，8-12%可接受(75分)，&gt;20%投机过热(30分以下)。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">含义：</strong>换手率反映市场交易活跃度和多空分歧程度。适中换手=交易活跃但分歧不大，低开后更容易形成一致预期向上。过高换手=多空激烈博弈，方向不确定。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">使用要点：</strong>换手健康度&gt;80的标的（换手2-8%），低开后恢复概率最高。换手&gt;20%的标的即使反弹也可能剧烈波动，风险较大。换手适中+放量=量价齐升加成。
                  </p>
                </div>

                {/* 因子5: 支撑强度 */}
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20">5</span>
                      <span className="text-xs font-semibold">支撑强度 (权重12%)</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">计算方式：</strong>(现价 - 最低价) / (最高价 - 最低价) x 100%
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">含义：</strong>当前价格在日内振幅区间中的位置。80%以上表示价格在高位运行，支撑强劲；20%以下表示价格在低位徘徊，支撑较弱。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">使用要点：</strong>支撑强度&gt;60的股票说明低开后已被买盘推至日内高位，多头主导。配合缺口回补率一起看，效果更佳。
                  </p>
                </div>

                {/* 因子6: 弹性评分 */}
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">6</span>
                      <span className="text-xs font-semibold">弹性评分 (权重12%)</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">计算方式：</strong>综合恢复幅度+振幅+上影线+下影线四维度。恢复幅度贡献基础分，大振幅+反弹加成，无/短上影线（涨得稳）加分，有下影线（低位反弹）加分。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">含义：</strong>弹性衡量股价从低位弹回的能力。振幅大且恢复强=弹性好；长上影线说明冲高回落，弹性打折；下影线说明低位有支撑，弹性加成。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">使用要点：</strong>弹性评分&gt;40的股票说明具备较强的反弹能力。关注&quot;无上影线+大振幅+反弹+下影线支撑&quot;的组合，这种股票日内恢复最为坚决。
                  </p>
                </div>

                {/* 因子7: 估值安全分 */}
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">7</span>
                      <span className="text-xs font-semibold">估值安全分 (权重10%)</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">计算方式：</strong>基于PE估值水平线性过渡打分。PE≤10→95分(极低估值)，10-20→80-90，20-35→60-80，35-50→40-60，50-80→20-40，&gt;150→8分，亏损→10分。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                    <strong className="text-foreground">含义：</strong>估值越低，安全边际越高。低开时如果估值本身较低，说明价格进一步下跌的空间有限，反弹概率更高。v2采用线性过渡避免分数跳变。
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">使用要点：</strong>估值安全分&gt;70的标的（PE&lt;30），低开后恢复的概率显著高于高估值标的。高PE股票低开可能是价值回归，需谨慎。
                  </p>
                </div>
              </div>
            )}

            {/* Tab: 买入逻辑 */}
            {strategyTab === "买入逻辑" && (
              <div className="space-y-4">
                {/* 买入前提条件 */}
                <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Shield className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">买入前提条件（必须同时满足）</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">✓</span>
                      <div>
                        <span className="text-foreground font-medium">综合胜率分 ≥ 55</span>
                        <p>低于55分的标的恢复概率不高，不值得冒险。55分以上意味着至少3个以上因子偏强，反弹有实质性支撑。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">✓</span>
                      <div>
                        <span className="text-foreground font-medium">非ST/退市风险股</span>
                        <p>ST股基本面恶化，低开可能不是错杀而是价值回归。这类风险无法通过技术分析化解，坚决回避。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">✓</span>
                      <div>
                        <span className="text-foreground font-medium">低开幅度在 -3% ~ -9% 之间</span>
                        <p>-3%以下空间太小做T无利润；-9%以上可能有重大利空，即使反弹也可能是&quot;死猫跳&quot;。最佳区间为 -4% ~ -7%。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">✓</span>
                      <div>
                        <span className="text-foreground font-medium">大盘非暴跌行情</span>
                        <p>大盘跌幅&gt;2%时，低开反弹成功率大幅下降。系统性风险下所有技术分析失效，等待大盘企稳再参与。</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 四种低开模式的买入策略 */}
                <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">四种低开模式的买入策略</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-3">
                    {/* 低开高走 */}
                    <div className="p-2.5 rounded-md border border-rose-500/10 bg-rose-500/5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-base">🔥</span>
                        <span className="text-rose-600 dark:text-rose-400 font-semibold text-xs">低开高走 — 最佳买入时机</span>
                      </div>
                      <div className="space-y-1.5">
                        <p><strong className="text-foreground">识别特征：</strong>开盘低于昨收，盘中持续上行，现价已高于开盘价3%以上，缺口回补率&gt;50%。</p>
                        <p><strong className="text-foreground">买入时机：</strong>确认分时线突破开盘价后回踩不破时可买入。最佳入场点为开盘后15-30分钟确认趋势后。</p>
                        <p><strong className="text-foreground">仓位建议：</strong>可相对积极，仓位可放到总资金的30-40%。</p>
                        <p><strong className="text-foreground">止盈目标：</strong>第一目标看缺口完全回补（回到昨收价），第二目标看涨幅1-2%。</p>
                        <p><strong className="text-foreground">关键确认：</strong>量比&gt;1.5 + 主力资金分&gt;60 + 支撑强度&gt;50，三条件满足越多越可靠。</p>
                      </div>
                    </div>

                    {/* 低开企稳 */}
                    <div className="p-2.5 rounded-md border border-orange-500/10 bg-orange-500/5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-base">📊</span>
                        <span className="text-orange-600 dark:text-orange-400 font-semibold text-xs">低开企稳 — 谨慎买入</span>
                      </div>
                      <div className="space-y-1.5">
                        <p><strong className="text-foreground">识别特征：</strong>开盘低开后，价格在开盘价附近横盘整理，波动不大，未继续下跌也未明显反弹。</p>
                        <p><strong className="text-foreground">买入时机：</strong>等待分时线放量突破横盘区间上沿时介入。不要在横盘期间提前买入，方向未明。</p>
                        <p><strong className="text-foreground">仓位建议：</strong>轻仓试探，仓位控制在总资金的15-20%。</p>
                        <p><strong className="text-foreground">止盈目标：</strong>回到昨收价附近即可考虑止盈。</p>
                        <p><strong className="text-foreground">关键确认：</strong>横盘期间量能萎缩+突破时放量=真突破。若横盘后放量下跌则放弃。</p>
                      </div>
                    </div>

                    {/* 低开震荡 */}
                    <div className="p-2.5 rounded-md border border-yellow-500/10 bg-yellow-500/5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-base">↔️</span>
                        <span className="text-yellow-600 dark:text-yellow-400 font-semibold text-xs">低开震荡 — 观望为主</span>
                      </div>
                      <div className="space-y-1.5">
                        <p><strong className="text-foreground">识别特征：</strong>低开后价格上下波动，没有明确的趋势方向，振幅较大但始终围绕某个价位震荡。</p>
                        <p><strong className="text-foreground">买入时机：</strong>不建议主动买入。如参与，仅在震荡区间下沿获得支撑且出现放量反弹信号时小仓位介入。</p>
                        <p><strong className="text-foreground">仓位建议：</strong>极轻仓，不超过总资金的10%。</p>
                        <p><strong className="text-foreground">止盈止损：</strong>严格止损，跌破震荡区间下沿立即出局。止盈设在震荡区间上沿。</p>
                        <p><strong className="text-foreground">关键确认：</strong>换手率&gt;5%且主力资金分&lt;40的震荡股应放弃，说明多空分歧大且主力未介入。</p>
                      </div>
                    </div>

                    {/* 低开低走 */}
                    <div className="p-2.5 rounded-md border border-green-500/10 bg-green-500/5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-base">📉</span>
                        <span className="text-green-600 dark:text-green-400 font-semibold text-xs">低开低走 — 坚决回避</span>
                      </div>
                      <div className="space-y-1.5">
                        <p><strong className="text-foreground">识别特征：</strong>开盘低开后持续走低，盘中反弹无力，缺口不断扩大，现价远低于开盘价。</p>
                        <p><strong className="text-foreground">买入时机：</strong>不买入！无论胜率分多高，低开低走模式都是最危险的信号。</p>
                        <p><strong className="text-foreground">原因分析：</strong>低开低走通常意味着存在未公开利空、机构集体出货、或技术面严重破位。不要试图抄底，接飞刀的代价极高。</p>
                        <p><strong className="text-foreground">特殊情况：</strong>仅在尾盘14:30后出现急剧缩量企稳+主力资金大幅流入时，可关注次日可能反弹，但不建议当日买入。</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 买入时间窗口 */}
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">买入时间窗口详解</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2.5">
                    <div className="p-2 rounded-md border border-rose-500/10 bg-rose-500/5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">9:25-9:35 集合竞价观察期</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 bg-rose-500/5 border-rose-500/20 text-rose-500">最重要</Badge>
                      </div>
                      <p>不要在开盘第一分钟就冲进去！集合竞价只能看到开盘价，无法判断盘中趋势。观察前5-10分钟的走势，确认低开后是否开始反弹。如果开盘后立刻拉升，不要追高，等待回踩确认。</p>
                    </div>
                    <div className="p-2 rounded-md border border-orange-500/10 bg-orange-500/5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-orange-600 dark:text-orange-400 font-semibold text-[11px]">9:35-10:00 确认入场期</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 bg-orange-500/5 border-orange-500/20 text-orange-500">最佳窗口</Badge>
                      </div>
                      <p>开盘15分钟后趋势初步明朗，这是最佳入场窗口。如果此时分时线站稳在开盘价上方+量能放大，说明低开高走概率大，可择机买入。突破后回踩不破开盘价=最佳买入点。</p>
                    </div>
                    <div className="p-2 rounded-md border border-amber-500/10 bg-amber-500/5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px]">10:00-11:30 二次确认期</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 bg-amber-500/5 border-amber-500/20 text-amber-500">可入场</Badge>
                      </div>
                      <p>如果上午走势持续向好，缺口持续回补，此时仍可入场。但要注意入场价位可能已经远离低点，利润空间变小。建议仅对胜率分&gt;65的标的在此窗口入场。</p>
                    </div>
                    <div className="p-2 rounded-md border border-yellow-500/10 bg-yellow-500/5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-yellow-600 dark:text-yellow-400 font-semibold text-[11px]">13:00-14:00 午后观察期</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 bg-yellow-500/5 border-yellow-500/20 text-yellow-500">谨慎</Badge>
                      </div>
                      <p>午后开盘可能出现方向变化。如果上午反弹强势午后回调到支撑位，可二次加仓。如果上午弱势午后继续下跌，坚决不抄底。午后入场需更严格的止盈止损。</p>
                    </div>
                    <div className="p-2 rounded-md border border-gray-500/10 bg-gray-500/5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-600 dark:text-gray-400 font-semibold text-[11px]">14:00-15:00 尾盘期</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 bg-gray-500/5 border-gray-500/20 text-gray-500">不推荐</Badge>
                      </div>
                      <p>尾盘买入做T的空间非常有限，且面临次日开盘的不确定性。除非是为次日做布局，否则不建议尾盘新开仓位。如果已持仓，14:30前应完成止盈或止损操作。</p>
                    </div>
                  </div>
                </div>

                {/* 买入检查清单 */}
                <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">买入前检查清单（逐条确认）</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">1</span>
                      <span>综合胜率分是否 ≥ 55？如 ≥ 70则可加仓</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">2</span>
                      <span>缺口回补率是否 &gt; 30%？越高越好</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">3</span>
                      <span>量比是否 &gt; 1.0？放量反弹才可靠</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">4</span>
                      <span>主力资金是否净流入？主力分 &gt; 50 为佳</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">5</span>
                      <span>是否为低开高走或低开企稳模式？低开低走坚决不买</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">6</span>
                      <span>当前是否在9:35-14:00的合适时间窗口内？</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">7</span>
                      <span>大盘是否非暴跌（跌幅 &lt; 2%）？大盘暴跌时不参与</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">8</span>
                      <span>是否已设好止盈止损位？止损-2%，止盈看缺口回补</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">9</span>
                      <span>仓位是否合理？单只股票不超过总资金40%</span>
                    </div>
                  </div>
                </div>

                {/* 止盈止损策略 */}
                <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Target className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs font-semibold text-red-700 dark:text-red-300">止盈止损策略</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-md border border-emerald-500/10 bg-emerald-500/5">
                        <div className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] mb-1.5">止盈策略</div>
                        <div className="space-y-1">
                          <p><strong className="text-foreground">保守止盈：</strong>回到昨收价（缺口100%回补）即止盈50%仓位</p>
                          <p><strong className="text-foreground">积极止盈：</strong>等涨幅到1-2%再止盈，适合胜率分&gt;70且量能持续的标的</p>
                          <p><strong className="text-foreground">移动止盈：</strong>盈利&gt;1%后，回撤0.5%即止盈，保护利润</p>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-md border border-red-500/10 bg-red-500/5">
                        <div className="text-red-600 dark:text-red-400 font-semibold text-[11px] mb-1.5">止损策略</div>
                        <div className="space-y-1">
                          <p><strong className="text-foreground">硬止损：</strong>买入后跌幅达到-2%无条件止损，不抱幻想</p>
                          <p><strong className="text-foreground">技术止损：</strong>跌破日内分时低点且量能放大，立即止损</p>
                          <p><strong className="text-foreground">时间止损：</strong>买入后30分钟内无反弹迹象，止损出局</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 rounded-md border border-amber-500/10 bg-amber-500/5">
                      <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px]">铁律：</span>
                      <span>做T操作的盈亏比至少要达到2:1。即每笔交易预期盈利2%以上，才值得承担1%的亏损风险。如果预期盈利不足1%，不参与。</span>
                    </div>
                  </div>
                </div>

                {/* 仓位管理 */}
                <div className="p-3 rounded-lg border border-teal-500/20 bg-teal-500/5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <PieChart className="w-3.5 h-3.5 text-teal-500" />
                    <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">仓位管理规则</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="border-b border-teal-500/10">
                            <th className="text-left py-1.5 px-2 text-teal-600 dark:text-teal-400 font-semibold">胜率分区间</th>
                            <th className="text-left py-1.5 px-2 text-teal-600 dark:text-teal-400 font-semibold">建议仓位</th>
                            <th className="text-left py-1.5 px-2 text-teal-600 dark:text-teal-400 font-semibold">策略</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border/30">
                            <td className="py-1.5 px-2 text-rose-500 font-medium">70分以上</td>
                            <td className="py-1.5 px-2">30-40%</td>
                            <td className="py-1.5 px-2">多因子共振，可重仓做T</td>
                          </tr>
                          <tr className="border-b border-border/30">
                            <td className="py-1.5 px-2 text-orange-500 font-medium">55-70分</td>
                            <td className="py-1.5 px-2">20-30%</td>
                            <td className="py-1.5 px-2">部分因子偏强，适度参与</td>
                          </tr>
                          <tr className="border-b border-border/30">
                            <td className="py-1.5 px-2 text-amber-500 font-medium">40-55分</td>
                            <td className="py-1.5 px-2">10-15%</td>
                            <td className="py-1.5 px-2">轻仓试探，快进快出</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 px-2 text-gray-400 font-medium">40分以下</td>
                            <td className="py-1.5 px-2">0%</td>
                            <td className="py-1.5 px-2">不参与，等待更好机会</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="p-2 rounded-md border border-amber-500/10 bg-amber-500/5 mt-2">
                      <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px]">分批建仓原则：</span>
                      <span>不要一次性满仓买入。建议分2-3批：第一笔确认趋势（50%仓位），第二笔回踩确认后加仓（30%仓位），第三笔突破后追仓（20%仓位）。如果第一笔买入后即下跌触发止损，不加仓。</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: 实战要点 */}
            {strategyTab === "实战要点" && (
              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">实战要点与经验法则</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                  <div>
                    <span className="text-foreground font-medium">1. 最佳低开深度：4%-7%</span>
                    <p>这个区间的低开既有恢复空间，又不至于反映重大利空。低于2%的低开空间太小，超过9%的低开可能是有实质利空，需要区别对待。</p>
                  </div>
                  <div>
                    <span className="text-foreground font-medium">2. 量价配合是关键</span>
                    <p>低开+放量反弹是最可靠的反转信号。量比&gt;1.5且反弹幅度&gt;2%的标的，日内恢复概率显著高于缩量反弹。无量反弹可能是技术性反抽，持续性差。</p>
                  </div>
                  <div>
                    <span className="text-foreground font-medium">3. 主力资金确认方向</span>
                    <p>主力净流入是判断低开反弹真实性的重要依据。低开时主力大举买入=机构认为错杀，积极建仓；主力大幅流出=机构在借低开出货，需远离。</p>
                  </div>
                  <div>
                    <span className="text-foreground font-medium">4. 板块联动效应</span>
                    <p>同板块多只股票同时低开且反弹，说明是板块级事件驱动的错杀，恢复概率更高。如果仅个股低开，可能是个股利空，需谨慎。</p>
                  </div>
                  <div>
                    <span className="text-foreground font-medium">5. 前日涨停+低开=弱转强信号</span>
                    <p>前日涨停的股票次日低开，如果量能放大且快速反弹，是经典的&quot;弱转强&quot;形态，后续继续走强概率较高。</p>
                  </div>
                  <div>
                    <span className="text-foreground font-medium">6. 换手率2-8%为最佳</span>
                    <p>2-8%的换手率最佳，说明交易活跃且分歧不大。换手率&gt;20%往往意味着多空分歧巨大，波动剧烈风险高；&lt;1%则流动性不足。换手健康度因子已整合此维度。</p>
                  </div>
                  <div>
                    <span className="text-foreground font-medium">7. 主板优先、回避ST</span>
                    <p>主板股票流动性最好，做T成交顺畅。ST/退市风险股即使低开也不建议参与，基本面风险无法通过技术分析化解。</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: 风险提示 */}
            {strategyTab === "风险提示" && (
              <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300">风险提示</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
                  <p>1. 综合胜率分是量化参考，不构成投资建议。市场存在不可预测的系统性风险。</p>
                  <p>2. 低开幅度过大（&gt;9%）可能存在重大利空，即使反弹也可能是&quot;死猫跳&quot;。</p>
                  <p>3. 大盘弱势环境下，低开反弹的成功率会显著下降，需结合大盘趋势判断。</p>
                  <p>4. 做T操作需要严格的止盈止损纪律，建议设置2-3%的止损线。</p>
                  <p>5. 因子数据为实时计算，盘中会随行情变化，需持续关注因子分值变化。</p>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
});
