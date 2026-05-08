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
  Filter,
  RefreshCw,
  TrendingUp,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Loader2,
  BarChart3,
  Target,
  Database,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  X,
  SlidersHorizontal,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Check,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────

interface ScreenerStock {
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
  pulseScore: number;
  pulseDetail: string;
  volumeSurgeScore: number;
  volumeSurgeDetail: string;
}

interface ScreenerResult {
  success: boolean;
  stocks: ScreenerStock[];
  totalCount: number;
  filteredCount: number;
  sectorName: string;
  sectorCode: string;
  timestamp: string;
  error?: string;
  cached?: boolean;
}

type SortField = "pulseScore" | "changePercent" | "marketCap" | "turnover" | "amplitude" | "mainNetInflow" | "volumeSurgeScore";
type SortOrder = "asc" | "desc";

// ── Helper Functions ───────────────────────────────────

function formatMarketCap(val: number): string {
  if (!val) return "--";
  const yi = val / 1e8;
  if (yi >= 10000) return (yi / 10000).toFixed(2) + "万亿";
  if (yi >= 1) return yi.toFixed(2) + "亿";
  const wan = val / 1e4;
  if (wan >= 1) return wan.toFixed(2) + "万";
  return val.toFixed(0);
}

function formatAmount(val: number): string {
  if (!val) return "--";
  const yi = val / 1e8;
  if (yi >= 1) return yi.toFixed(2) + "亿";
  const wan = val / 1e4;
  if (wan >= 1) return wan.toFixed(2) + "万";
  return val.toFixed(0);
}

function getPulseScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 50) return "text-orange-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 20) return "text-lime-500";
  if (score >= 10) return "text-emerald-400";
  return "text-gray-400";
}

function getPulseScoreBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/30";
  if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 20) return "bg-lime-500/10 border-lime-500/30";
  if (score >= 10) return "bg-emerald-500/10 border-emerald-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getPulseLabel(score: number): string {
  if (score >= 70) return "强脉冲";
  if (score >= 50) return "中脉冲";
  if (score >= 30) return "弱脉冲";
  if (score >= 20) return "轻微脉冲";
  if (score >= 10) return "微弱脉冲";
  return "无脉冲";
}

function getVolumeSurgeScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 50) return "text-orange-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 20) return "text-lime-500";
  if (score >= 10) return "text-emerald-400";
  return "text-gray-400";
}

function getVolumeSurgeScoreBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/30";
  if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 20) return "bg-lime-500/10 border-lime-500/30";
  if (score >= 10) return "bg-emerald-500/10 border-emerald-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getVolumeSurgeLabel(score: number): string {
  if (score >= 70) return "强放量";
  if (score >= 50) return "中放量";
  if (score >= 30) return "弱放量";
  if (score >= 20) return "轻微放量";
  if (score >= 10) return "微弱放量";
  return "无放量";
}

// ── Popular sectors for quick selection ────────────────

const POPULAR_SECTORS = [
  { label: "通信", emoji: "📡" },
  { label: "半导体", emoji: "💎" },
  { label: "人工智能", emoji: "🤖" },
  { label: "新能源", emoji: "☀️" },
  { label: "医药", emoji: "💊" },
  { label: "军工", emoji: "🛡️" },
  { label: "汽车", emoji: "🚗" },
  { label: "消费", emoji: "🛒" },
  { label: "银行", emoji: "🏦" },
  { label: "证券", emoji: "📈" },
  { label: "地产", emoji: "🏠" },
  { label: "煤炭", emoji: "⛏️" },
  { label: "钢铁", emoji: "🔩" },
  { label: "电力", emoji: "⚡" },
  { label: "光伏", emoji: "🌞" },
  { label: "锂电池", emoji: "🔋" },
];

// ── Custom Presets (localStorage) ─────────────────────────

interface CustomPreset {
  id: string;
  name: string;
  filters: ScreenerFilters;
  createdAt: number;
}

const CUSTOM_PRESETS_KEY = "screener-custom-presets";

function loadCustomPresets(): CustomPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: CustomPreset[]): void {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore quota errors
  }
}

// ── Module-level client cache (persists across tab switches) ────────

interface ClientCacheEntry {
  result: ScreenerResult;
  lastFetchTime: string;
  timestamp: number;
  filters: ScreenerFilters;
}
const CLIENT_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

let clientCache: ClientCacheEntry | null = null;

// ── Filter State Type ──────────────────────────────────

interface ScreenerFilters {
  sector: string;
  minChange: number;
  maxChange: number;
  maxMarketCap: number;
  pulseThreshold: number;
  enablePulse: boolean;
  pulseTimeStart: string; // HH:mm format, e.g. "09:30"
  pulseTimeEnd: string;   // HH:mm format, e.g. "10:30"
  enableVolumeSurge: boolean;
  volumeSurgeThreshold: number;
}

const DEFAULT_FILTERS: ScreenerFilters = {
  sector: "通信",
  minChange: -5,
  maxChange: 10,
  maxMarketCap: 200,
  pulseThreshold: 10,
  enablePulse: true,
  pulseTimeStart: "09:30",
  pulseTimeEnd: "10:30",
  enableVolumeSurge: true,
  volumeSurgeThreshold: 10,
};

// ── Component ──────────────────────────────────────────

interface StockScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

export function StockScreener({ onSelectStock }: StockScreenerProps) {
  const [result, setResult] = useState<ScreenerResult | null>(clientCache?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("changePercent");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [lastFetchTime, setLastFetchTime] = useState<string>(clientCache?.lastFetchTime ?? "");
  const [isFromCache, setIsFromCache] = useState(!!clientCache);

  // Filter states
  const [filters, setFilters] = useState<ScreenerFilters>(clientCache?.filters ?? DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sectorInput, setSectorInput] = useState(clientCache?.filters.sector ?? "通信");
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);

  // Custom presets
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  // Load custom presets from localStorage on mount
  useEffect(() => {
    setCustomPresets(loadCustomPresets());
  }, []);

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

  const fetchScreenerData = useCallback(async (forceRefresh = false, customFilters?: ScreenerFilters) => {
    const f = customFilters || filters;
    setLoading(true);
    setError(null);
    setIsFromCache(false);
    try {
      const params = new URLSearchParams({
        minChange: String(f.minChange),
        maxChange: String(f.maxChange),
        maxMarketCap: String(f.maxMarketCap),
        pulseThreshold: String(f.pulseThreshold),
        sector: f.sector,
        pulseTimeStart: f.pulseTimeStart,
        pulseTimeEnd: f.pulseTimeEnd,
        volumeSurgeThreshold: String(f.volumeSurgeThreshold),
      });
      if (!f.enablePulse) params.set("pulse", "false");
      if (!f.enableVolumeSurge) params.set("volumeSurge", "false");
      if (forceRefresh) params.set("refresh", "1");
      const res = await fetch(`/api/stock/screener?${params}`);
      const data: ScreenerResult = await res.json();

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        setIsFromCache(!!data.cached);
        // Update client cache
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

  // Auto-fetch on mount: always restore cache immediately,
  // then silently refresh in background if cache is stale
  useEffect(() => {
    if (clientCache) {
      // Always restore from cache first (instant display)
      setResult(clientCache.result);
      setLastFetchTime(clientCache.lastFetchTime);
      setFilters(clientCache.filters);
      setSectorInput(clientCache.filters.sector);
      setIsFromCache(true);

      // If cache is stale, silently refresh in background
      if (Date.now() - clientCache.timestamp >= CLIENT_CACHE_TTL) {
        fetchScreenerData(false, clientCache.filters);
      }
    } else {
      // No cache at all, fetch fresh data
      fetchScreenerData();
    }
  }, []);

  // Sort stocks
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

  // Handle filter changes
  const handleFilterChange = (key: keyof ScreenerFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSectorSelect = (sector: string) => {
    setSectorInput(sector);
    handleFilterChange("sector", sector);
    setShowSectorDropdown(false);
  };

  const handleSectorInputConfirm = () => {
    if (sectorInput.trim()) {
      handleFilterChange("sector", sectorInput.trim());
    }
    setShowSectorDropdown(false);
  };

  // Apply filters and fetch
  const handleApplyFilters = () => {
    // Update sector from input
    if (sectorInput.trim() && sectorInput.trim() !== filters.sector) {
      const newFilters = { ...filters, sector: sectorInput.trim() };
      setFilters(newFilters);
      fetchScreenerData(true, newFilters);
    } else {
      fetchScreenerData(true);
    }
  };

  // Reset to defaults
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSectorInput(DEFAULT_FILTERS.sector);
  };

  // Save current filters as a custom preset
  const handleSavePreset = () => {
    const name = presetNameInput.trim() || `${filters.sector} ${filters.minChange}%~${filters.maxChange}%`;
    const newPreset: CustomPreset = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      filters: { ...filters },
      createdAt: Date.now(),
    };
    const updated = [newPreset, ...customPresets];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setPresetNameInput("");
    setShowSavePreset(false);
  };

  // Delete a custom preset
  const handleDeletePreset = (id: string) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setDeletingPresetId(null);
  };

  // Apply a custom preset
  const handleApplyPreset = (preset: CustomPreset) => {
    setFilters(preset.filters);
    setSectorInput(preset.filters.sector);
  };

  // Check if filters have changed from defaults
  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  // Compute cache remaining time for display
  const cacheRemaining = React.useMemo(() => {
    if (!clientCache) return 0;
    const elapsed = Date.now() - clientCache.timestamp;
    return Math.max(0, Math.ceil((CLIENT_CACHE_TTL - elapsed) / 1000));
  }, [lastFetchTime, isFromCache]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header: Criteria Tags */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-500" />
              智能选股
            </CardTitle>
            <div className="flex items-center gap-2">
              {isFromCache && cacheRemaining > 0 && (
                <Badge variant="outline" className="text-xs py-0 px-1.5 gap-1 bg-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-300">
                  <Database className="w-3 h-3" />
                  缓存 {cacheRemaining}s
                </Badge>
              )}
              {lastFetchTime && (
                <span className="text-xs text-muted-foreground">
                  更新于 {lastFetchTime}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchScreenerData(true)}
                disabled={loading}
                className="h-7 text-xs gap-1"
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Active Criteria Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <BarChart3 className="w-3 h-3" />
              {filters.sector}板块
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <Target className="w-3 h-3" />
              主板
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <TrendingUp className="w-3 h-3" />
              涨幅{filters.minChange}%~{filters.maxChange}%
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <BarChart3 className="w-3 h-3" />
              市值&lt;{filters.maxMarketCap}亿
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <AlertCircle className="w-3 h-3" />
              排除ST/创业板/科创板/北交
            </Badge>
            {(filters.enablePulse || filters.enableVolumeSurge) && (
              <Badge variant="outline" className="text-xs py-0.5 px-2 gap-1 bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300">
                <Zap className="w-3 h-3" />
                {filters.enablePulse && `脉冲≥${filters.pulseThreshold}`}
                {filters.enablePulse && filters.enableVolumeSurge && " OR "}
                {filters.enableVolumeSurge && `放量≥${filters.volumeSurgeThreshold}`}
                {" | "}{filters.pulseTimeStart}~{filters.pulseTimeEnd}
              </Badge>
            )}
          </div>

          {/* Expand/Collapse Filter Panel */}
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="w-3 h-3" />
            {filtersExpanded ? "收起筛选条件" : "编辑筛选条件"}
            {filtersExpanded ? (
              <ChevronUpIcon className="w-3 h-3" />
            ) : (
              <ChevronDownIcon className="w-3 h-3" />
            )}
            {filtersChanged && !filtersExpanded && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            )}
          </button>

          {/* Editable Filter Panel */}
          {filtersExpanded && (
            <div className="mt-3 p-4 rounded-lg border border-border/50 bg-muted/30 space-y-4">
              {/* Row 1: Sector */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">板块关键词</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-xs" ref={sectorDropdownRef}>
                    <div className="relative">
                      <Input
                        value={sectorInput}
                        onChange={(e) => {
                          setSectorInput(e.target.value);
                          setShowSectorDropdown(true);
                        }}
                        onFocus={() => setShowSectorDropdown(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSectorInputConfirm();
                        }}
                        placeholder="输入板块名称..."
                        className="h-8 text-xs pr-8"
                      />
                      {sectorInput && (
                        <button
                          onClick={() => {
                            setSectorInput("");
                            handleFilterChange("sector", "");
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {/* Quick select dropdown */}
                    {showSectorDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-2 max-h-48 overflow-y-auto">
                        <div className="text-xs text-muted-foreground mb-1.5 px-1">热门板块</div>
                        <div className="flex flex-wrap gap-1">
                          {POPULAR_SECTORS.filter(s =>
                            !sectorInput || s.label.includes(sectorInput)
                          ).map((s) => (
                            <button
                              key={s.label}
                              onClick={() => handleSectorSelect(s.label)}
                              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                                filters.sector === s.label
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-background border-border hover:bg-muted"
                              }`}
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

              {/* Row 2: Change % range */}
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

                {/* Market Cap */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    最大市值 ({filters.maxMarketCap}亿)
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={10}
                      max={2000}
                      step={10}
                      value={[filters.maxMarketCap]}
                      onValueChange={([v]) => handleFilterChange("maxMarketCap", v)}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={filters.maxMarketCap}
                      onChange={(e) => handleFilterChange("maxMarketCap", parseFloat(e.target.value) || 200)}
                      className="h-7 text-xs w-20"
                      step={10}
                    />
                    <span className="text-xs text-muted-foreground">亿元</span>
                  </div>
                </div>
              </div>

              {/* Row 3: Pulse & Volume surge detection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      脉冲拉升检测
                    </Label>
                    <Switch
                      checked={filters.enablePulse}
                      onCheckedChange={(v) => handleFilterChange("enablePulse", v)}
                    />
                  </div>
                  {filters.enablePulse && (
                    <>
                      <div className="flex items-center gap-3">
                        <Slider
                          min={0}
                          max={100}
                          step={5}
                          value={[filters.pulseThreshold]}
                          onValueChange={([v]) => handleFilterChange("pulseThreshold", v)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.pulseThreshold}
                          onChange={(e) => handleFilterChange("pulseThreshold", parseInt(e.target.value) || 10)}
                          className="h-7 text-xs w-20"
                          step={5}
                        />
                        <span className="text-xs text-muted-foreground">
                          最低脉冲评分 (0-100)
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      放量拉升检测
                    </Label>
                    <Switch
                      checked={filters.enableVolumeSurge}
                      onCheckedChange={(v) => handleFilterChange("enableVolumeSurge", v)}
                    />
                  </div>
                  {filters.enableVolumeSurge && (
                    <>
                      <div className="flex items-center gap-3">
                        <Slider
                          min={0}
                          max={100}
                          step={5}
                          value={[filters.volumeSurgeThreshold]}
                          onValueChange={([v]) => handleFilterChange("volumeSurgeThreshold", v)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={filters.volumeSurgeThreshold}
                          onChange={(e) => handleFilterChange("volumeSurgeThreshold", parseInt(e.target.value) || 10)}
                          className="h-7 text-xs w-20"
                          step={5}
                        />
                        <span className="text-xs text-muted-foreground">
                          最低放量评分 (0-100)
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Shared time range for both detections */}
                {(filters.enablePulse || filters.enableVolumeSurge) && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">检测时段</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={filters.pulseTimeStart}
                        onChange={(e) => handleFilterChange("pulseTimeStart", e.target.value)}
                        className="h-7 text-xs w-24"
                        min="09:30"
                        max="15:00"
                        step="300"
                      />
                      <span className="text-xs text-muted-foreground">~</span>
                      <Input
                        type="time"
                        value={filters.pulseTimeEnd}
                        onChange={(e) => handleFilterChange("pulseTimeEnd", e.target.value)}
                        className="h-7 text-xs w-24"
                        min="09:30"
                        max="15:00"
                        step="300"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => {
                          handleFilterChange("pulseTimeStart", "09:30");
                          handleFilterChange("pulseTimeEnd", "10:30");
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          filters.pulseTimeStart === "09:30" && filters.pulseTimeEnd === "10:30"
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        开盘1h
                      </button>
                      <button
                        onClick={() => {
                          handleFilterChange("pulseTimeStart", "09:30");
                          handleFilterChange("pulseTimeEnd", "10:00");
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          filters.pulseTimeStart === "09:30" && filters.pulseTimeEnd === "10:00"
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        开盘30m
                      </button>
                      <button
                        onClick={() => {
                          handleFilterChange("pulseTimeStart", "09:30");
                          handleFilterChange("pulseTimeEnd", "11:30");
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          filters.pulseTimeStart === "09:30" && filters.pulseTimeEnd === "11:30"
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        早盘
                      </button>
                      <button
                        onClick={() => {
                          handleFilterChange("pulseTimeStart", "13:00");
                          handleFilterChange("pulseTimeEnd", "14:00");
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          filters.pulseTimeStart === "13:00" && filters.pulseTimeEnd === "14:00"
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        午盘1h
                      </button>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      脉冲/放量共享此时段，关系为 <span className="text-amber-500 font-medium">OR</span>（满足其一即可）
                    </div>
                  </div>
                )}
              </div>

                {/* Quick presets & Custom presets */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">快捷预设</Label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => {
                          setFilters(DEFAULT_FILTERS);
                          setSectorInput(DEFAULT_FILTERS.sector);
                        }}
                        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                          !filtersChanged
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        默认(脉冲+放量)
                      </button>
                      <button
                        onClick={() => {
                          const f = { sector: "半导体", minChange: -5, maxChange: 10, maxMarketCap: 500, pulseThreshold: 10, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10 };
                          setFilters(f);
                          setSectorInput("半导体");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        💎 半导体宽幅
                      </button>
                      <button
                        onClick={() => {
                          const f = { sector: "人工智能", minChange: -5, maxChange: 10, maxMarketCap: 1000, pulseThreshold: 10, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10 };
                          setFilters(f);
                          setSectorInput("人工智能");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        🤖 AI大市值
                      </button>
                      <button
                        onClick={() => {
                          const f = { sector: "新能源", minChange: -5, maxChange: 10, maxMarketCap: 300, pulseThreshold: 10, enablePulse: true, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: true, volumeSurgeThreshold: 10 };
                          setFilters(f);
                          setSectorInput("新能源");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        ☀️ 新能源波动
                      </button>
                      <button
                        onClick={() => {
                          const f = { sector: "医药", minChange: -5, maxChange: 10, maxMarketCap: 500, pulseThreshold: 10, enablePulse: false, pulseTimeStart: "09:30", pulseTimeEnd: "10:30", enableVolumeSurge: false, volumeSurgeThreshold: 10 };
                          setFilters(f);
                          setSectorInput("医药");
                        }}
                        className="text-xs px-2.5 py-1 rounded-md border bg-background border-border hover:bg-muted transition-colors"
                      >
                        💊 医药纯筛选
                      </button>
                    </div>
                  </div>

                  {/* Custom presets */}
                  {customPresets.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Bookmark className="w-3 h-3" />
                        我的预设
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {customPresets.map((preset) => (
                          <div key={preset.id} className="group relative">
                            <button
                              onClick={() => handleApplyPreset(preset)}
                              className={`text-xs px-2.5 py-1 rounded-md border transition-colors pr-7 ${
                                JSON.stringify(filters) === JSON.stringify(preset.filters)
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                              }`}
                            >
                              📌 {preset.name}
                            </button>
                            {deletingPresetId === preset.id ? (
                              <div className="absolute -top-0.5 -right-0.5 flex items-center gap-0.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeletePreset(preset.id); }}
                                  className="w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white"
                                >
                                  <Check className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeletingPresetId(null); }}
                                  className="w-4 h-4 flex items-center justify-center rounded-full bg-muted text-muted-foreground"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletingPresetId(preset.id); }}
                                className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-muted/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-500"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Save current as preset */}
                  <div className="space-y-2">
                    {showSavePreset ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={presetNameInput}
                          onChange={(e) => setPresetNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSavePreset();
                            if (e.key === "Escape") setShowSavePreset(false);
                          }}
                          placeholder={`预设名称 (默认: ${filters.sector} ${filters.minChange}%~${filters.maxChange}%)`}
                          className="h-7 text-xs flex-1"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={handleSavePreset}
                          className="h-7 text-xs gap-1"
                        >
                          <Check className="w-3 h-3" />
                          保存
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setShowSavePreset(false); setPresetNameInput(""); }}
                          className="h-7 text-xs"
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowSavePreset(true)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <BookmarkPlus className="w-3 h-3" />
                        保存当前条件为预设
                      </button>
                    )}
                  </div>
                </div>

              <Separator />

              {/* Action buttons */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-7 text-xs gap-1"
                >
                  重置条件
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyFilters}
                  disabled={loading}
                  className="h-7 text-xs gap-1"
                >
                  {loading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Search className="w-3 h-3" />
                  )}
                  开始选股
                </Button>
              </div>
            </div>
          )}

          {/* Stats */}
          {result && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
              <span>板块: <strong className="text-foreground">{result.sectorName}</strong></span>
              <span>板块总数: <strong className="text-foreground">{result.totalCount}</strong></span>
              <span>筛选结果: <strong className="text-emerald-500">{result.filteredCount}</strong>只</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="border-border/50 shadow-sm flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            筛选结果
            {result && (
              <Badge variant="secondary" className="text-xs font-normal">
                {result.filteredCount}只
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 flex-1 min-h-0 overflow-auto">
          {loading && !result ? (
            // Loading skeleton
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="w-16 h-4" />
                  <Skeleton className="w-20 h-4" />
                  <Skeleton className="w-14 h-4" />
                  <Skeleton className="w-14 h-4" />
                  <Skeleton className="w-16 h-4" />
                  <Skeleton className="w-20 h-4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mb-2 text-red-400" />
              <p className="text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchScreenerData(true)}
                className="mt-3"
              >
                重试
              </Button>
            </div>
          ) : sortedStocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="w-8 h-8 mb-2" />
              <p className="text-sm">暂无符合条件的股票</p>
              <p className="text-xs mt-1">请尝试调整筛选条件或稍后刷新</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[60px] text-xs font-medium">代码</TableHead>
                    <TableHead className="w-[80px] text-xs font-medium">名称</TableHead>
                    <TableHead
                      className="w-[70px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("pulseScore")}
                    >
                      <div className="flex items-center gap-0.5">
                        脉冲 <SortIcon field="pulseScore" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[70px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("volumeSurgeScore")}
                    >
                      <div className="flex items-center gap-0.5">
                        放量 <SortIcon field="volumeSurgeScore" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[65px] text-xs font-medium">最新价</TableHead>
                    <TableHead
                      className="w-[65px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("changePercent")}
                    >
                      <div className="flex items-center gap-0.5">
                        涨跌幅 <SortIcon field="changePercent" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[60px] text-xs font-medium">开盘</TableHead>
                    <TableHead className="w-[70px] text-xs font-medium">振幅%</TableHead>
                    <TableHead
                      className="w-[75px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("marketCap")}
                    >
                      <div className="flex items-center gap-0.5">
                        总市值 <SortIcon field="marketCap" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[60px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("turnover")}
                    >
                      <div className="flex items-center gap-0.5">
                        换手% <SortIcon field="turnover" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[75px] text-xs font-medium cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("mainNetInflow")}
                    >
                      <div className="flex items-center gap-0.5">
                        主力净流 <SortIcon field="mainNetInflow" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[60px] text-xs font-medium">PE</TableHead>
                    <TableHead className="text-xs font-medium min-w-[120px]">信号详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStocks.map((stock) => {
                    const isUp = stock.changePercent >= 0;
                    const changeColor = isUp ? "text-red-500" : "text-green-500";
                    const pulseColor = getPulseScoreColor(stock.pulseScore);
                    const pulseBg = getPulseScoreBg(stock.pulseScore);
                    const pulseLabel = getPulseLabel(stock.pulseScore);
                    const volSurgeColor = getVolumeSurgeScoreColor(stock.volumeSurgeScore);
                    const volSurgeBg = getVolumeSurgeScoreBg(stock.volumeSurgeScore);
                    const volSurgeLabel = getVolumeSurgeLabel(stock.volumeSurgeScore);
                    const mainFlowColor = stock.mainNetInflow >= 0 ? "text-red-500" : "text-green-500";

                    return (
                      <TableRow
                        key={stock.symbol}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => onSelectStock?.(stock.symbol)}
                      >
                        <TableCell className="text-xs font-mono py-2">
                          {stock.symbol}
                        </TableCell>
                        <TableCell className="text-xs font-medium py-2 max-w-[80px] truncate">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block">{stock.name}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {stock.name} ({stock.exchange})
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs py-0 px-1.5 font-mono ${pulseBg} ${pulseColor} border`}
                            >
                              {stock.pulseScore}
                            </Badge>
                            <span className={`text-[10px] ${pulseColor}`}>
                              {pulseLabel}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs py-0 px-1.5 font-mono ${volSurgeBg} ${volSurgeColor} border`}
                            >
                              {stock.volumeSurgeScore}
                            </Badge>
                            <span className={`text-[10px] ${volSurgeColor}`}>
                              {volSurgeLabel}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-xs font-mono py-2 ${changeColor}`}>
                          {stock.price.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-xs font-mono py-2 font-medium ${changeColor}`}>
                          <div className="flex items-center gap-0.5">
                            {isUp ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {stock.changePercent.toFixed(2)}%
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.open.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.amplitude.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {formatMarketCap(stock.marketCap)}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2">
                          {stock.turnover.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-xs font-mono py-2 ${mainFlowColor}`}>
                          {stock.mainNetInflow >= 0 ? "+" : ""}
                          {formatAmount(stock.mainNetInflow)}
                        </TableCell>
                        <TableCell className="text-xs font-mono py-2 text-muted-foreground">
                          {stock.pe > 0 ? stock.pe.toFixed(1) : "--"}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground max-w-[160px] truncate">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block">
                                  {stock.pulseScore > 0 && <span className="text-amber-500">⚡{stock.pulseDetail}</span>}
                                  {stock.pulseScore > 0 && stock.volumeSurgeScore > 0 && " | "}
                                  {stock.volumeSurgeScore > 0 && <span className="text-blue-500">📊{stock.volumeSurgeDetail}</span>}
                                  {stock.pulseScore === 0 && stock.volumeSurgeScore === 0 && "无信号"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[300px]">
                                {stock.pulseScore > 0 && <div>⚡ 脉冲: {stock.pulseDetail}</div>}
                                {stock.volumeSurgeScore > 0 && <div>📊 放量: {stock.volumeSurgeDetail}</div>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
