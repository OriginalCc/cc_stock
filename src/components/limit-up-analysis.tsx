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
  Zap,
  Clock,
  Lock,
  Unlock,
  RefreshCw,
  Loader2,
  Database,
  Lightbulb,
  AlertCircle,
  Flame,
  Target,
  BarChart3,
  ArrowUpRight,
  Search,
  Shield,
  Star,
  Activity,
  Crown,
  Medal,
  Award,
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
  isTradingHours,
} from "@/lib/screener-shared";

// ── Types (matching API response) ─────────────────────

interface LimitUpStock {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  prevClose: number;
  changePercent: number;
  turnover: number;
  marketCap: number;
  mainNetInflow: number;
  lockTime: string;
  lockStrength: number;
  breakCount: number;
  volumeRatio: number;
  limitUpType: string;
  consecutiveDays: number;
  amplitude: number;
  pe: number;
  pulseDetail: string;
}

interface SectorAnalysis {
  sectorCode: string;
  sectorName: string;
  sectorChangePercent: number;
  limitUpCount: number;
  totalStocks: number;
  stocks: LimitUpStock[];
  newsAnalysis: {
    driver: string;
    catalysts: string[];
    outlook: string;
    keyEvents: string[];
  };
}

interface LimitUpResult {
  success: boolean;
  date: string;
  sectors: SectorAnalysis[];
  timestamp: string;
  cached?: boolean;
  error?: string;
}

interface LimitUpAnalysisProps {
  onSelectStock?: (symbol: string) => void;
}

// ── Module-level client cache (persists across tab switches) ────────

interface ClientCacheEntry {
  result: LimitUpResult;
  lastFetchTime: string;
  timestamp: number;
}

const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes – matches server cache
let clientCache: ClientCacheEntry | null = null;

// ── Helper Functions ───────────────────────────────────

/** Get badge styling for limit-up type */
function getLimitUpTypeStyle(type: string): string {
  switch (type) {
    case "一字板":
      return "bg-red-500/10 text-red-600 border-red-500/30";
    case "秒板":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    case "早板":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
    case "午板":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "尾板":
      return "bg-gray-500/10 text-gray-600 border-gray-500/30";
    default:
      return "bg-gray-500/10 text-gray-500 border-gray-500/30";
  }
}

/** Get rank badge for top 3 stocks */
function getRankBadge(rank: number) {
  if (rank === 1) return <Crown className="w-3.5 h-3.5 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-3.5 h-3.5 text-gray-400" />;
  if (rank === 3) return <Award className="w-3.5 h-3.5 text-amber-700" />;
  return null;
}

/** Get progress bar color class for lock strength */
function getLockStrengthColor(strength: number): string {
  if (strength >= 80) return "bg-red-500";
  if (strength >= 50) return "bg-orange-500";
  if (strength >= 30) return "bg-yellow-500";
  return "bg-gray-400";
}

/** Get progress track color class for lock strength */
function getLockStrengthTrackColor(strength: number): string {
  if (strength >= 80) return "bg-red-500/20";
  if (strength >= 50) return "bg-orange-500/20";
  if (strength >= 30) return "bg-yellow-500/20";
  return "bg-gray-400/20";
}

/** Get lock strength text color */
function getLockStrengthTextColor(strength: number): string {
  if (strength >= 80) return "text-red-600";
  if (strength >= 50) return "text-orange-600";
  if (strength >= 30) return "text-yellow-600";
  return "text-gray-500";
}

// ── Sub-Components ─────────────────────────────────────

/** Full-page loading skeleton */
function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Header skeleton */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="w-24 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="w-16 h-5" />
              <Skeleton className="w-16 h-7" />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Sector card skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded" />
                <Skeleton className="w-20 h-5" />
                <Skeleton className="w-14 h-5" />
                <Skeleton className="w-24 h-5" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {/* News analysis skeleton */}
            <div className="space-y-2">
              <Skeleton className="w-32 h-4" />
              <Skeleton className="w-full h-4" />
              <Skeleton className="w-3/4 h-4" />
              <div className="flex gap-1.5 mt-2">
                <Skeleton className="w-16 h-5 rounded" />
                <Skeleton className="w-20 h-5 rounded" />
                <Skeleton className="w-14 h-5 rounded" />
              </div>
              <Skeleton className="w-48 h-4 mt-2" />
            </div>
            <Separator />
            {/* Table skeleton */}
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 py-1.5">
                  <Skeleton className="w-14 h-4" />
                  <Skeleton className="w-16 h-4" />
                  <Skeleton className="w-12 h-4" />
                  <Skeleton className="w-10 h-4" />
                  <Skeleton className="w-16 h-4" />
                  <Skeleton className="w-14 h-4" />
                  <Skeleton className="w-12 h-4" />
                  <Skeleton className="w-14 h-4" />
                  <Skeleton className="w-10 h-4" />
                </div>
              ))}
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
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-4 gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          重试
        </Button>
      </CardContent>
    </Card>
  );
}

/** Empty state when no limit-up stocks found */
function EmptyState() {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Search className="w-10 h-10 mb-3" />
        <p className="text-sm font-medium text-foreground">今日暂无涨停股</p>
        <p className="text-xs mt-1">可能非交易时段或市场无涨停板</p>
      </CardContent>
    </Card>
  );
}

/** News Analysis section within a sector card */
function NewsAnalysisSection({
  newsAnalysis,
}: {
  newsAnalysis: SectorAnalysis["newsAnalysis"];
}) {
  return (
    <div className="space-y-3">
      {/* Driver */}
      <div className="flex items-start gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <span className="text-xs font-medium text-muted-foreground">核心驱动</span>
          <p className="text-sm text-foreground leading-relaxed">{newsAnalysis.driver}</p>
        </div>
      </div>

      {/* Key Events */}
      {newsAnalysis.keyEvents.length > 0 && (
        <div className="flex items-start gap-2">
          <Flame className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="text-xs font-medium text-muted-foreground">关键事件</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {newsAnalysis.keyEvents.map((event, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[11px] py-0 px-1.5 bg-orange-500/5 border-orange-500/20 text-orange-700 dark:text-orange-300"
                >
                  {event}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Catalysts */}
      {newsAnalysis.catalysts.length > 0 && (
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="text-xs font-medium text-muted-foreground">催化因素</span>
            <ul className="mt-1 space-y-0.5">
              {newsAnalysis.catalysts.map((catalyst, i) => (
                <li key={i} className="text-xs text-foreground/80 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-yellow-500 shrink-0" />
                  {catalyst}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Outlook */}
      <div className="flex items-start gap-2">
        <Target className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
        <div>
          <span className="text-xs font-medium text-muted-foreground">后市展望</span>
          <p className="text-xs text-foreground/80 leading-relaxed">{newsAnalysis.outlook}</p>
        </div>
      </div>
    </div>
  );
}

/** Lock Strength progress bar with color coding */
function LockStrengthBar({ strength }: { strength: number }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 w-full min-w-[80px]">
            <div className="flex-1">
              <div className={`h-1.5 rounded-full ${getLockStrengthTrackColor(strength)}`}>
                <div
                  className={`h-full rounded-full transition-all ${getLockStrengthColor(strength)}`}
                  style={{ width: `${Math.max(strength, 2)}%` }}
                />
              </div>
            </div>
            <span className={`text-[11px] font-mono w-8 text-right ${getLockStrengthTextColor(strength)}`}>
              {strength}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          封板强度: {strength}%
          {strength >= 80 ? " (强势封板)" : strength >= 50 ? " (中等封板)" : strength >= 30 ? " (弱势封板)" : " (封板不稳)"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Consecutive Days badge – red pulsing if >= 3 */
function ConsecutiveDaysBadge({ days }: { days: number }) {
  if (days <= 1) {
    return <span className="text-xs text-muted-foreground">1</span>;
  }

  if (days >= 3) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="text-[11px] py-0 px-1.5 font-mono font-semibold bg-red-500/10 text-red-600 border-red-500/30 animate-pulse"
            >
              {days}连板
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            连续{days}个交易日涨停
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Badge
      variant="outline"
      className="text-[11px] py-0 px-1.5 font-mono bg-orange-500/5 text-orange-600 border-orange-500/20"
    >
      {days}连板
    </Badge>
  );
}

/** Compact Watchlist Section */
function WatchlistSection({
  watchlist,
  onSelectStock,
  onRemove,
}: {
  watchlist: WatchlistItem[];
  onSelectStock?: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}) {
  if (watchlist.length === 0) return null;

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
          <span className="text-xs font-medium text-muted-foreground">
            自选股 ({watchlist.length})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {watchlist.map((item) => (
            <div
              key={item.symbol}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/5 border border-yellow-500/20 text-[11px] group"
            >
              <button
                type="button"
                className="cursor-pointer hover:text-red-500 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.symbol);
                }}
                aria-label={`移除 ${item.name}`}
              >
                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 group-hover:fill-red-500 group-hover:text-red-500" />
              </button>
              <span
                className="cursor-pointer hover:underline"
                onClick={() => onSelectStock?.(item.symbol)}
              >
                {item.name}
              </span>
              {item.changePercent !== undefined && (
                <span className={item.changePercent >= 0 ? "text-red-500" : "text-green-500"}>
                  {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Sector Distribution Mini Pie Chart (SVG) */
function SectorDistributionChart({ sectors }: { sectors: SectorAnalysis[] }) {
  const colors = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#8b5cf6", "#ec4899", "#64748b", "#14b8a6", "#f43f5e",
  ];

  const data = sectors.map((s, i) => ({
    name: s.sectorName,
    count: s.limitUpCount,
    color: colors[i % colors.length],
  }));

  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  // Build SVG pie slices using reduce to avoid mutation during render
  const cx = 40, cy = 40, r = 36;
  const slices = data.reduce<Array<{
    name: string; count: number; color: string; path: string; angle: number;
  }>>((acc, d, idx) => {
    const angle = (d.count / total) * 360;
    const startAngle = idx === 0 ? -90 : acc[idx - 1].endAngle;
    const endAngle = startAngle + angle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path =
      angle >= 360
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    acc.push({ ...d, path, angle, endAngle });
    return acc;
  }, []);

  return (
    <div className="flex items-start gap-3">
      <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth="1" />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-[11px] text-muted-foreground truncate max-w-[80px]">
              {d.name}
            </span>
            <span className="text-[11px] font-mono font-medium">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Limit-Up Type Distribution Badges */
function LimitUpTypeDistribution({ sectors }: { sectors: SectorAnalysis[] }) {
  const typeColors: Record<string, string> = {
    "一字板": "bg-red-500/10 text-red-600 border-red-500/30",
    "秒板": "bg-orange-500/10 text-orange-600 border-orange-500/30",
    "早板": "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
    "午板": "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
    "尾板": "bg-gray-500/10 text-gray-600 border-gray-500/30",
  };

  const typeCounts: Record<string, number> = {};
  sectors.forEach((s) =>
    s.stocks.forEach((stock) => {
      typeCounts[stock.limitUpType] = (typeCounts[stock.limitUpType] || 0) + 1;
    }),
  );

  const total = Object.values(typeCounts).reduce((s, c) => s + c, 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => (
          <Badge
            key={type}
            variant="outline"
            className={`text-[11px] py-0 px-1.5 gap-1 ${typeColors[type] || "bg-gray-500/10 text-gray-500 border-gray-500/30"}`}
          >
            {type}
            <span className="font-mono font-semibold">{count}</span>
            <span className="text-[10px] opacity-70">
              ({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)
            </span>
          </Badge>
        ))}
    </div>
  );
}

/** Lock Strength Distribution Bar */
function LockStrengthDistributionBar({ sectors }: { sectors: SectorAnalysis[] }) {
  const allStocks = sectors.flatMap((s) => s.stocks);
  if (allStocks.length === 0) return null;

  const brackets = [
    { label: "强 (≥80)", min: 80, max: 101, color: "bg-red-500", textColor: "text-red-600" },
    { label: "中 (50-79)", min: 50, max: 80, color: "bg-orange-500", textColor: "text-orange-600" },
    { label: "弱 (30-49)", min: 30, max: 50, color: "bg-yellow-500", textColor: "text-yellow-600" },
    { label: "散 (<30)", min: 0, max: 30, color: "bg-gray-400", textColor: "text-gray-500" },
  ];

  const counts = brackets.map((b) => ({
    ...b,
    count: allStocks.filter((s) => s.lockStrength >= b.min && s.lockStrength < b.max).length,
  }));

  const maxCount = Math.max(...counts.map((c) => c.count), 1);

  return (
    <div className="space-y-1.5">
      {counts.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground w-[72px] shrink-0">{b.label}</span>
          <div className="flex-1 h-3 bg-muted/30 rounded-sm overflow-hidden">
            <div
              className={`h-full rounded-sm ${b.color} transition-all`}
              style={{ width: `${(b.count / maxCount) * 100}%` }}
            />
          </div>
          <span className={`text-[11px] font-mono w-6 text-right ${b.textColor}`}>{b.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Sector Card with news analysis and stocks table */
function SectorCard({
  sector,
  sectorIndex,
  onSelectStock,
  watchlist,
  onToggleWatchlist,
}: {
  sector: SectorAnalysis;
  sectorIndex: number;
  onSelectStock?: (symbol: string) => void;
  watchlist: WatchlistItem[];
  onToggleWatchlist: (stock: LimitUpStock) => void;
}) {
  // Summary stats
  const totalLimitUp = sector.stocks.length;
  const avgLockStrength = totalLimitUp > 0
    ? Math.round(sector.stocks.reduce((s, st) => s + st.lockStrength, 0) / totalLimitUp)
    : 0;
  const maxConsecutiveStock = sector.stocks.reduce(
    (best, st) => (st.consecutiveDays > (best?.consecutiveDays ?? 0) ? st : best),
    sector.stocks[0] as LimitUpStock | undefined,
  );

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-red-500" />
            <CardTitle className="text-base font-semibold">{sector.sectorName}</CardTitle>
            <Badge
              variant="outline"
              className="text-xs py-0 px-1.5 font-mono bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400"
            >
              <ArrowUpRight className="w-3 h-3" />
              {sector.sectorChangePercent.toFixed(2)}%
            </Badge>
            <Badge
              variant="outline"
              className="text-xs py-0 px-1.5 bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
            >
              <Shield className="w-3 h-3" />
              {sector.limitUpCount}只涨停 / {sector.totalStocks}只成分股
            </Badge>
          </div>
        </div>
        {/* Summary bar */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1.5">
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-red-500" />
            涨停 <span className="font-mono font-semibold text-foreground">{totalLimitUp}</span> 只
          </span>
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-orange-500" />
            平均封板 <span className={`font-mono font-semibold ${getLockStrengthTextColor(avgLockStrength)}`}>{avgLockStrength}%</span>
          </span>
          {maxConsecutiveStock && maxConsecutiveStock.consecutiveDays > 1 && (
            <span className="flex items-center gap-1">
              <Crown className="w-3 h-3 text-yellow-500" />
              连板王 <span className="font-mono font-semibold text-red-600">{maxConsecutiveStock.name}</span>
              <span className="text-red-600">{maxConsecutiveStock.consecutiveDays}连板</span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* News Analysis Section */}
        <NewsAnalysisSection newsAnalysis={sector.newsAnalysis} />

        <Separator />

        {/* Stocks Table */}
        {sector.stocks.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-xs">该板块暂无涨停个股</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent sticky top-0 bg-background z-10">
                  <TableHead className="text-[11px] font-medium w-[28px]"></TableHead>
                  <TableHead className="text-[11px] font-medium w-[62px]">代码</TableHead>
                  <TableHead className="text-[11px] font-medium w-[72px]">名称</TableHead>
                  <TableHead className="text-[11px] font-medium w-[56px]">涨停类型</TableHead>
                  <TableHead className="text-[11px] font-medium w-[52px]">封板时间</TableHead>
                  <TableHead className="text-[11px] font-medium w-[90px]">封板强度</TableHead>
                  <TableHead className="text-[11px] font-medium w-[52px]">开板次数</TableHead>
                  <TableHead className="text-[11px] font-medium w-[56px]">连板天数</TableHead>
                  <TableHead className="text-[11px] font-medium w-[48px]">量比</TableHead>
                  <TableHead className="text-[11px] font-medium w-[48px]">换手率</TableHead>
                  <TableHead className="text-[11px] font-medium w-[64px]">总市值</TableHead>
                  <TableHead className="text-[11px] font-medium w-[68px]">主力净流入</TableHead>
                  <TableHead className="text-[11px] font-medium w-[52px]">涨幅%</TableHead>
                  <TableHead className="text-[11px] font-medium min-w-[100px]">封板详情</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sector.stocks.map((stock, stockIndex) => {
                  const mainFlowColor = stock.mainNetInflow >= 0 ? "text-red-500" : "text-green-500";
                  const breakCountColor = stock.breakCount === 0
                    ? "text-emerald-600"
                    : stock.breakCount <= 2
                    ? "text-orange-500"
                    : "text-red-500";
                  const lockIcon = stock.lockStrength >= 80
                    ? <Lock className="w-3 h-3 text-red-500" />
                    : stock.breakCount > 0
                    ? <Unlock className="w-3 h-3 text-orange-500" />
                    : <Lock className="w-3 h-3 text-emerald-500" />;

                  const inWatchlist = watchlist.some((w) => w.symbol === stock.symbol);
                  const rank = stockIndex + 1;
                  const rowBg = stockIndex % 2 === 1 ? "bg-muted/20" : "";

                  return (
                    <TableRow
                      key={stock.symbol}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${rowBg}`}
                      onClick={() => onSelectStock?.(stock.symbol)}
                    >
                      {/* Star / Rank column */}
                      <TableCell className="py-1.5 pr-0 w-[28px]">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleWatchlist(stock);
                            }}
                            aria-label={inWatchlist ? `移除 ${stock.name} 从自选` : `添加 ${stock.name} 到自选`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 transition-colors ${
                                inWatchlist
                                  ? "text-yellow-500 fill-yellow-500"
                                  : "text-muted-foreground/40 hover:text-yellow-500"
                              }`}
                            />
                          </button>
                          {rank <= 3 && getRankBadge(rank)}
                        </div>
                      </TableCell>

                      {/* 代码 */}
                      <TableCell className="text-[11px] font-mono py-1.5">
                        {stock.symbol}
                      </TableCell>

                      {/* 名称 */}
                      <TableCell className="text-[11px] font-medium py-1.5 max-w-[72px] truncate">
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

                      {/* 涨停类型 */}
                      <TableCell className="py-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 font-medium ${getLimitUpTypeStyle(stock.limitUpType)}`}
                        >
                          {stock.limitUpType}
                        </Badge>
                      </TableCell>

                      {/* 封板时间 */}
                      <TableCell className="text-[11px] font-mono py-1.5">
                        <div className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {stock.lockTime}
                        </div>
                      </TableCell>

                      {/* 封板强度 */}
                      <TableCell className="py-1.5 pr-2">
                        <LockStrengthBar strength={stock.lockStrength} />
                      </TableCell>

                      {/* 开板次数 */}
                      <TableCell className="text-[11px] font-mono py-1.5">
                        <span className={breakCountColor}>
                          {stock.breakCount === 0 ? (
                            <span className="flex items-center gap-0.5">
                              <Lock className="w-3 h-3" />
                              0
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5">
                              <Unlock className="w-3 h-3" />
                              {stock.breakCount}
                            </span>
                          )}
                        </span>
                      </TableCell>

                      {/* 连板天数 */}
                      <TableCell className="py-1.5">
                        <ConsecutiveDaysBadge days={stock.consecutiveDays} />
                      </TableCell>

                      {/* 量比 */}
                      <TableCell className="text-[11px] font-mono py-1.5 text-muted-foreground">
                        {stock.volumeRatio > 0 ? stock.volumeRatio.toFixed(1) : "--"}
                      </TableCell>

                      {/* 换手率 */}
                      <TableCell className="text-[11px] font-mono py-1.5">
                        {stock.turnover.toFixed(2)}
                      </TableCell>

                      {/* 总市值 */}
                      <TableCell className="text-[11px] font-mono py-1.5 text-muted-foreground">
                        {formatMarketCap(stock.marketCap)}
                      </TableCell>

                      {/* 主力净流入 */}
                      <TableCell className={`text-[11px] font-mono py-1.5 ${mainFlowColor}`}>
                        {stock.mainNetInflow >= 0 ? "+" : ""}
                        {formatAmount(stock.mainNetInflow)}
                      </TableCell>

                      {/* 涨幅% */}
                      <TableCell className="text-[11px] font-mono py-1.5 font-medium text-red-500">
                        <div className="flex items-center gap-0.5">
                          <ArrowUpRight className="w-3 h-3" />
                          {stock.changePercent.toFixed(2)}%
                        </div>
                      </TableCell>

                      {/* 封板详情 */}
                      <TableCell className="text-[11px] py-1.5 text-muted-foreground max-w-[120px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block">{stock.pulseDetail}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[260px]">
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
  );
}

// ── Main Component ─────────────────────────────────────

export function LimitUpAnalysis({ onSelectStock }: LimitUpAnalysisProps) {
  const [result, setResult] = useState<LimitUpResult | null>(clientCache?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<string>(clientCache?.lastFetchTime ?? "");
  const [isFromCache, setIsFromCache] = useState(!!clientCache);
  // Tick state to force re-renders for cache countdown
  const [cacheTick, setCacheTick] = useState(0);

  // ── Watchlist state ──────────────────────────────────
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // ── Auto-refresh state ───────────────────────────────
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Load watchlist on mount
  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  // Listen for watchlist changes (from other tabs/components)
  useEffect(() => {
    const handler = () => {
      setWatchlist(loadWatchlist());
    };
    window.addEventListener("screener-watchlist-changed", handler);
    return () => window.removeEventListener("screener-watchlist-changed", handler);
  }, []);

  // Toggle watchlist for a stock
  const handleToggleWatchlist = useCallback((stock: LimitUpStock) => {
    if (isInWatchlist(stock.symbol)) {
      removeFromWatchlist(stock.symbol);
    } else {
      addToWatchlist(stock.symbol, stock.name, "limit-up", stock.price, stock.changePercent);
    }
    setWatchlist(loadWatchlist());
  }, []);

  const handleRemoveFromWatchlistSection = useCallback((symbol: string) => {
    removeFromWatchlist(symbol);
    setWatchlist(loadWatchlist());
  }, []);

  // ── Fetch data ────────────────────────────────────────
  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setIsFromCache(false);
    try {
      const params = new URLSearchParams();
      if (forceRefresh) params.set("refresh", "1");
      const res = await fetch(`/api/stock/limit-up?${params}`);
      const data: LimitUpResult = await res.json();

      if (data.success) {
        const fetchTime = new Date().toLocaleTimeString("zh-CN");
        setResult(data);
        setLastFetchTime(fetchTime);
        setIsFromCache(!!data.cached);
        // Update client cache
        clientCache = { result: data, lastFetchTime: fetchTime, timestamp: Date.now() };
      } else {
        setError(data.error || "涨停分析失败");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "网络错误";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount: use cache if fresh, otherwise fetch
  useEffect(() => {
    if (clientCache && Date.now() - clientCache.timestamp < CLIENT_CACHE_TTL) {
      setResult(clientCache.result);
      setLastFetchTime(clientCache.lastFetchTime);
      setIsFromCache(true);
    } else {
      fetchData();
    }
  }, [fetchData]);

  // Tick every second for cache countdown display
  useEffect(() => {
    if (!clientCache || !isFromCache) return;
    const interval = setInterval(() => {
      setCacheTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isFromCache]);

  // ── Auto-refresh during trading hours ────────────────
  useAutoRefresh(() => {
    fetchData(false);
  }, autoRefreshEnabled);

  // ── Cache remaining seconds ───────────────────────────
  const cacheRemaining = useMemo(() => {
    // cacheTick ensures re-evaluation every second
    void cacheTick;
    if (!clientCache) return 0;
    const elapsed = Date.now() - clientCache.timestamp;
    return Math.max(0, Math.ceil((CLIENT_CACHE_TTL - elapsed) / 1000));
  }, [cacheTick]);

  // ── Overall statistics ────────────────────────────────
  const allStocks = useMemo(
    () => result?.sectors.flatMap((s) => s.stocks) ?? [],
    [result],
  );

  const totalLimitUpCount = allStocks.length;

  // ── Render ────────────────────────────────────────────

  // Full-page loading (first load, no data)
  if (loading && !result) {
    return <LoadingSkeleton />;
  }

  // Error state with no data
  if (error && !result) {
    return <ErrorState error={error} onRetry={() => fetchData(true)} />;
  }

  // Empty state – success but no sectors
  if (result && result.sectors.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {/* Header still visible */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-red-500" />
                涨停分析
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(true)}
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
              <TrendingUp className="w-4 h-4 text-red-500" />
              <CardTitle className="text-base font-semibold">涨停分析</CardTitle>
              {result?.date && (
                <span className="text-xs text-muted-foreground">{result.date}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Auto-refresh toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={autoRefreshEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAutoRefreshEnabled((v) => !v)}
                      className={`h-7 text-xs gap-1 ${autoRefreshEnabled ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                    >
                      <Activity className="w-3 h-3" />
                      {autoRefreshEnabled ? "自动刷新" : "手动"}
                      {autoRefreshEnabled && isTradingHours() && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {autoRefreshEnabled
                      ? "交易时段自动每分钟刷新数据"
                      : "点击开启交易时段自动刷新"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {isFromCache && cacheRemaining > 0 && (
                <Badge
                  variant="outline"
                  className="text-[11px] py-0 px-1.5 gap-1 bg-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-300"
                >
                  <Database className="w-3 h-3" />
                  缓存 {cacheRemaining}s
                </Badge>
              )}
              {lastFetchTime && (
                <span className="text-[11px] text-muted-foreground">
                  更新于 {lastFetchTime}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(true)}
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
          {/* Summary stats */}
          {result && result.sectors.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                {result.sectors.length}个热门板块
              </span>
              <span className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-red-500" />
                共{totalLimitUpCount}只涨停
              </span>
              {result.cached && (
                <span className="flex items-center gap-1 text-blue-500">
                  <Database className="w-3 h-3" />
                  服务端缓存
                </span>
              )}
              {result.error && (
                <span className="flex items-center gap-1 text-orange-500">
                  <AlertCircle className="w-3 h-3" />
                  {result.error}
                </span>
              )}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* ── Watchlist Section ────────────────────────── */}
      <WatchlistSection
        watchlist={watchlist}
        onSelectStock={onSelectStock}
        onRemove={handleRemoveFromWatchlistSection}
      />

      {/* ── Overall Statistics Card ──────────────────── */}
      {result && result.sectors.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-orange-500" />
              <CardTitle className="text-sm font-semibold">整体统计</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {/* Sector Distribution */}
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-2 block">
                板块分布
              </span>
              <SectorDistributionChart sectors={result.sectors} />
            </div>

            <Separator />

            {/* Limit-Up Type Distribution */}
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-2 block">
                涨停类型分布
              </span>
              <LimitUpTypeDistribution sectors={result.sectors} />
            </div>

            <Separator />

            {/* Lock Strength Distribution */}
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-2 block">
                封板强度分布
              </span>
              <LockStrengthDistributionBar sectors={result.sectors} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Sector Cards ─────────────────────────────── */}
      {result?.sectors.map((sector, idx) => (
        <SectorCard
          key={sector.sectorCode}
          sector={sector}
          sectorIndex={idx}
          onSelectStock={onSelectStock}
          watchlist={watchlist}
          onToggleWatchlist={handleToggleWatchlist}
        />
      ))}

      {/* Loading overlay when refreshing with existing data */}
      {loading && result && (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground ml-2">正在刷新…</span>
        </div>
      )}
    </div>
  );
}
