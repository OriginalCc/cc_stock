"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, ArrowRight, RefreshCw,
  Zap, Target, ArrowUpRight, ArrowDownRight, BarChart3,
  Flame, Eye, Sparkles, ChevronRight, ChevronDown, ChevronUp,
  Users, Loader2, CalendarDays, CheckCircle2, XCircle, Clock,
  Database, PieChart,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────

interface SectorItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  turnover: number;
  amplitude: number;
  mainNetInflow: number;
  mainNetInflowRatio: number;
  stocksUp: number;
  stocksDown: number;
  leadingStock: string;
  leadingStockChange: number;
  leadingStockCode: string;
  superLargeNet: number;
  largeNet: number;
}

interface RotationPrediction {
  code: string;
  name: string;
  changePercent: number;
  mainNetInflow: number;
  turnover: number;
  score: number;
  reasons: string[];
  category: "capital_gathering" | "pullback_recovery" | "momentum_shift" | "adjacent_chain";
  categoryLabel: string;
}

interface SectorRotationData {
  success: boolean;
  timestamp: string;
  tradingPhase: string;
  hotSectorsByChange: SectorItem[];
  hotSectorsByCapital: SectorItem[];
  hotSectorsByVolume: SectorItem[];
  hotConceptSectors: SectorItem[];
  coolingSectors: SectorItem[];
  risingSectors: SectorItem[];
  predictions: RotationPrediction[];
  rotationSummary: string;
  error?: string;
  cached?: boolean;
}

// ── Sector Stock Types ─────────────────────────────────

interface SectorStock {
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
  amplitude: number;
  marketCap: number;
  circulatingMarketCap: number;
  pe: number;
  mainNetInflow: number;
  volumeRatio: number;
  isST: boolean;
  isETF: boolean;
  board: string;
  recommendScore: number;
  recommendTag: string;
  recommendReason: string;
}

// ── Prediction Record Type ─────────────────────────────

interface PredictionRecord {
  id: string;
  predictDate: string;
  sectorCode: string;
  sectorName: string;
  category: string;
  categoryLabel: string;
  score: number;
  reasons: string; // JSON { reasons: string[], stocks: StockRecord[] }
  predictChange: number;
  mainNetInflow: number;
  turnover: number;
  actualChange: number | null;
  actualMainNet: number | null;
  isVerified: boolean;
  verifiedAt: string | null;
  isCorrect: boolean | null;
  createdAt: string;
}

interface StockRecord {
  symbol: string;
  name: string;
  changePercent: number;
  mainNetInflow: number;
  volumeRatio: number;
  turnover: number;
  recommendScore: number;
  recommendTag: string;
}

interface PredictionHistoryStats {
  totalVerified: number;
  totalCorrect: number;
  accuracy: number;
  avgActualChange: number;
  categoryStats: Record<string, { total: number; correct: number; avgScore: number }>;
}

// ── Helper Functions ───────────────────────────────────

function formatAmount(val: number): string {
  if (Math.abs(val) >= 1e8) return `${(val / 1e8).toFixed(1)}亿`;
  if (Math.abs(val) >= 1e4) return `${(val / 1e4).toFixed(0)}万`;
  return val.toFixed(0);
}

function formatVolume(val: number): string {
  if (Math.abs(val) >= 1e8) return `${(val / 1e8).toFixed(1)}亿`;
  if (Math.abs(val) >= 1e4) return `${(val / 1e4).toFixed(0)}万`;
  return val.toFixed(0);
}

function formatMarketCap(val: number): string {
  const yi = val / 1e8;
  if (Math.abs(yi) >= 1) return `${yi.toFixed(0)}亿`;
  return `${(val / 1e4).toFixed(0)}万`;
}

function getChangeColor(change: number): string {
  if (change > 0) return "text-red-500";
  if (change < 0) return "text-green-500";
  return "text-muted-foreground";
}

function getChangeBg(change: number): string {
  if (change >= 3) return "bg-red-500/15 border-red-500/25";
  if (change >= 1.5) return "bg-red-500/10 border-red-500/20";
  if (change > 0) return "bg-red-500/5 border-red-500/15";
  if (change <= -3) return "bg-green-500/15 border-green-500/25";
  if (change <= -1.5) return "bg-green-500/10 border-green-500/20";
  return "bg-green-500/5 border-green-500/15";
}

function getCategoryStyle(category: string): { bg: string; text: string; icon: React.ReactNode } {
  switch (category) {
    case "capital_gathering":
      return { bg: "bg-amber-500/10 border-amber-500/25", text: "text-amber-600", icon: <Zap className="w-3.5 h-3.5" /> };
    case "pullback_recovery":
      return { bg: "bg-blue-500/10 border-blue-500/25", text: "text-blue-600", icon: <TrendingUp className="w-3.5 h-3.5" /> };
    case "momentum_shift":
      return { bg: "bg-purple-500/10 border-purple-500/25", text: "text-purple-600", icon: <ArrowRight className="w-3.5 h-3.5" /> };
    case "adjacent_chain":
      return { bg: "bg-teal-500/10 border-teal-500/25", text: "text-teal-600", icon: <BarChart3 className="w-3.5 h-3.5" /> };
    default:
      return { bg: "bg-muted border-border", text: "text-muted-foreground", icon: <Eye className="w-3.5 h-3.5" /> };
  }
}

function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "强烈关注", color: "text-red-500" };
  if (score >= 65) return { label: "重点关注", color: "text-amber-500" };
  if (score >= 50) return { label: "值得关注", color: "text-orange-500" };
  return { label: "一般关注", color: "text-muted-foreground" };
}

function getStockTagStyle(tag: string): { bg: string; text: string } {
  switch (tag) {
    case "龙头":
      return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-600" };
    case "蓄势":
      return { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-600" };
    case "补涨":
      return { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600" };
    default:
      return { bg: "bg-muted/50 border-border", text: "text-muted-foreground" };
  }
}

// Parse reasons JSON that may contain stocks data
function parseReasonsData(reasonsStr: string): { reasons: string[]; stocks: StockRecord[] } {
  try {
    const parsed = JSON.parse(reasonsStr);
    if (Array.isArray(parsed)) {
      // Old format: just an array of strings
      return { reasons: parsed, stocks: [] };
    }
    if (parsed && typeof parsed === "object") {
      return {
        reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
        stocks: Array.isArray(parsed.stocks) ? parsed.stocks : [],
      };
    }
    return { reasons: [], stocks: [] };
  } catch {
    return { reasons: [reasonsStr], stocks: [] };
  }
}

// ── Sub Components ─────────────────────────────────────

function SectorCard({ sector, rank, onClick }: { sector: SectorItem; rank: number; onClick?: (code: string) => void }) {
  const ratio = sector.stocksUp + sector.stocksDown > 0
    ? sector.stocksUp / (sector.stocksUp + sector.stocksDown)
    : 0;

  return (
    <div
      className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${getChangeBg(sector.changePercent)}`}
      onClick={() => onClick?.(sector.code)}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${rank <= 3 ? "bg-red-500 text-white" : rank <= 6 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"}`}>
            {rank}
          </span>
          <span className="font-semibold text-sm">{sector.name}</span>
        </div>
        <span className={`text-lg font-bold tabular-nums ${getChangeColor(sector.changePercent)}`}>
          {sector.changePercent >= 0 ? "+" : ""}{sector.changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1.5">
        <span>指数 {sector.price.toFixed(2)}</span>
        <span>成交 {formatVolume(sector.volume)}</span>
        {sector.turnover > 0 && <span>换手 {sector.turnover.toFixed(1)}%</span>}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <div className="flex-1 h-1.5 bg-green-500/30 rounded-full overflow-hidden">
          <div className="h-full bg-red-500/70 rounded-full" style={{ width: `${ratio * 100}%` }} />
        </div>
        <span className="text-red-500">{sector.stocksUp}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-green-500">{sector.stocksDown}</span>
      </div>
      {sector.leadingStock && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          领涨 <span className="text-foreground font-medium">{sector.leadingStock}</span>
          <span className={getChangeColor(sector.leadingStockChange)} ml-1>
            {sector.leadingStockChange >= 0 ? "+" : ""}{sector.leadingStockChange.toFixed(2)}%
          </span>
        </div>
      )}
      {sector.mainNetInflow !== 0 && (
        <div className={`mt-1 text-xs font-medium ${sector.mainNetInflow > 0 ? "text-red-500" : "text-green-500"}`}>
          {sector.mainNetInflow > 0 ? "主力流入" : "主力流出"} {formatAmount(Math.abs(sector.mainNetInflow))}
          {sector.mainNetInflowRatio !== 0 && (
            <span className="ml-1">({sector.mainNetInflowRatio >= 0 ? "+" : ""}{sector.mainNetInflowRatio.toFixed(1)}%)</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stock Row Component ────────────────────────────────

function StockRow({ stock, onSelectStock }: { stock: SectorStock; onSelectStock?: (symbol: string) => void }) {
  const tagStyle = getStockTagStyle(stock.recommendTag);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors rounded-md"
      onClick={() => onSelectStock?.(stock.symbol)}
    >
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0 w-[140px]">
        <span className="font-medium text-sm truncate">{stock.name}</span>
        <span className="text-xs text-muted-foreground">{stock.symbol}</span>
      </div>
      <Badge variant="outline" className={`${tagStyle.bg} ${tagStyle.text} border text-[10px] h-4 px-1 shrink-0`}>
        {stock.recommendTag}
      </Badge>
      <div className="flex items-center gap-1 shrink-0 w-[90px] justify-end">
        <span className={`text-sm font-semibold tabular-nums ${getChangeColor(stock.changePercent)}`}>
          {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="shrink-0 w-[80px] text-right">
        {stock.mainNetInflow !== 0 ? (
          <span className={`text-xs ${stock.mainNetInflow > 0 ? "text-red-500" : "text-green-500"}`}>
            {stock.mainNetInflow > 0 ? "+" : ""}{formatAmount(stock.mainNetInflow)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">--</span>
        )}
      </div>
      <div className="shrink-0 w-[50px] text-right">
        <span className={`text-xs ${stock.volumeRatio >= 2 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
          {stock.volumeRatio > 0 ? `${stock.volumeRatio.toFixed(1)}` : "--"}
        </span>
      </div>
      <div className="shrink-0 w-[50px] text-right">
        <span className={`text-xs ${stock.turnover >= 5 ? "text-orange-600 font-medium" : "text-muted-foreground"}`}>
          {stock.turnover > 0 ? `${stock.turnover.toFixed(1)}%` : "--"}
        </span>
      </div>
      <div className="shrink-0 w-[60px] text-right hidden sm:block">
        <span className="text-xs text-muted-foreground">
          {stock.marketCap > 0 ? formatMarketCap(stock.marketCap) : "--"}
        </span>
      </div>
      <div className="shrink-0 w-[40px] text-right">
        <span className={`text-xs font-bold ${stock.recommendScore >= 60 ? "text-red-500" : stock.recommendScore >= 40 ? "text-amber-500" : "text-muted-foreground"}`}>
          {stock.recommendScore}
        </span>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}

// ── Prediction Card with Expandable Stocks ─────────────

function PredictionCard({
  prediction,
  onClick,
  onSelectStock,
}: {
  prediction: RotationPrediction;
  onClick?: (code: string) => void;
  onSelectStock?: (symbol: string) => void;
}) {
  const style = getCategoryStyle(prediction.category);
  const { label, color } = getScoreLabel(prediction.score);
  const [expanded, setExpanded] = useState(false);
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stocksError, setStocksError] = useState<string | null>(null);

  const fetchStocks = useCallback(async () => {
    if (stocks.length > 0) return;
    setStocksLoading(true);
    setStocksError(null);
    try {
      const url = `/api/stock/sector-stocks?sectorCode=${encodeURIComponent(prediction.code)}&sectorName=${encodeURIComponent(prediction.name)}&sectorChange=${prediction.changePercent}&maxResults=8`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "获取个股失败");
      setStocks(json.stocks || []);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setStocksError(e.message || "加载失败");
    } finally {
      setStocksLoading(false);
    }
  }, [prediction.code, prediction.name, prediction.changePercent, stocks.length]);

  const handleToggle = useCallback(() => {
    if (!expanded) fetchStocks();
    setExpanded(prev => !prev);
  }, [expanded, fetchStocks]);

  return (
    <div className="border rounded-lg bg-card overflow-hidden transition-all hover:shadow-md">
      <div className="p-4 cursor-pointer" onClick={() => onClick?.(prediction.code)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${style.bg} ${style.text} border text-xs gap-1`}>
              {style.icon}
              {prediction.categoryLabel}
            </Badge>
            <span className="font-bold">{prediction.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${getChangeColor(prediction.changePercent)}`}>
              {prediction.changePercent >= 0 ? "+" : ""}{prediction.changePercent.toFixed(2)}%
            </span>
            <Badge className={`text-xs ${prediction.score >= 80 ? "bg-red-500" : prediction.score >= 65 ? "bg-amber-500" : "bg-orange-500"} text-white`}>
              {prediction.score}分
            </Badge>
          </div>
        </div>
        <div className="space-y-1">
          {prediction.reasons.map((reason, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-primary/60" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-xs font-medium ${color}`}>{label}</span>
          {prediction.mainNetInflow !== 0 && (
            <span className={`text-xs ${prediction.mainNetInflow > 0 ? "text-red-500" : "text-green-500"}`}>
              主力{prediction.mainNetInflow > 0 ? "流入" : "流出"} {formatAmount(Math.abs(prediction.mainNetInflow))}
            </span>
          )}
        </div>
      </div>

      <div
        className="border-t border-dashed px-4 py-2 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={handleToggle}
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground font-medium">
          {expanded ? "收起个股" : "查看推荐个股"}
        </span>
        <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-muted-foreground border-muted-foreground/30">仅主板</Badge>
        <Users className="w-3 h-3 text-muted-foreground" />
      </div>

      {expanded && (
        <div className="border-t">
          {stocksLoading ? (
            <div className="p-4 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">加载个股数据...</span>
            </div>
          ) : stocksError ? (
            <div className="p-4 text-center">
              <span className="text-sm text-destructive">{stocksError}</span>
              <Button variant="ghost" size="sm" className="ml-2 text-xs" onClick={fetchStocks}>重试</Button>
            </div>
          ) : stocks.length > 0 ? (
            <div className="py-2">
              <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-muted-foreground font-medium border-b">
                <span className="w-[140px] shrink-0">名称</span>
                <span className="shrink-0 w-[36px]">标签</span>
                <span className="shrink-0 w-[90px] text-right">涨跌幅</span>
                <span className="shrink-0 w-[80px] text-right">主力净额</span>
                <span className="shrink-0 w-[50px] text-right">量比</span>
                <span className="shrink-0 w-[50px] text-right">换手</span>
                <span className="shrink-0 w-[60px] text-right hidden sm:block">市值</span>
                <span className="shrink-0 w-[40px] text-right">评分</span>
                <span className="shrink-0 w-3.5" />
              </div>
              <div className="max-h-80 overflow-y-auto">
                {stocks.map((stock) => (
                  <StockRow key={stock.symbol} stock={stock} onSelectStock={onSelectStock} />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">暂无推荐个股</div>
          )}
        </div>
      )}
    </div>
  );
}

function CoolingSectorCard({ sector }: { sector: SectorItem }) {
  return (
    <div className="border border-amber-500/20 rounded-lg p-3 bg-amber-500/5">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm">{sector.name}</span>
        <span className={`text-sm font-medium ${getChangeColor(sector.changePercent)}`}>
          {sector.changePercent >= 0 ? "+" : ""}{sector.changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="text-xs text-amber-600">
        <ArrowDownRight className="w-3 h-3 inline" />
        主力净流出 {formatAmount(Math.abs(sector.mainNetInflow))}
        <span className="ml-1">({sector.mainNetInflowRatio.toFixed(1)}%)</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">涨幅尚在，但资金已开始撤退</div>
    </div>
  );
}

function RisingSectorCard({ sector }: { sector: SectorItem }) {
  return (
    <div className="border border-emerald-500/20 rounded-lg p-3 bg-emerald-500/5">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm">{sector.name}</span>
        <span className={`text-sm font-medium ${getChangeColor(sector.changePercent)}`}>
          {sector.changePercent >= 0 ? "+" : ""}{sector.changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="text-xs text-emerald-600">
        <ArrowUpRight className="w-3 h-3 inline" />
        主力净流入 {formatAmount(sector.mainNetInflow)}
        <span className="ml-1">({sector.mainNetInflowRatio.toFixed(1)}%)</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">资金介入中，涨幅尚未充分释放</div>
    </div>
  );
}

// ── Heat Map Visualization ─────────────────────────────

function SectorHeatMap({ sectors }: { sectors: SectorItem[] }) {
  const displaySectors = sectors.slice(0, 30);

  return (
    <div className="flex flex-wrap gap-1.5">
      {displaySectors.map((sector) => {
        const abs = Math.abs(sector.changePercent);
        const opacity = Math.min(abs / 5, 1);
        const isUp = sector.changePercent >= 0;

        return (
          <div key={sector.code} className="relative group" title={`${sector.name}: ${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent.toFixed(2)}%`}>
            <div
              className={`px-2 py-1 rounded text-xs font-medium cursor-default transition-all hover:scale-110 hover:shadow ${isUp ? `bg-red-500/10 text-red-600 border border-red-500/20` : `bg-green-500/10 text-green-600 border border-green-500/20`}`}
              style={{ opacity: 0.4 + opacity * 0.6 }}
            >
              {sector.name}
              <span className="ml-1 tabular-nums">{sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(1)}%</span>
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50 bg-popover border rounded-md shadow-lg p-2 text-xs whitespace-nowrap">
              <div className="font-semibold">{sector.name}</div>
              <div className={getChangeColor(sector.changePercent)}>{sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%</div>
              {sector.mainNetInflow !== 0 && (
                <div className={sector.mainNetInflow > 0 ? "text-red-500" : "text-green-500"}>
                  主力{sector.mainNetInflow > 0 ? "流入" : "流出"} {formatAmount(Math.abs(sector.mainNetInflow))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Rotation Flow Visualization ────────────────────────

function RotationFlowChart({ cooling, rising, predictions, onSelectStock }: {
  cooling: SectorItem[];
  rising: SectorItem[];
  predictions: RotationPrediction[];
  onSelectStock?: (symbol: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-amber-600">
            <TrendingDown className="w-4 h-4" />
            <span className="text-sm font-semibold">降温板块</span>
            <span className="text-xs text-muted-foreground">资金在撤退</span>
          </div>
          <div className="space-y-2">
            {cooling.length > 0 ? cooling.slice(0, 5).map((s) => (
              <CoolingSectorCard key={s.code} sector={s} />
            )) : (
              <div className="text-sm text-muted-foreground p-4 text-center border rounded-lg border-dashed">暂无明显降温板块</div>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-emerald-600">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-semibold">蓄势板块</span>
            <span className="text-xs text-muted-foreground">资金在介入</span>
          </div>
          <div className="space-y-2">
            {rising.length > 0 ? rising.slice(0, 5).map((s) => (
              <RisingSectorCard key={s.code} sector={s} />
            )) : (
              <div className="text-sm text-muted-foreground p-4 text-center border rounded-lg border-dashed">暂无明显蓄势板块</div>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-primary">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-semibold">明日轮动预测</span>
            <span className="text-xs text-muted-foreground">基于资金+形态</span>
          </div>
          <div className="space-y-2">
            {predictions.length > 0 ? predictions.slice(0, 5).map((p) => {
              const style = getCategoryStyle(p.category);
              return (
                <div key={p.code} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`${style.bg} ${style.text} border text-xs gap-1`}>
                        {style.icon}
                        {p.categoryLabel}
                      </Badge>
                      <span className="text-sm font-semibold">{p.name}</span>
                    </div>
                    <span className={`text-xs font-bold ${p.score >= 80 ? "text-red-500" : p.score >= 65 ? "text-amber-500" : "text-orange-500"}`}>
                      {p.score}分
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.reasons.join("；")}</div>
                </div>
              );
            }) : (
              <div className="text-sm text-muted-foreground p-4 text-center border rounded-lg border-dashed">数据不足，暂无预测</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Prediction History Tab ─────────────────────────────

function PredictionHistoryTab({ onSelectStock }: { onSelectStock?: (symbol: string) => void }) {
  const [records, setRecords] = useState<PredictionRecord[]>([]);
  const [stats, setStats] = useState<PredictionHistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [filterDate, setFilterDate] = useState<string>("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/stock/prediction-history?pageSize=200`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setRecords(json.records || []);
        setStats(json.stats || null);
        setAvailableDates(json.dates || []);
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("Fetch prediction history error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/stock/prediction-history?action=verify", { method: "POST", signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) await fetchHistory();
    } catch (e: any) {
      console.error("Verify predictions error:", e);
    } finally {
      setVerifying(false);
    }
  }, [fetchHistory]);

  const toggleRow = useCallback((id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredRecords = filterDate
    ? records.filter(r => r.predictDate === filterDate)
    : records;

  const groupedByDate = filteredRecords.reduce<Record<string, PredictionRecord[]>>((acc, r) => {
    if (!acc[r.predictDate]) acc[r.predictDate] = [];
    acc[r.predictDate].push(r);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground mb-1">已验证数</div>
            <div className="text-2xl font-bold">{stats.totalVerified}</div>
          </div>
          <div className="border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground mb-1">预测正确</div>
            <div className="text-2xl font-bold text-red-500">{stats.totalCorrect}</div>
          </div>
          <div className="border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground mb-1">准确率</div>
            <div className={`text-2xl font-bold ${stats.accuracy >= 60 ? "text-red-500" : stats.accuracy >= 40 ? "text-amber-500" : "text-green-500"}`}>
              {stats.accuracy.toFixed(1)}%
            </div>
          </div>
          <div className="border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground mb-1">次日平均涨幅</div>
            <div className={`text-2xl font-bold ${getChangeColor(stats.avgActualChange)}`}>
              {stats.avgActualChange >= 0 ? "+" : ""}{stats.avgActualChange.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Category accuracy */}
      {stats && stats.categoryStats && Object.keys(stats.categoryStats).length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <PieChart className="w-4 h-4" />
              分类准确率
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(stats.categoryStats).map(([cat, s]) => {
                const style = getCategoryStyle(cat);
                const catAccuracy = s.total > 0 ? (s.correct / s.total * 100) : 0;
                return (
                  <div key={cat} className={`border rounded-lg p-2.5 ${style.bg}`}>
                    <div className="flex items-center gap-1 mb-1">
                      {style.icon}
                      <span className={`text-xs font-medium ${style.text}`}>
                        {cat === "capital_gathering" ? "资金蓄势" : cat === "pullback_recovery" ? "回调企稳" : cat === "momentum_shift" ? "动能切换" : "产业链联动"}
                      </span>
                    </div>
                    <div className="text-lg font-bold">{catAccuracy.toFixed(0)}%</div>
                    <div className="text-[10px] text-muted-foreground">
                      {s.correct}/{s.total} 正确 · 平均评分{s.avgScore.toFixed(0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <select
            className="text-xs border rounded-md px-2 py-1.5 bg-card"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          >
            <option value="">全部日期</option>
            {availableDates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">共 {filteredRecords.length} 条记录</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={fetchHistory} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button variant="default" size="sm" className="text-xs" onClick={handleVerify} disabled={verifying}>
            {verifying ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            验证历史预测
          </Button>
        </div>
      </div>

      {/* History Table grouped by date */}
      {Object.keys(groupedByDate).length > 0 ? (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {Object.entries(groupedByDate).map(([date, dateRecords]) => (
            <Card key={date}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {date}
                  <Badge variant="outline" className="text-[10px]">
                    {dateRecords.length} 个预测
                  </Badge>
                  {dateRecords.some(r => r.isVerified) && (
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                      已验证 {dateRecords.filter(r => r.isVerified).length}/{dateRecords.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-1.5 px-2 font-medium w-5"></th>
                        <th className="text-left py-1.5 px-2 font-medium">板块</th>
                        <th className="text-center py-1.5 px-2 font-medium">类型</th>
                        <th className="text-center py-1.5 px-2 font-medium">评分</th>
                        <th className="text-right py-1.5 px-2 font-medium">当日涨跌</th>
                        <th className="text-right py-1.5 px-2 font-medium">次日涨跌</th>
                        <th className="text-center py-1.5 px-2 font-medium">结果</th>
                        <th className="text-left py-1.5 px-2 font-medium">预测理由</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateRecords.map((rec) => {
                        const style = getCategoryStyle(rec.category);
                        const { reasons: reasonsArr, stocks: stocksArr } = parseReasonsData(rec.reasons);
                        const isExpanded = expandedRows.has(rec.id);
                        return (
                          <React.Fragment key={rec.id}>
                            <tr className="border-b last:border-b-0 hover:bg-accent/30 cursor-pointer" onClick={() => toggleRow(rec.id)}>
                              <td className="py-2 px-2">
                                {stocksArr.length > 0 && (
                                  isExpanded
                                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                              </td>
                              <td className="py-2 px-2">
                                <span className="font-medium">{rec.sectorName}</span>
                                {stocksArr.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground ml-1">({stocksArr.length}只个股)</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <Badge variant="outline" className={`${style.bg} ${style.text} border text-[10px] h-4 px-1 gap-0.5`}>
                                  {style.icon}
                                  {rec.categoryLabel}
                                </Badge>
                              </td>
                              <td className="py-2 px-2 text-center">
                                <span className={`font-bold ${rec.score >= 80 ? "text-red-500" : rec.score >= 65 ? "text-amber-500" : "text-orange-500"}`}>
                                  {rec.score}
                                </span>
                              </td>
                              <td className={`py-2 px-2 text-right tabular-nums ${getChangeColor(rec.predictChange)}`}>
                                {rec.predictChange >= 0 ? "+" : ""}{rec.predictChange.toFixed(2)}%
                              </td>
                              <td className="py-2 px-2 text-right tabular-nums">
                                {rec.isVerified && rec.actualChange !== null ? (
                                  <span className={getChangeColor(rec.actualChange)}>
                                    {rec.actualChange >= 0 ? "+" : ""}{rec.actualChange.toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">--</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {rec.isVerified ? (
                                  rec.isCorrect ? (
                                    <CheckCircle2 className="w-4 h-4 text-red-500 mx-auto" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-green-500 mx-auto" />
                                  )
                                ) : (
                                  <Clock className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                                )}
                              </td>
                              <td className="py-2 px-2 text-muted-foreground max-w-[200px] truncate" title={reasonsArr.join("；")}>
                                {reasonsArr.join("；")}
                              </td>
                            </tr>
                            {/* Expanded stock recommendations */}
                            {isExpanded && stocksArr.length > 0 && (
                              <tr>
                                <td colSpan={8} className="px-2 pb-2">
                                  <div className="ml-4 border rounded-md bg-muted/20 overflow-hidden">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="border-b text-muted-foreground bg-muted/30">
                                          <th className="text-left py-1 px-2 font-medium">名称</th>
                                          <th className="text-left py-1 px-2 font-medium">代码</th>
                                          <th className="text-center py-1 px-2 font-medium">标签</th>
                                          <th className="text-right py-1 px-2 font-medium">涨跌幅</th>
                                          <th className="text-right py-1 px-2 font-medium">主力净额</th>
                                          <th className="text-right py-1 px-2 font-medium">量比</th>
                                          <th className="text-right py-1 px-2 font-medium">换手</th>
                                          <th className="text-right py-1 px-2 font-medium">评分</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {stocksArr.map((stock) => {
                                          const tagStyle = getStockTagStyle(stock.recommendTag);
                                          return (
                                            <tr
                                              key={stock.symbol}
                                              className="border-b last:border-b-0 hover:bg-accent/30 cursor-pointer"
                                              onClick={(e) => { e.stopPropagation(); onSelectStock?.(stock.symbol); }}
                                            >
                                              <td className="py-1 px-2 font-medium">{stock.name}</td>
                                              <td className="py-1 px-2 text-muted-foreground">{stock.symbol}</td>
                                              <td className="py-1 px-2 text-center">
                                                <Badge variant="outline" className={`${tagStyle.bg} ${tagStyle.text} border text-[9px] h-3.5 px-1`}>
                                                  {stock.recommendTag}
                                                </Badge>
                                              </td>
                                              <td className={`py-1 px-2 text-right tabular-nums ${getChangeColor(stock.changePercent)}`}>
                                                {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
                                              </td>
                                              <td className={`py-1 px-2 text-right ${stock.mainNetInflow > 0 ? "text-red-500" : stock.mainNetInflow < 0 ? "text-green-500" : "text-muted-foreground"}`}>
                                                {stock.mainNetInflow !== 0 ? formatAmount(stock.mainNetInflow) : "--"}
                                              </td>
                                              <td className="py-1 px-2 text-right text-muted-foreground">
                                                {stock.volumeRatio > 0 ? stock.volumeRatio.toFixed(1) : "--"}
                                              </td>
                                              <td className="py-1 px-2 text-right text-muted-foreground">
                                                {stock.turnover > 0 ? `${stock.turnover.toFixed(1)}%` : "--"}
                                              </td>
                                              <td className={`py-1 px-2 text-right font-bold ${stock.recommendScore >= 60 ? "text-red-500" : stock.recommendScore >= 40 ? "text-amber-500" : "text-muted-foreground"}`}>
                                                {stock.recommendScore}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无预测历史记录</p>
            <p className="text-xs mt-1">在"明日预测"标签页中，预测数据会自动保存</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

interface SectorRotationPanelProps {
  onSelectStock?: (symbol: string) => void;
}

export function SectorRotationPanel({ onSelectStock }: SectorRotationPanelProps) {
  const [data, setData] = useState<SectorRotationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"hot" | "rotation" | "prediction" | "concept" | "history">("hot");
  const [subTab, setSubTab] = useState<"change" | "capital" | "volume">("change");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedPredictionsRef = useRef<string>("");

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/stock/sector-rotation${forceRefresh ? "?refresh=1" : ""}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "获取数据失败");
      setData(json);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setError(e.message || "未知错误");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-save predictions when data changes
  useEffect(() => {
    if (!data?.predictions || data.predictions.length === 0) return;

    // Create a hash to avoid re-saving the same predictions
    const predictionKey = data.predictions.map(p => `${p.code}:${p.score}`).join("|");
    if (savedPredictionsRef.current === predictionKey) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        // Fetch stocks for each prediction before saving
        const predictionsWithStocks = await Promise.all(
          data.predictions.map(async (pred) => {
            try {
              const url = `/api/stock/sector-stocks?sectorCode=${encodeURIComponent(pred.code)}&sectorName=${encodeURIComponent(pred.name)}&sectorChange=${pred.changePercent}&maxResults=5`;
              const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
              if (!res.ok) return pred;
              const json = await res.json();
              if (!json.success || !json.stocks) return pred;
              return {
                ...pred,
                stocks: json.stocks.map((s: SectorStock) => ({
                  symbol: s.symbol,
                  name: s.name,
                  changePercent: s.changePercent,
                  mainNetInflow: s.mainNetInflow,
                  volumeRatio: s.volumeRatio,
                  turnover: s.turnover,
                  recommendScore: s.recommendScore,
                  recommendTag: s.recommendTag,
                })),
              };
            } catch {
              return pred;
            }
          })
        );

        const res = await fetch("/api/stock/prediction-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ predictions: predictionsWithStocks }),
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          savedPredictionsRef.current = predictionKey;
        }
      } catch (e) {
        console.error("Auto-save predictions error:", e);
      }
    }, 8000); // 8 second debounce - wait for stocks to be fetched

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [data?.predictions]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchData();
    const timer = setInterval(() => {
      if (document.hidden) return;
      const now = new Date();
      const h = now.getHours();
      const isTradingHours = (h >= 9 && h < 15);
      if (isTradingHours) fetchData(true);
    }, 30_000);
    timerRef.current = timer;
    return () => clearInterval(timer);
  }, [fetchData]);

  const handleSectorClick = useCallback((code: string) => {
    console.log("Sector clicked:", code);
  }, []);

  // ── Loading State ──
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  // ── Error State ──
  if (error && !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={() => fetchData(true)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const currentSectors = subTab === "change"
    ? data.hotSectorsByChange
    : subTab === "capital"
    ? data.hotSectorsByCapital
    : data.hotSectorsByVolume;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Flame className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-bold">板块轮动</h2>
          </div>
          <Badge variant="outline" className="text-xs">
            {data.tradingPhase}
          </Badge>
          {data.rotationSummary && (
            <span className="text-xs text-muted-foreground hidden lg:inline max-w-md truncate">
              {data.rotationSummary}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => fetchData(true)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="hot" className="gap-1">
            <Flame className="w-3.5 h-3.5" />
            热点板块
          </TabsTrigger>
          <TabsTrigger value="concept" className="gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            概念板块
          </TabsTrigger>
          <TabsTrigger value="rotation" className="gap-1">
            <ArrowRight className="w-3.5 h-3.5" />
            轮动分析
          </TabsTrigger>
          <TabsTrigger value="prediction" className="gap-1">
            <Target className="w-3.5 h-3.5" />
            明日预测
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <Database className="w-3.5 h-3.5" />
            预测验证
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Hot Sectors Tab ── */}
      {activeTab === "hot" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {(["change", "capital", "volume"] as const).map((tab) => (
              <Button key={tab} variant={subTab === tab ? "default" : "outline"} size="sm" onClick={() => setSubTab(tab)} className="text-xs">
                {tab === "change" && "涨幅排行"}
                {tab === "capital" && "资金流向"}
                {tab === "volume" && "成交额"}
              </Button>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                行业板块热力图
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <SectorHeatMap sectors={data.hotSectorsByChange} />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {currentSectors.slice(0, 20).map((sector, idx) => (
              <SectorCard key={sector.code} sector={sector} rank={idx + 1} onClick={handleSectorClick} />
            ))}
          </div>
        </div>
      )}

      {/* ── Concept Sectors Tab ── */}
      {activeTab === "concept" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                概念板块热力图
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <SectorHeatMap sectors={data.hotConceptSectors} />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.hotConceptSectors.slice(0, 24).map((sector, idx) => (
              <SectorCard key={sector.code} sector={sector} rank={idx + 1} onClick={handleSectorClick} />
            ))}
          </div>
        </div>
      )}

      {/* ── Rotation Analysis Tab ── */}
      {activeTab === "rotation" && (
        <RotationFlowChart
          cooling={data.coolingSectors}
          rising={data.risingSectors}
          predictions={data.predictions}
          onSelectStock={onSelectStock}
        />
      )}

      {/* ── Prediction Tab ── */}
      {activeTab === "prediction" && (
        <div className="space-y-4">
          {data.predictions.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database className="w-3.5 h-3.5" />
              <span>预测数据将自动保存到"预测验证"中（含推荐个股），便于追踪验证</span>
            </div>
          )}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-muted-foreground">预测类型：</span>
                {[
                  { cat: "capital_gathering", label: "资金蓄势", desc: "主力大量流入但涨幅尚低" },
                  { cat: "pullback_recovery", label: "回调企稳", desc: "下跌中有主力逆势吸筹" },
                  { cat: "momentum_shift", label: "动能切换", desc: "换手活跃且资金流入加速" },
                  { cat: "adjacent_chain", label: "产业链联动", desc: "相关热门板块的上游/下游" },
                ].map(({ cat, label, desc }) => {
                  const style = getCategoryStyle(cat);
                  return (
                    <div key={cat} className="flex items-center gap-1">
                      <Badge variant="outline" className={`${style.bg} ${style.text} border text-xs gap-0.5`}>
                        {style.icon}
                        {label}
                      </Badge>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {data.predictions.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {data.predictions.map((pred) => (
                <PredictionCard key={pred.code} prediction={pred} onClick={handleSectorClick} onSelectStock={onSelectStock} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>当前暂无明确的轮动预测信号</p>
                <p className="text-xs mt-1">交易时间数据更准确，请在盘中查看</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Prediction History Tab ── */}
      {activeTab === "history" && <PredictionHistoryTab onSelectStock={onSelectStock} />}
    </div>
  );
}
