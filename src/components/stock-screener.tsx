"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Filter,
  RefreshCw,
  TrendingUp,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Search,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BarChart3,
  Target,
  Database,
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

type SortField = "pulseScore" | "changePercent" | "marketCap" | "turnover" | "amplitude" | "mainNetInflow";
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

function formatVolume(val: number): string {
  if (!val) return "--";
  if (val >= 1e8) return (val / 1e8).toFixed(2) + "亿";
  if (val >= 1e4) return (val / 1e4).toFixed(2) + "万";
  return val.toFixed(0);
}

function getPulseScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 50) return "text-orange-500";
  if (score >= 30) return "text-yellow-500";
  if (score >= 20) return "text-lime-500";
  return "text-gray-400";
}

function getPulseScoreBg(score: number): string {
  if (score >= 70) return "bg-red-500/10 border-red-500/30";
  if (score >= 50) return "bg-orange-500/10 border-orange-500/30";
  if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
  if (score >= 20) return "bg-lime-500/10 border-lime-500/30";
  return "bg-gray-500/10 border-gray-500/30";
}

function getPulseLabel(score: number): string {
  if (score >= 70) return "强脉冲";
  if (score >= 50) return "中脉冲";
  if (score >= 30) return "弱脉冲";
  if (score >= 20) return "轻微脉冲";
  return "无脉冲";
}

// ── Module-level client cache (persists across tab switches) ────────
// This cache survives component unmount/remount when switching between
// "做T" and "选股" tabs, so the user doesn't need to re-fetch every time.
interface ClientCacheEntry {
  result: ScreenerResult;
  lastFetchTime: string;
  timestamp: number;
}
const CLIENT_CACHE_TTL = 3 * 60 * 1000; // 3 minutes – same as server cache
let clientCache: ClientCacheEntry | null = null;

// ── Component ──────────────────────────────────────────

interface StockScreenerProps {
  onSelectStock?: (symbol: string) => void;
}

export function StockScreener({ onSelectStock }: StockScreenerProps) {
  const [result, setResult] = useState<ScreenerResult | null>(clientCache?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("pulseScore");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [lastFetchTime, setLastFetchTime] = useState<string>(clientCache?.lastFetchTime ?? "");
  const [isFromCache, setIsFromCache] = useState(!!clientCache);

  // Filter states
  const [minChange, setMinChange] = useState(0);
  const [maxChange, setMaxChange] = useState(3);
  const [maxMarketCap, setMaxMarketCap] = useState(200);
  const [pulseThreshold, setPulseThreshold] = useState(20);

  const fetchScreenerData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setIsFromCache(false);
    try {
      const params = new URLSearchParams({
        minChange: String(minChange),
        maxChange: String(maxChange),
        maxMarketCap: String(maxMarketCap),
        pulseThreshold: String(pulseThreshold),
        sector: "通信",
      });
      if (forceRefresh) params.set("refresh", "1");
      const res = await fetch(`/api/stock/screener?${params}`);
      const data: ScreenerResult = await res.json();

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        setIsFromCache(!!data.cached);
        // Update client cache
        clientCache = { result: data, lastFetchTime: fetchTime, timestamp: Date.now() };
      } else {
        setError(data.error || "选股失败");
      }
    } catch (e: any) {
      setError(e.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [minChange, maxChange, maxMarketCap, pulseThreshold]);

  // Auto-fetch on mount: use cache if fresh, otherwise fetch
  useEffect(() => {
    if (clientCache && Date.now() - clientCache.timestamp < CLIENT_CACHE_TTL) {
      // Cache is still fresh – use it, no need to fetch
      setResult(clientCache.result);
      setLastFetchTime(clientCache.lastFetchTime);
      setIsFromCache(true);
    } else {
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

  // Criteria tags
  const criteria = [
    { label: "通讯板块", active: true, icon: <BarChart3 className="w-3 h-3" /> },
    { label: "主板", active: true, icon: <Target className="w-3 h-3" /> },
    { label: `涨幅${minChange}%~${maxChange}%`, active: true, icon: <TrendingUp className="w-3 h-3" /> },
    { label: `市值<${maxMarketCap}亿`, active: true, icon: <BarChart3 className="w-3 h-3" /> },
    { label: "排除ST", active: true, icon: <AlertCircle className="w-3 h-3" /> },
    { label: "排除创业板", active: true, icon: <AlertCircle className="w-3 h-3" /> },
    { label: "排除科创板", active: true, icon: <AlertCircle className="w-3 h-3" /> },
    { label: "排除北交", active: true, icon: <AlertCircle className="w-3 h-3" /> },
    { label: "开盘脉冲拉升", active: true, icon: <Zap className="w-3 h-3" /> },
  ];

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
          {/* Criteria Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {criteria.map((c, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-xs py-0.5 px-2 gap-1 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              >
                {c.icon}
                {c.label}
              </Badge>
            ))}
          </div>

          {/* Stats */}
          {result && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                    <TableHead className="text-xs font-medium min-w-[120px]">脉冲详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStocks.map((stock) => {
                    const isUp = stock.changePercent >= 0;
                    const changeColor = isUp ? "text-red-500" : "text-green-500";
                    const pulseColor = getPulseScoreColor(stock.pulseScore);
                    const pulseBg = getPulseScoreBg(stock.pulseScore);
                    const pulseLabel = getPulseLabel(stock.pulseScore);
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
                        <TableCell className="text-xs py-2 text-muted-foreground max-w-[120px] truncate">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block">{stock.pulseDetail}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[240px]">
                                {stock.pulseDetail}
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
