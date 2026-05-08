"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Customized,
} from "recharts";
import { useStockData, type TimeInterval, type StockSearchResult, type KLineItem, type TimelineItem, type ChartMode } from "@/hooks/use-stock-data";
import { StockScreener } from "@/components/stock-screener";
import { LimitUpAnalysis } from "@/components/limit-up-analysis";
import { StrategyAdminPanel } from "@/components/strategy-admin-panel";
import { TimeSharingPanel, MiniTimelinePanel } from "@/components/time-sharing-panel";
import { calculateMACD } from "@/lib/indicators";
import { generateTimelineSignals as generateOptimizedSignals, getTimeWindow, detectMarketRegime, detectMarketRegimeDetail, buildFactorOverridesFromDB, computeKeyPriceLevels, type TSignal as OptimizedTSignal, type TimeWindow, type MarketRegime, type FactorOverride, type RegimeDetail, type Strength, type CustomFactorDefinition as EngineCustomFactorDefinition, STRATEGY_OVERVIEW } from "@/lib/t-strategy";
import { generateTimelineSignals, detectPulseVolumeMarkers, type PulseVolumeMarker, type TSignal, type CustomFactorDefinition, formatVolume, formatNum, formatMarketCap, REGIME_CONFIG, T_MODE_CONFIG, DEFAULT_ASHARES, INTERVALS, INDEX_CONFIG, INDEX_KEYS, SIGNAL_PULSE_CSS, playAlertSound, getTIndexColor, getTIndexLabel, getTIndexLabelColor } from "@/lib/chart-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  X,
  Clock,
  Zap,
  LineChart,
  CandlestickChart,
  GitBranch,
  Shield,
  RefreshCw,
  Star,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Bell,
  BellOff,
  Volume2,
  Newspaper,
  Loader2,
  ExternalLink,
  Filter,
  History,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Target,
  Timer,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  Trophy,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────

// Constants are now imported from @/lib/chart-shared

// ── Market Index Configuration (深证/沪指/创业板) ──
// INDEX_CONFIG and INDEX_KEYS are now imported from @/lib/chart-shared

// REGIME_CONFIG and T_MODE_CONFIG are now imported from @/lib/chart-shared

// playAlertSound is now imported from @/lib/chart-shared

// T-Index color helpers are now imported from @/lib/chart-shared

// SIGNAL_PULSE_CSS is now imported from @/lib/chart-shared

// ── Candlestick Renderer ──────────────────────────────

function CandlestickRenderer(props: any) {
  const { formattedGraphicalItems, xAxisMap, yAxisMap } = props;
  if (!formattedGraphicalItems || !xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;
  if (!xAxis || !yAxis) return null;

  const yScale = yAxis.scale;
  let barData: any[] = [];
  for (const item of formattedGraphicalItems) {
    if (item?.props?.data && Array.isArray(item.props.data)) {
      barData = item.props.data;
      break;
    }
  }
  if (barData.length === 0) return null;

  const sampleEntry = barData[0];
  const barWidth = sampleEntry?.width || 4;

  // Adjust candle body width proportionally, ensure minimum visibility
  const candleBodyRatio = barWidth > 8 ? 0.6 : barWidth > 5 ? 0.7 : 0.8;

  return (
    <g>
      {barData.map((entry: any, i: number) => {
        const { x, payload } = entry;
        if (!payload || !payload.close) return null;
        const { open, close, high, low } = payload;
        if (!open || !high || !low) return null;

        const isUp = close >= open;
        const color = isUp ? "#ef4444" : "#22c55e";

        const yHigh = yScale(high);
        const yLow = yScale(low);
        const yOpen = yScale(open);
        const yClose = yScale(close);

        const bodyTop = Math.min(yOpen, yClose);
        const bodyBottom = Math.max(yOpen, yClose);
        const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
        const centerX = x + barWidth / 2;
        const bodyWidth = Math.max(barWidth * candleBodyRatio, 2);

        return (
          <g key={`candle-${i}`}>
            <line x1={centerX} y1={yHigh} x2={centerX} y2={bodyTop} stroke={color} strokeWidth={1} />
            <line x1={centerX} y1={bodyBottom} x2={centerX} y2={yLow} stroke={color} strokeWidth={1} />
            <rect x={centerX - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={isUp ? "transparent" : color} stroke={color} strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}

// ── Custom Tooltips ───────────────────────────────────

const KLineTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data) return null;

  const isUp = data.close >= data.open;
  const color = isUp ? "text-red-500" : "text-green-500";

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[180px]">
      <div className="font-medium mb-2 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">开盘</span>
        <span className={`text-right font-mono ${color}`}>{data.open.toFixed(2)}</span>
        <span className="text-muted-foreground">收盘</span>
        <span className={`text-right font-mono ${color}`}>{data.close.toFixed(2)}</span>
        <span className="text-muted-foreground">最高</span>
        <span className="text-right font-mono text-red-500">{data.high.toFixed(2)}</span>
        <span className="text-muted-foreground">最低</span>
        <span className="text-right font-mono text-green-500">{data.low.toFixed(2)}</span>
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
        {data.ma5 != null && (
          <>
            <span className="text-muted-foreground">MA5</span>
            <span className="text-right font-mono text-yellow-500">{data.ma5!.toFixed(2)}</span>
          </>
        )}
        {data.ma10 != null && (
          <>
            <span className="text-muted-foreground">MA10</span>
            <span className="text-right font-mono text-blue-500">{data.ma10!.toFixed(2)}</span>
          </>
        )}
        {data.ma20 != null && (
          <>
            <span className="text-muted-foreground">MA20</span>
            <span className="text-right font-mono text-purple-500">{data.ma20!.toFixed(2)}</span>
          </>
        )}
      </div>
      {data.dif != null && (
        <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-y-1 gap-x-3">
          <span className="text-muted-foreground">DIF</span>
          <span className="text-right font-mono">{data.dif.toFixed(4)}</span>
          <span className="text-muted-foreground">DEA</span>
          <span className="text-right font-mono">{data.dea?.toFixed(4)}</span>
          <span className="text-muted-foreground">MACD</span>
          <span className={`text-right font-mono ${data.macd != null && data.macd > 0 ? "text-red-500" : "text-green-500"}`}>
            {data.macd?.toFixed(4)}
          </span>
        </div>
      )}
      {data.signal && data.signal.type !== "hold" && (
        <div className="mt-2 pt-2 border-t border-border">
          <Badge variant={data.signal.type === "buy" ? "default" : "destructive"} className="text-xs">
            {data.signal.type === "buy" ? "买入" : "卖出"} · {data.signal.reason}
          </Badge>
        </div>
      )}
    </div>
  );
};

const MACDTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data || data.dif == null) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <div className="font-medium mb-2 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">DIF</span>
        <span className="text-right font-mono">{data.dif.toFixed(4)}</span>
        <span className="text-muted-foreground">DEA</span>
        <span className="text-right font-mono">{data.dea?.toFixed(4)}</span>
        <span className="text-muted-foreground">MACD</span>
        <span className={`text-right font-mono ${data.macd != null && data.macd > 0 ? "text-red-500" : "text-green-500"}`}>
          {data.macd?.toFixed(4)}
        </span>
      </div>
    </div>
  );
};

const VolumeTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as KLineItem;
  if (!data) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs min-w-[140px]">
      <div className="font-medium mb-1 text-foreground">{data.date}</div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-3">
        <span className="text-muted-foreground">成交量</span>
        <span className="text-right font-mono">{formatVolume(data.volume)}</span>
      </div>
    </div>
  );
};

// ── Helper functions are now imported from @/lib/chart-shared ──

// Signal generation functions are now imported from @/lib/chart-shared

// TimeSharingPanel & MiniTimelinePanel extracted to @/components/time-sharing-panel
// StrategyAdminPanel extracted to @/components/strategy-admin-panel
// ── Main Component ────────────────────────────────────

  {
    let maxSurgeRate = 0;
    let surgeStartIdx = 0;
    let surgeEndIdx = 0;
    const windowSize = 5;

    for (let i = 0; i <= session.length - windowSize; i++) {
      const startPrice = session[i].price;
      const endPrice = session[i + windowSize - 1].price;
      if (startPrice <= 0) continue;
      const surgeRate = ((endPrice - startPrice) / startPrice) * 100;
      if (surgeRate > maxSurgeRate) {
        maxSurgeRate = surgeRate;
        surgeStartIdx = i;
        surgeEndIdx = i + windowSize - 1;
      }
    }

    // Open-to-high in window
    const openPrice = session[0].price;
    const sessionHigh = Math.max(...session.map(t => t.price));
    const openToHighRate = openPrice > 0 ? ((sessionHigh - openPrice) / openPrice) * 100 : 0;

    // Peak then pullback
    let peakIdx = 0;
    let peakPrice = 0;
    for (let i = 0; i < session.length; i++) {
      if (session[i].price > peakPrice) {
        peakPrice = session[i].price;
        peakIdx = i;
      }
    }
    const lastPrice = session[session.length - 1].price;
    const pullbackRate = peakPrice > 0 ? ((peakPrice - lastPrice) / peakPrice) * 100 : 0;

    // Volume spike at peak
    const avgVol = session.reduce((sum, t) => sum + t.volume, 0) / session.length;
    const peakVol = session[peakIdx]?.volume || 0;
    const volRatio = avgVol > 0 ? peakVol / avgVol : 1;

    // Gap up
    const gapUpRate = openPrice > 0 && prevClose > 0 ? ((openPrice - prevClose) / prevClose) * 100 : 0;

    // Composite pulse score (same logic as backend)
    let pulseScore = 0;
    if (maxSurgeRate >= 3) pulseScore += 35;
    else if (maxSurgeRate >= 2) pulseScore += 25;
    else if (maxSurgeRate >= 1.5) pulseScore += 20;
    else if (maxSurgeRate >= 1) pulseScore += 12;
    else if (maxSurgeRate >= 0.5) pulseScore += 5;

    if (openToHighRate >= 3) pulseScore += 25;
    else if (openToHighRate >= 2) pulseScore += 18;
    else if (openToHighRate >= 1.5) pulseScore += 12;
    else if (openToHighRate >= 1) pulseScore += 8;
    else if (openToHighRate >= 0.5) pulseScore += 3;

    if (pullbackRate >= 0.5 && pullbackRate <= 5 && peakIdx < session.length - 2) pulseScore += 15;
    else if (pullbackRate > 0 && peakIdx < session.length / 2) pulseScore += 8;

    if (volRatio >= 2) pulseScore += 10;
    else if (volRatio >= 1.5) pulseScore += 6;
    else if (volRatio >= 1.2) pulseScore += 3;

    if (gapUpRate >= 1) pulseScore += 10;
    else if (gapUpRate >= 0.5) pulseScore += 5;
    else if (gapUpRate > 0) pulseScore += 2;

    pulseScore = Math.min(pulseScore, 100);

    if (pulseScore >= 10) {
      // Mark at the peak time (most dramatic point of the pulse)
      const peakTime = session[peakIdx].time;
      const details: string[] = [];
      if (maxSurgeRate >= 1) details.push(`${session[surgeStartIdx].time}-${session[surgeEndIdx].time}飙升${maxSurgeRate.toFixed(1)}%`);
      if (openToHighRate >= 1) details.push(`冲高${openToHighRate.toFixed(1)}%`);
      if (gapUpRate >= 0.5) details.push(`跳空${gapUpRate.toFixed(1)}%`);
      if (pullbackRate >= 0.3 && peakIdx < session.length - 2) details.push(`回落${pullbackRate.toFixed(1)}%`);
      if (volRatio >= 1.5) details.push(`放量${volRatio.toFixed(1)}x`);

      markers.push({
        time: peakTime,
        type: "pulse",
        score: pulseScore,
        label: pulseScore >= 50 ? `强脉冲 ${pulseScore}分` : pulseScore >= 30 ? `脉冲 ${pulseScore}分` : `微脉冲 ${pulseScore}分`,
        detail: details.length > 0 ? details.join("，") : "轻微脉冲",
      });
    }
  }

  // ── Volume Surge Detection ──
  {
    // Calculate incremental volumes
    const increments: { time: string; price: number; vol: number; priceChange: number }[] = [];
    for (let i = 0; i < session.length; i++) {
      const prevVol = i > 0 ? session[i - 1].volume : 0;
      const curVol = session[i].volume;
      const vol = i === 0 ? curVol : Math.max(0, curVol - prevVol);
      const prevPrice = i > 0 ? session[i - 1].price : prevClose;
      const priceChange = prevPrice > 0 ? ((session[i].price - prevPrice) / prevPrice) * 100 : 0;
      increments.push({ time: session[i].time, price: session[i].price, vol, priceChange });
    }

    const avgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
    const maxVol = Math.max(...increments.map(t => t.vol));
    const maxVolIdx = increments.findIndex(t => t.vol === maxVol);
    const volumeRatio = avgVol > 0 ? maxVol / avgVol : 1;
    const maxVolPriceChange = increments[maxVolIdx]?.priceChange || 0;

    // Progressive volume increase (递增放量)
    let maxProgressiveLen = 1;
    let curProgressiveLen = 1;
    let progressiveStart = 0;
    let bestProgressiveStart = 0;
    for (let i = 1; i < increments.length; i++) {
      if (increments[i].vol > increments[i - 1].vol && increments[i].vol > 0) {
        curProgressiveLen++;
        if (curProgressiveLen > maxProgressiveLen) {
          maxProgressiveLen = curProgressiveLen;
          bestProgressiveStart = progressiveStart;
        }
      } else {
        curProgressiveLen = 1;
        progressiveStart = i;
      }
    }

    const progressivePriceRise = maxProgressiveLen >= 3
      ? (() => {
          const startP = increments[bestProgressiveStart]?.price || 0;
          const endP = increments[bestProgressiveStart + maxProgressiveLen - 1]?.price || 0;
          return startP > 0 ? ((endP - startP) / startP) * 100 : 0;
        })()
      : 0;

    // Window volume vs baseline
    const baselineVol = increments.slice(0, Math.min(5, increments.length))
      .reduce((s, t) => s + t.vol, 0) / Math.min(5, increments.length);
    const windowAvgVol = increments.reduce((s, t) => s + t.vol, 0) / increments.length;
    const windowVolRatio = baselineVol > 0 ? windowAvgVol / baselineVol : 1;

    // Window price gain
    const windowStartPrice = session[0].price;
    const windowEndPrice = session[session.length - 1].price;
    const windowPriceGain = windowStartPrice > 0 ? ((windowEndPrice - windowStartPrice) / windowStartPrice) * 100 : 0;

    // Up-minutes with above-average volume
    const upWithHighVol = increments.filter(t => t.priceChange > 0 && t.vol > avgVol).length;
    const upHighVolRatio = increments.length > 0 ? upWithHighVol / increments.length : 0;

    // Composite volume surge score (same logic as backend)
    let volSurgeScore = 0;
    if (volumeRatio >= 3 && maxVolPriceChange > 0.3) volSurgeScore += 30;
    else if (volumeRatio >= 2.5 && maxVolPriceChange > 0.2) volSurgeScore += 25;
    else if (volumeRatio >= 2 && maxVolPriceChange > 0.1) volSurgeScore += 20;
    else if (volumeRatio >= 1.5 && maxVolPriceChange > 0) volSurgeScore += 12;
    else if (volumeRatio >= 1.5) volSurgeScore += 5;

    if (maxProgressiveLen >= 5 && progressivePriceRise > 0.5) volSurgeScore += 25;
    else if (maxProgressiveLen >= 4 && progressivePriceRise > 0.3) volSurgeScore += 20;
    else if (maxProgressiveLen >= 3 && progressivePriceRise > 0.1) volSurgeScore += 15;
    else if (maxProgressiveLen >= 3) volSurgeScore += 5;

    if (windowVolRatio >= 2) volSurgeScore += 15;
    else if (windowVolRatio >= 1.5) volSurgeScore += 10;
    else if (windowVolRatio >= 1.2) volSurgeScore += 5;

    if (windowPriceGain >= 2 && upHighVolRatio >= 0.3) volSurgeScore += 15;
    else if (windowPriceGain >= 1 && upHighVolRatio >= 0.2) volSurgeScore += 10;
    else if (windowPriceGain >= 0.5 && upHighVolRatio >= 0.15) volSurgeScore += 5;

    if (upHighVolRatio >= 0.4) volSurgeScore += 10;
    else if (upHighVolRatio >= 0.3) volSurgeScore += 6;
    else if (upHighVolRatio >= 0.2) volSurgeScore += 3;

    if (volumeRatio >= 2 && maxVolPriceChange > 0) volSurgeScore += 5;

    volSurgeScore = Math.min(volSurgeScore, 100);

    if (volSurgeScore >= 10) {
      // Mark at the peak volume time
      const markTime = increments[maxVolIdx]?.time || session[0].time;
      const details: string[] = [];
      if (volumeRatio >= 1.5) details.push(`${increments[maxVolIdx]?.time || ""}量比${volumeRatio.toFixed(1)}x`);
      if (maxProgressiveLen >= 3) details.push(`${maxProgressiveLen}分钟递增放量${progressivePriceRise > 0 ? `涨${progressivePriceRise.toFixed(1)}%` : ""}`);
      if (windowPriceGain >= 0.5) details.push(`时段涨${windowPriceGain.toFixed(1)}%`);
      if (upHighVolRatio >= 0.2) details.push(`${(upHighVolRatio * 100).toFixed(0)}%放量上涨`);

      markers.push({
        time: markTime,
        type: "volume_surge",
        score: volSurgeScore,
        label: volSurgeScore >= 50 ? `强放量 ${volSurgeScore}分` : volSurgeScore >= 30 ? `放量 ${volSurgeScore}分` : `微放量 ${volSurgeScore}分`,
        detail: details.length > 0 ? details.join("，") : "轻微放量",
      });
    }
  }

  return markers;
}

// TimeSharingPanel & MiniTimelinePanel extracted to @/components/time-sharing-panel
// StrategyAdminPanel extracted to @/components/strategy-admin-panel
// ── Main Component ────────────────────────────────────

export default function StockTAssistant() {
  const {
    symbol,
    quote,
    history,
    timeline,
    timelinePrevClose,
    interval,
    chartMode,
    loading,
    error,
    latestSignal,
    selectStock,
    changeInterval,
    changeChartMode,
    searchStocks,
    isAShare: isAShareStock,
  } = useStockData();

  // ── Page Mode: "t-assistant" or "screener" or "limit-up" ──
  const [pageMode, setPageMode] = useState<"t-assistant" | "screener" | "limit-up">("t-assistant");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── News Analysis State (with localStorage caching) ──
  const [showNewsAnalysis, setShowNewsAnalysis] = useState(true);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsData, setNewsData] = useState<{
    market?: any;
    sector?: any;
    stock?: any;
    overseas?: any;
  }>({});
  const [newsActiveTab, setNewsActiveTab] = useState<"market" | "sector" | "stock" | "overseas">("market");

  // ── Prediction day: before 11:30 → 今日预判, after 11:30 → 明日预判 ──
  const predictionDay = useMemo(() => {
    const now = new Date();
    const china = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const h = china.getHours(), m = china.getMinutes();
    return (h < 11 || (h === 11 && m < 30)) ? "今日" : "明日";
  }, []);
  // Also consider the server-provided predictionDay from API data
  const currentPredictionDay = newsData[newsActiveTab]?.predictionDay || predictionDay;

  // Radar dimension labels vary by tab
  const radarLabelsByTab: Record<string, string[]> = {
    market: ["技术面", "资金面", "政策面", "情绪面"],
    sector: ["技术面", "资金面", "政策面", "情绪面"],
    stock: ["技术面", "资金面", "消息面", "情绪面"],
    overseas: ["美股走势", "港股走势", "资金流向", "政策消息"],
  };
  const radarLabels = radarLabelsByTab[newsActiveTab] || radarLabelsByTab.market;

  // ── News filter state ──
  const [newsFilterSource, setNewsFilterSource] = useState<string>("all"); // all / source type
  const [newsFilterDimension, setNewsFilterDimension] = useState<string>("all"); // all / search label
  const [newsFilterSentiment, setNewsFilterSentiment] = useState<string>("all"); // all / 偏多 / 偏空 / 中性

  // ── News prediction history (persisted to localStorage) ──
  const NEWS_PREDICTION_KEY = "news_predictions";
  const [newsPredictions, setNewsPredictions] = useState<Array<{
    id: string; timestamp: string; symbol: string; type: string;
    trend: string; confidence: number; suggestion: string;
    riskLevel: string; newsSentiment: string; summary: string;
    actualResult?: "正确" | "部分正确" | "错误"; feedbackTime?: string;
  }>>([]);

  // Load predictions from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NEWS_PREDICTION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setNewsPredictions(parsed);
      }
    } catch {}
  }, []);

  // Save predictions to localStorage when updated
  useEffect(() => {
    try { localStorage.setItem(NEWS_PREDICTION_KEY, JSON.stringify(newsPredictions)); } catch {}
  }, [newsPredictions]);

  // Save current prediction to history
  const savePrediction = useCallback((type: string, data: any) => {
    if (!data?.analysis) return;
    const a = data.analysis;
    const id = `${type}-${data.symbol}-${data.timestamp}`;
    setNewsPredictions(prev => {
      // Avoid duplicate for same type+symbol+timestamp
      if (prev.some(p => p.id === id)) return prev;
      const entry = {
        id, timestamp: data.timestamp, symbol: data.symbol, type,
        trend: a.trend, confidence: a.confidence, suggestion: a.suggestion,
        riskLevel: a.riskLevel, newsSentiment: a.newsSentiment, summary: a.summary,
      };
      // Keep max 50 predictions, newest first
      return [entry, ...prev].slice(0, 50);
    });
  }, []);

  // Record feedback on a prediction
  const recordPredictionFeedback = useCallback((id: string, result: "正确" | "部分正确" | "错误") => {
    setNewsPredictions(prev => prev.map(p =>
      p.id === id ? { ...p, actualResult: result, feedbackTime: new Date().toISOString() } : p
    ));
  }, []);

  // ── News cache freshness tracking ──
  const [newsCacheAge, setNewsCacheAge] = useState<number>(0); // seconds since last fetch
  const NEWS_AUTO_REFRESH_INTERVAL = 30 * 60; // 30 minutes in seconds

  // ── News localStorage cache helpers ──
  const getNewsCacheKey = useCallback((sym: string) => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }); // YYYY-MM-DD
    return `news_${sym}_${today}`;
  }, []);

  const saveNewsCache = useCallback((sym: string, data: { market?: any; sector?: any; stock?: any }) => {
    try {
      const key = getNewsCacheKey(sym);
      localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
    } catch {}
  }, [getNewsCacheKey]);

  const loadNewsCache = useCallback((sym: string): { market?: any; sector?: any; stock?: any } | null => {
    try {
      const key = getNewsCacheKey(sym);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Only use cache if saved today and within 4 hours
      if (parsed.savedAt && Date.now() - parsed.savedAt < 4 * 60 * 60 * 1000) {
        return parsed.data;
      }
      // Expired – remove stale cache
      localStorage.removeItem(key);
      return null;
    } catch {
      return null;
    }
  }, [getNewsCacheKey]);

  // Clean up stale news cache entries from previous days (run once on mount)
  useEffect(() => {
    try {
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("news_") && !k.includes(today)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }, []);

  // ── Menu Bar Stocks (persisted to localStorage) ──
  // Initialize with default to avoid hydration mismatch (localStorage read after mount)
  const [menuStocks, setMenuStocks] = useState<{ symbol: string; name: string }[]>(DEFAULT_ASHARES);
  // Read from localStorage after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("menuStocks");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Use microtask to avoid lint warning about setState in effect
          queueMicrotask(() => setMenuStocks(parsed));
        }
      }
    } catch {}
  }, []);

  // ── Market Index Regime Detection (深证/沪指/创业板) ──
  const [indexRegimes, setIndexRegimes] = useState<Record<IndexKey, RegimeDetail | null>>({ sz: null, sh: null, cyb: null });
  const [activeIndexKey, setActiveIndexKey] = useState<IndexKey>("sz");
  // Store full timeline data for mini charts
  const [indexTimelineData, setIndexTimelineData] = useState<Record<IndexKey, { items: TimelineItem[]; prevClose: number }>>({ sz: { items: [], prevClose: 0 }, sh: { items: [], prevClose: 0 }, cyb: { items: [], prevClose: 0 } });

  useEffect(() => {
    let cancelled = false;
    const fetchAllIndices = async () => {
      const results = await Promise.allSettled(
        INDEX_KEYS.map(async (key) => {
          const { symbol } = INDEX_CONFIG[key];
          const res = await fetch(`/api/stock/ashare-timeline?symbol=${encodeURIComponent(symbol)}`);
          if (!res.ok) return null;
          const data = await res.json();
          if (data.error || !data.items || data.items.length < 10) return null;
          return { regime: detectMarketRegimeDetail(data.items, data.prevClose || data.items[0].price), items: data.items as TimelineItem[], prevClose: data.prevClose || data.items[0].price };
        })
      );
      if (cancelled) return;
      setIndexRegimes(prev => {
        let changed = false;
        const next = { ...prev };
        INDEX_KEYS.forEach((key, i) => {
          if (results[i].status === "fulfilled" && results[i].value) {
            const newRegime = results[i].value!.regime;
            if (prev[key]?.regime !== newRegime.regime || prev[key]?.confidence !== newRegime.confidence) {
              next[key] = newRegime;
              changed = true;
            }
          }
        });
        return changed ? next : prev;
      });
      setIndexTimelineData(prev => {
        let changed = false;
        const next = { ...prev };
        INDEX_KEYS.forEach((key, i) => {
          if (results[i].status === "fulfilled" && results[i].value) {
            const newVal = { items: results[i].value!.items, prevClose: results[i].value!.prevClose };
            // Simple check: compare length and last item time
            if (prev[key]?.items.length !== newVal.items.length || prev[key]?.items[newVal.items.length - 1]?.time !== newVal.items[newVal.items.length - 1]?.time) {
              next[key] = newVal;
              changed = true;
            }
          }
        });
        return changed ? next : prev;
      });
    };
    fetchAllIndices();
    // Refresh every 60 seconds
    const timer = setInterval(fetchAllIndices, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Current displayed regime based on active index key
  const szIndexRegime = indexRegimes[activeIndexKey];

  // Cycle through indices on click
  const cycleIndexKey = useCallback(() => {
    setActiveIndexKey(prev => {
      const idx = INDEX_KEYS.indexOf(prev);
      return INDEX_KEYS[(idx + 1) % INDEX_KEYS.length];
    });
  }, []);

  // ── Sector Regime Detection (行业板块联动) ──
  const [sectorInfoRaw, setSectorInfoRaw] = useState<{ code: string; name: string } | null>(null);
  const [sectorRegimeRaw, setSectorRegimeRaw] = useState<RegimeDetail | null>(null);
  // Store sector timeline data for mini chart
  const [sectorTimelineData, setSectorTimelineData] = useState<{ items: TimelineItem[]; prevClose: number }>({ items: [], prevClose: 0 });

  // Derive effective sector data (null when not A-share)
  const sectorInfo = isAShareStock ? sectorInfoRaw : null;
  const sectorRegime = isAShareStock ? sectorRegimeRaw : null;

  // Fetch sector info + regime + timeline data
  useEffect(() => {
    if (!symbol || !isAShareStock) return;

    let cancelled = false;
    const fetchSectorData = async () => {
      try {
        // Step 1: Get sector info for the stock
        const infoRes = await fetch(`/api/stock/ashare-sector?symbol=${encodeURIComponent(symbol)}&type=full`);
        if (!infoRes.ok) { if (!cancelled) { setSectorInfoRaw(null); setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); } return; }
        const infoData = await infoRes.json();
        if (!infoData.success || !infoData.sectorInfo) {
          if (!cancelled) { setSectorInfoRaw(null); setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); }
          return;
        }

        const sInfo = infoData.sectorInfo;
        if (cancelled) return;
        setSectorInfoRaw({ code: sInfo.code, name: sInfo.name });

        // Step 2: Detect sector regime from timeline data + store timeline
        if (infoData.data && infoData.data.items && infoData.data.items.length >= 10) {
          const sectorPrevClose = infoData.data.prevClose || infoData.data.items[0].price;
          const regime = detectMarketRegimeDetail(infoData.data.items, sectorPrevClose);
          if (!cancelled) {
            setSectorRegimeRaw(regime);
            setSectorTimelineData({ items: infoData.data.items, prevClose: sectorPrevClose });
          }
        } else {
          if (!cancelled) { setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); }
        }
      } catch (e) {
        console.error("Sector regime fetch error:", e);
      }
    };

    fetchSectorData();
    // Refresh every 60 seconds
    const timer = setInterval(fetchSectorData, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbol, isAShareStock]);

  // Persist menu stocks to localStorage
  useEffect(() => {
    try { localStorage.setItem("menuStocks", JSON.stringify(menuStocks)); } catch {}
  }, [menuStocks]);

  // Check if current stock is in menu
  const isInMenu = menuStocks.some((s) => s.symbol === symbol);

  // Toggle current stock in menu bar
  const toggleMenuStock = useCallback(() => {
    if (!quote) return;
    setMenuStocks((prev) => {
      if (prev.some((s) => s.symbol === symbol)) {
        // Remove from menu
        return prev.filter((s) => s.symbol !== symbol);
      }
      // Add to menu (at the end, max 10 stocks)
      const next = [...prev, { symbol, name: quote.name || symbol }];
      return next.slice(-10);
    });
  }, [symbol, quote]);

  // ── DB Factor Overrides ──
  const [factorOverrides, setFactorOverrides] = useState<FactorOverride[]>([]);

  // Fetch enabled factors from DB on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stock/strategy");
        if (res.ok) {
          const data = await res.json();
          if (data.dbFactors && Array.isArray(data.dbFactors)) {
            setFactorOverrides(buildFactorOverridesFromDB(data.dbFactors));
          }
        }
      } catch (e) {
        console.error("Failed to fetch factor overrides:", e);
      }
    })();
  }, []);

  // ── Custom Factors from localStorage (v3.8) ──
  const [customFactors, setCustomFactors] = useState<CustomFactorDefinition[]>([]);

  // Load custom factors from localStorage on mount and listen for changes
  useEffect(() => {
    const loadCustomFactors = () => {
      try {
        const saved = localStorage.getItem(CUSTOM_FACTORS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as CustomFactorDefinition[];
          setCustomFactors(parsed);
        } else {
          // Use built-in defaults if nothing saved
          setCustomFactors(BUILT_IN_CUSTOM_FACTORS);
        }
      } catch {
        setCustomFactors(BUILT_IN_CUSTOM_FACTORS);
      }
    };
    loadCustomFactors();
    // Listen for changes from CustomFactorsTab instead of polling
    const handler = () => loadCustomFactors();
    window.addEventListener('custom-factors-changed', handler);
    return () => window.removeEventListener('custom-factors-changed', handler);
  }, []);

  // Debounced search
  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

      if (!value.trim()) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      searchTimeoutRef.current = setTimeout(async () => {
        const results = await searchStocks(value);
        setSearchResults(results);
        setSearchLoading(false);
      }, 400);
    },
    [searchStocks]
  );

  // ── K-line zoom state ──
  const [klineVisibleBars, setKlineVisibleBars] = useState<number>(80); // default 80 bars visible
  const [klinePanOffset, setKlinePanOffset] = useState<number>(0); // pan offset for K-line (0 = rightmost/latest)
  const klineDragRef = useRef<{ startX: number; startPanOffset: number; isDragging: boolean }>({ startX: 0, startPanOffset: 0, isDragging: false });
  const klineChartContainerRef = useRef<HTMLDivElement>(null);
  // Merge today's real-time quote into K-line history for daily/weekly intervals.
  // The Sina daily K-line API does NOT return the current (incomplete) trading day,
  // so we need to append/update today's candle from the live quote data.
  const allChartData = useMemo(() => {
    const data = history.filter((h) => h.close > 0);

    // Only merge for daily/weekly K-line (intraday K-lines already include current session)
    if (quote && quote.price > 0 && (interval === "1d" || interval === "1wk")) {
      // Get today's date in China timezone
      const now = new Date();
      const chinaOffset = 8 * 60; // UTC+8 in minutes
      const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
      const todayStr = chinaTime.toISOString().split("T")[0]; // "YYYY-MM-DD"

      // For weekly interval, use Monday's date as the week key
      let todayKey = todayStr;
      if (interval === "1wk") {
        const dayOfWeek = chinaTime.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(chinaTime.getTime() + mondayOffset * 86400000);
        todayKey = monday.toISOString().split("T")[0];
      }

      const lastDate = data.length > 0 ? data[data.length - 1].date : "";
      const todayQuote = {
        open: quote.open || quote.price,
        high: quote.high || quote.price,
        low: quote.low || quote.price,
        close: quote.price,
        volume: quote.volume || 0,
      };

      if (lastDate < todayKey) {
        // Today's candle is completely missing from API — append it
        data.push({
          date: todayKey,
          ...todayQuote,
          ma5: null,
          ma10: null,
          ma20: null,
          dif: null,
          dea: null,
          macd: null,
        });
      } else if (lastDate === todayKey) {
        // Today's candle exists (rare, or after market close) — update with latest quote
        const last = data[data.length - 1];
        data[data.length - 1] = {
          ...last,
          high: Math.max(last.high, todayQuote.high),
          low: Math.min(last.low, todayQuote.low),
          close: todayQuote.close,
          volume: todayQuote.volume,
        };
      }
    }

    return data;
  }, [history, quote, interval]);

  // ── Timeline zoom state ──
  const TL_ZOOM_LEVELS = [250, 180, 120, 90, 60]; // minutes visible: full day(250>242 ensures full view), ~3h, ~2h, 1.5h, 1h
  const [tlZoomIdx, setTlZoomIdx] = useState<number>(0); // default: full day (241 = full trading day)
  const [tlPanOffset, setTlPanOffset] = useState<number>(0); // pan offset for timeline (0 = rightmost/latest)
  const tlVisibleMinutes = TL_ZOOM_LEVELS[tlZoomIdx];

  const handleSelectStock = useCallback((sym: string) => {
    selectStock(sym);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    // Reset zoom levels when switching stocks
    setKlineVisibleBars(80);
    setTlZoomIdx(0);
  }, [selectStock]);

  // ── News Analysis: Computed data ──
  // Filtered news list based on current filter selections
  const currentNewsTabData = newsData[newsActiveTab];
  const filteredNews = useMemo(() => {
    if (!currentNewsTabData?.news) return [];
    return currentNewsTabData.news.filter((item: any) => {
      if (newsFilterSource !== "all" && item.sourceType !== newsFilterSource) return false;
      if (newsFilterDimension !== "all" && item.searchLabel !== newsFilterDimension) return false;
      return true;
    });
  }, [currentNewsTabData?.news, newsFilterSource, newsFilterDimension]);

  // Sentiment radar scores for SVG radar chart
  const sentimentScores = useMemo(() => {
    if (!currentNewsTabData?.analysis) return [50, 50, 50, 50];
    const a = currentNewsTabData.analysis;
    const textToScore = (text: string, base: number): number => {
      if (!text) return base;
      const lower = text.toLowerCase();
      if (lower.includes("强") && (lower.includes("多") || lower.includes("买") || lower.includes("上"))) return 85;
      if (lower.includes("弱") && (lower.includes("空") || lower.includes("卖") || lower.includes("下"))) return 20;
      if (lower.includes("多") || lower.includes("买") || lower.includes("上") || lower.includes("升")) return 70;
      if (lower.includes("空") || lower.includes("卖") || lower.includes("下") || lower.includes("降")) return 30;
      if (lower.includes("震荡") || lower.includes("中性") || lower.includes("观望")) return 50;
      return base;
    };
    return [
      textToScore(a.technicalView || "", a.trend === "上升" ? 70 : a.trend === "下降" ? 30 : 50),
      textToScore(a.capitalView || "", a.newsSentiment === "偏多" ? 70 : a.newsSentiment === "偏空" ? 30 : 50),
      textToScore(a.policyView || "", 50),
      textToScore(a.sentimentView || "", a.newsSentiment === "偏多" ? 65 : a.newsSentiment === "偏空" ? 35 : 50),
    ];
  }, [currentNewsTabData?.analysis]);

  // Prediction accuracy stats
  const predictionStats = useMemo(() => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    const todayPredictions = newsPredictions.filter(p => p.timestamp && p.timestamp.startsWith(today));
    const withFeedback = todayPredictions.filter(p => p.actualResult);
    const correct = withFeedback.filter(p => p.actualResult === "正确").length;
    const partial = withFeedback.filter(p => p.actualResult === "部分正确").length;
    const wrong = withFeedback.filter(p => p.actualResult === "错误").length;
    const total = withFeedback.length;
    const accuracy = total > 0 ? Math.round((correct + partial * 0.5) / total * 100) : -1;
    return { todayTotal: todayPredictions.length, withFeedback: total, correct, partial, wrong, accuracy };
  }, [newsPredictions]);

  // ── News Analysis: fetch data from API ──
  // Use a ref to avoid newsData in the dependency array (prevents re-render loops)
  const newsDataRef = useRef(newsData);
  newsDataRef.current = newsData;

  const fetchNewsAnalysis = useCallback(async (options?: { incremental?: boolean }) => {
    const isIncremental = options?.incremental === true;
    const currentNewsData = newsDataRef.current;
    // For incremental mode, don't show loading spinner if we already have data
    if (!isIncremental || !currentNewsData.market) {
      setNewsLoading(true);
    }
    try {
      const stockName = quote?.name || symbol;
      const sectorName = sectorInfo?.name || "";
      const params = new URLSearchParams();
      params.set("symbol", symbol);
      params.set("stockName", stockName);
      params.set("sectorName", sectorName);

      // In incremental mode, send lastTimestamp for each tab so server can skip if data unchanged
      if (isIncremental) {
        params.set("mode", "incremental");
        const lastTs = [currentNewsData.market, currentNewsData.sector, currentNewsData.stock, currentNewsData.overseas]
          .filter(Boolean)
          .map((d: any) => d.timestamp)
          .filter(Boolean)
          .sort()
          .pop(); // latest timestamp across all tabs
        if (lastTs) params.set("lastTimestamp", lastTs);
      }

      const [marketRes, sectorRes, stockRes, overseasRes] = await Promise.allSettled([
        fetch(`/api/stock/news-analysis?${params}&type=market`),
        sectorName ? fetch(`/api/stock/news-analysis?${params}&type=sector`) : Promise.resolve(null),
        fetch(`/api/stock/news-analysis?${params}&type=stock`),
        fetch(`/api/stock/news-analysis?${params}&type=overseas`),
      ]);

      const newData: any = {};
      let anyUpdate = false;
      if (marketRes.status === "fulfilled" && marketRes.value) {
        const m = await marketRes.value.json();
        if (m.success && !m.noUpdate) { newData.market = m; anyUpdate = true; }
      }
      if (sectorRes.status === "fulfilled" && sectorRes.value) {
        const s = await sectorRes.value.json();
        if (s.success && !s.noUpdate) { newData.sector = s; anyUpdate = true; }
      }
      if (stockRes.status === "fulfilled" && stockRes.value) {
        const st = await stockRes.value.json();
        if (st.success && !st.noUpdate) { newData.stock = st; anyUpdate = true; }
      }
      if (overseasRes.status === "fulfilled" && overseasRes.value) {
        const o = await overseasRes.value.json();
        if (o.success && !o.noUpdate) { newData.overseas = o; anyUpdate = true; }
      }

      if (anyUpdate) {
        // Use functional update to merge with latest state (avoids stale closure)
        setNewsData(prev => {
          const merged = { ...prev };
          if (newData.market) merged.market = newData.market;
          if (newData.sector) merged.sector = newData.sector;
          if (newData.stock) merged.stock = newData.stock;
          if (newData.overseas) merged.overseas = newData.overseas;
          saveNewsCache(symbol, merged);
          return merged;
        });
      }
    } catch (e) {
      console.error("News analysis fetch error:", e);
    } finally {
      setNewsLoading(false);
    }
  }, [symbol, quote, sectorInfo, saveNewsCache]);

  // When symbol changes, reset newsData and load from cache for the new symbol
  const prevNewsSymbolRef = useRef(symbol);
  useEffect(() => {
    if (symbol !== prevNewsSymbolRef.current) {
      prevNewsSymbolRef.current = symbol;
      // Try loading cached data for the new symbol
      const cached = loadNewsCache(symbol);
      if (cached && (cached.market || cached.sector || cached.stock || cached.overseas)) {
        setNewsData(cached);
        setNewsLoading(false);
        // Background incremental refresh for the new symbol
        fetchNewsAnalysis({ incremental: true });
      } else {
        setNewsData({});
      }
    }
  }, [symbol, loadNewsCache, fetchNewsAnalysis]);

  // Auto-fetch news analysis: load from localStorage cache first, then incremental refresh
  useEffect(() => {
    if (!showNewsAnalysis) return;
    // 1. Try loading from localStorage cache (instant display)
    if (!newsData.market && !newsLoading) {
      const cached = loadNewsCache(symbol);
      if (cached && (cached.market || cached.sector || cached.stock || cached.overseas)) {
        setNewsData(cached);
        // Then do an incremental check in the background (no loading spinner)
        fetchNewsAnalysis({ incremental: true });
        return;
      }
      // 2. No cache – do a full fetch with loading spinner
      fetchNewsAnalysis();
    }
  }, [showNewsAnalysis]);

  // ── News cache age timer + auto-refresh ──
  useEffect(() => {
    if (!showNewsAnalysis || !newsData.market) return;
    const interval = setInterval(() => {
      setNewsCacheAge(prev => {
        const next = prev + 1;
        // Auto-refresh when cache is stale
        if (next >= NEWS_AUTO_REFRESH_INTERVAL && !newsLoading) {
          fetchNewsAnalysis({ incremental: true });
          return 0; // Reset after refresh
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showNewsAnalysis, newsData.market, newsLoading, fetchNewsAnalysis]);

  // Reset cache age when newsData updates
  useEffect(() => {
    if (newsData.market) {
      setNewsCacheAge(0);
      // Auto-save predictions for each tab
      if (newsData.market?.analysis) savePrediction("market", newsData.market);
      if (newsData.sector?.analysis) savePrediction("sector", newsData.sector);
      if (newsData.stock?.analysis) savePrediction("stock", newsData.stock);
      if (newsData.overseas?.analysis) savePrediction("overseas", newsData.overseas);
    }
  }, [newsData.market?.timestamp, newsData.sector?.timestamp, newsData.stock?.timestamp, newsData.overseas?.timestamp]);

  // ── Live Timeline: inject real-time quote price into the latest minute ──
  // Tencent API returns 1-minute granularity; quote updates every ~3s during trading.
  // By replacing the last timeline point with quote.price, the chart moves in near-real-time.
  const liveTimeline = useMemo(() => {
    if (timeline.length === 0) return timeline;

    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const isMorningSession = (h === 9 && m >= 30) || (h === 10) || (h === 11 && m <= 30);
    const isAfternoonSession = (h >= 13 && h < 15) || (h === 15 && m === 0);
    const isTradingHours = isMorningSession || isAfternoonSession;

    // ── Step 1: Truncate API-pre-populated future minutes ──
    // Tencent API returns full session data with flat (last known) prices for future minutes.
    // We must cut these off so signals/labels don't appear at 11:30/15:00.
    let truncated = timeline;
    if (isTradingHours) {
      const curMin = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      // Find the last data point whose time is <= current minute
      const lastValidIdx = timeline.reduce((lastIdx: number, d: TimelineItem, i: number) => {
        if (d.time <= curMin) return i;
        return lastIdx;
      }, -1);
      if (lastValidIdx >= 0 && lastValidIdx < timeline.length - 1) {
        truncated = timeline.slice(0, lastValidIdx + 1);
      }
    }

    // ── Step 2: Inject live price if available ──
    if (!quote || !quote.price || quote.price <= 0) return truncated;
    const last = truncated[truncated.length - 1];
    if (!last) return truncated;

    const curMin = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    // If the last truncated point is the current minute, update it with live price
    if (last.time === curMin) {
      if (last.price === quote.price) return truncated; // no change, avoid new ref
      const updated = truncated.slice(0, -1);
      const changePercent = quote.prevClose > 0 ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : last.changePercent;
      updated.push({
        ...last,
        price: quote.price,
        changePercent: Number(changePercent.toFixed(2)),
        // Keep avgPrice from API (VWAP) — it's cumulative and accurate
      });
      return updated;
    }

    // If we're in a new minute that the truncated timeline hasn't captured yet,
    // add a new point (e.g. timeline shows 10:30 but it's 10:31 now)
    if (isTradingHours) {
      const changePercent = quote.prevClose > 0 ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : 0;
      return [...truncated, {
        time: curMin,
        price: quote.price,
        avgPrice: quote.price, // approximate VWAP for the new minute
        volume: 0, // unknown until API updates
        changePercent: Number(changePercent.toFixed(2)),
      }];
    }

    return truncated;
  }, [timeline, quote]);

  // ── Timeline last data slot index (matches fullDayData indexing in TimeSharingPanel) ──
  const tlLastDataIdx = useMemo(() => {
    if (liveTimeline.length === 0) return -1;
    const lastTime = liveTimeline[liveTimeline.length - 1].time;
    const [h, m] = lastTime.split(':').map(Number);
    // Morning: 09:30-11:30 (slots 0-120, 121 minutes), Afternoon: 13:00-15:00 (slots 121-241, 121 minutes)
    if (h < 12) {
      return (h - 9) * 60 + (m - 30);
    } else {
      return 121 + (h - 13) * 60 + m;
    }
  }, [liveTimeline]);

  const tlZoomIn = (cursorRatio?: number) => {
    if (cursorRatio !== undefined && cursorRatio >= 0) {
      // Cursor-aware zoom: keep the data under cursor at the same relative position
      const oldVisible = TL_ZOOM_LEVELS[tlZoomIdx];
      const newIdx = Math.min(tlZoomIdx + 1, TL_ZOOM_LEVELS.length - 1);
      const newVisible = TL_ZOOM_LEVELS[newIdx];
      const lastDataIdx = tlLastDataIdx;
      const totalSlots = 242; // full trading day slots
      if (oldVisible >= totalSlots || lastDataIdx < 0) {
        // Currently in full-day view: cursorRatio maps to the full 242-slot range
        const cursorSlotIdx = cursorRatio * (totalSlots - 1);
        const newStartIdx = cursorSlotIdx - cursorRatio * (newVisible - 1);
        const newEndIdx = newStartIdx + newVisible - 1;
        const newPanOffset = Math.max(0, Math.round(lastDataIdx - newEndIdx));
        setTlZoomIdx(newIdx);
        setTlPanOffset(newPanOffset);
      } else {
        // Already zoomed: calculate from current pan offset
        const currentEndIdx = Math.min(lastDataIdx, Math.max(oldVisible - 1, lastDataIdx - tlPanOffset));
        const currentStartIdx = Math.max(0, currentEndIdx - oldVisible + 1);
        const cursorIdx = currentStartIdx + cursorRatio * (currentEndIdx - currentStartIdx);
        const newStartIdx = cursorIdx - cursorRatio * (newVisible - 1);
        const newEndIdx = newStartIdx + newVisible - 1;
        const newPanOffset = Math.max(0, Math.round(lastDataIdx - newEndIdx));
        setTlZoomIdx(newIdx);
        setTlPanOffset(newPanOffset);
      }
    } else {
      // Button click: reset to tail
      setTlZoomIdx((prev) => Math.min(prev + 1, TL_ZOOM_LEVELS.length - 1));
      setTlPanOffset(0);
    }
  };
  const tlZoomOut = (cursorRatio?: number) => {
    if (cursorRatio !== undefined && cursorRatio >= 0 && tlZoomIdx > 0) {
      // Cursor-aware zoom: keep the data under cursor at the same relative position
      const oldVisible = TL_ZOOM_LEVELS[tlZoomIdx];
      const newIdx = Math.max(tlZoomIdx - 1, 0);
      const newVisible = TL_ZOOM_LEVELS[newIdx];
      const lastDataIdx = tlLastDataIdx;
      const totalSlots = 242;
      if (newVisible >= totalSlots) {
        // Zooming out to full-day view: no pan offset needed
        setTlZoomIdx(newIdx);
        setTlPanOffset(0);
      } else {
        const currentEndIdx = Math.min(lastDataIdx, Math.max(oldVisible - 1, lastDataIdx - tlPanOffset));
        const currentStartIdx = Math.max(0, currentEndIdx - oldVisible + 1);
        const cursorIdx = currentStartIdx + cursorRatio * (currentEndIdx - currentStartIdx);
        const newStartIdx = cursorIdx - cursorRatio * (newVisible - 1);
        const newEndIdx = newStartIdx + newVisible - 1;
        const newPanOffset = Math.max(0, Math.round(lastDataIdx - newEndIdx));
        setTlZoomIdx(newIdx);
        setTlPanOffset(newPanOffset);
      }
    } else {
      // Button click or already at minimum zoom: reset to tail
      setTlZoomIdx((prev) => Math.max(prev - 1, 0));
      setTlPanOffset(0);
    }
  };
  const tlZoomReset = () => { setTlZoomIdx(0); setTlPanOffset(0); };

  // Zoom controls
  const ZOOM_LEVELS = [30, 50, 80, 120, 200, 300];
  const zoomIn = () => {
    setKlineVisibleBars((prev) => {
      const smaller = ZOOM_LEVELS.filter((l) => l < prev);
      return smaller.length > 0 ? smaller[smaller.length - 1] : prev;
    });
    setKlinePanOffset(0);
  };
  const zoomOut = () => {
    setKlineVisibleBars((prev) => {
      const larger = ZOOM_LEVELS.filter((l) => l > prev);
      return larger.length > 0 ? larger[0] : prev;
    });
    setKlinePanOffset(0);
  };
  const zoomReset = () => { setKlineVisibleBars(80); setKlinePanOffset(0); };

  // Slice chart data based on zoom level + pan offset (show the most recent bars, offset by pan)
  const chartData = useMemo(() => {
    if (allChartData.length <= klineVisibleBars) return allChartData;
    const maxOffset = allChartData.length - klineVisibleBars;
    const offset = Math.max(0, Math.min(klinePanOffset, maxOffset));
    return allChartData.slice(-(klineVisibleBars + offset), allChartData.length - offset);
  }, [allChartData, klineVisibleBars, klinePanOffset]);

  // ── K-line drag-to-pan & scroll-to-pan (stable native events via ref pattern) ──
  const klinePanOffsetRef = useRef(klinePanOffset);
  const klineVisibleBarsRef = useRef(klineVisibleBars);
  const allChartDataRef = useRef(allChartData);
  useEffect(() => {
    klinePanOffsetRef.current = klinePanOffset;
    klineVisibleBarsRef.current = klineVisibleBars;
    allChartDataRef.current = allChartData;
  }, [klinePanOffset, klineVisibleBars, allChartData]);

  // Pan helper — defined inside useEffect to avoid memoization issues
  useEffect(() => {
    const applyKlinePanOffset = (rawOffset: number) => {
      const acd = allChartDataRef.current;
      const vb = klineVisibleBarsRef.current;
      const maxOffset = Math.max(0, acd.length - vb);
      setKlinePanOffset(Math.max(0, Math.min(rawOffset, maxOffset)));
    };

    const container = klineChartContainerRef.current;
    if (!container) return;

    const isZoomed = () => allChartDataRef.current.length > klineVisibleBarsRef.current;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // only left-click
      if (!isZoomed()) return;
      e.preventDefault();
      e.stopPropagation();
      klineDragRef.current = { startX: e.clientX, startPanOffset: klinePanOffsetRef.current, isDragging: true };
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!klineDragRef.current.isDragging) return;
      e.preventDefault();
      const vb = klineVisibleBarsRef.current;
      const dx = e.clientX - klineDragRef.current.startX;
      const containerWidth = container.clientWidth || 600;
      const pixelsPerPoint = containerWidth / vb;
      const pointDelta = Math.round(dx / pixelsPerPoint);
      const newOffset = klineDragRef.current.startPanOffset - pointDelta;
      applyKlinePanOffset(newOffset);
    };

    const onMouseUp = () => {
      if (klineDragRef.current.isDragging) {
        klineDragRef.current.isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    const onContextMenu = (e: Event) => {
      if (klineDragRef.current.isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!isZoomed()) return;
      const delta = e.deltaX !== 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const scrollStep = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 40));
      const newOffset = klinePanOffsetRef.current + scrollStep;
      applyKlinePanOffset(newOffset);
    };

    container.addEventListener('mousedown', onMouseDown, true);
    container.addEventListener('contextmenu', onContextMenu, true);
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('contextmenu', onContextMenu, true);
      container.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []); // empty deps — stable listeners via refs

  const isUp = quote ? quote.change >= 0 : true;
  const priceColor = isUp ? "text-red-500" : "text-green-500";

  // Price/MACD/Volume ranges for Y-axis (memoized)
  const { minPrice, maxPrice, pricePadding, macdMin, macdMax, macdPadding, maxVolume } = useMemo(() => {
    const allPrices = chartData.flatMap((d) => [d.high, d.low]).filter(Boolean) as number[];
    const mnP = allPrices.length ? allPrices.reduce((mn, v) => (v < mn ? v : mn), allPrices[0]) : 0;
    const mxP = allPrices.length ? allPrices.reduce((mx, v) => (v > mx ? v : mx), allPrices[0]) : 100;
    const pp = (mxP - mnP) * 0.05;

    const macdVals = chartData
      .flatMap((d) => [d.dif, d.dea, d.macd])
      .filter((v): v is number => v != null);
    const mMin = macdVals.length ? macdVals.reduce((mn, v) => (v < mn ? v : mn), macdVals[0]) : -1;
    const mMax = macdVals.length ? macdVals.reduce((mx, v) => (v > mx ? v : mx), macdVals[0]) : 1;
    const mPad = (mMax - mMin) * 0.02 || 0.05;

    const mv = chartData.reduce((mx, d) => (d.volume > mx ? d.volume : mx), 1);

    return { minPrice: mnP, maxPrice: mxP, pricePadding: pp, macdMin: mMin, macdMax: mMax, macdPadding: mPad, maxVolume: mv };
  }, [chartData]);

  // Calculate MACD from raw timeline data (10s refresh), NOT liveTimeline (3s refresh)
  // This keeps MACD updating at 10s intervals, not 3s, avoiding jitter
  const timelineMACDData = useMemo(() => {
    if (timeline.length === 0) return [];

    // ── Truncate future flat-line minutes before MACD calculation ──
    // Tencent API returns full session data with flat prices for future minutes.
    // Calculating MACD on these produces misleading convergence values.
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const isMorningSession = (h === 9 && m >= 30) || (h === 10) || (h === 11 && m <= 30);
    const isAfternoonSession = (h >= 13 && h < 15) || (h === 15 && m === 0);
    let macdTimeline = timeline;
    if (isMorningSession || isAfternoonSession) {
      const curMin = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const lastValidIdx = timeline.reduce((lastIdx: number, d: TimelineItem, i: number) => {
        if (d.time <= curMin) return i;
        return lastIdx;
      }, -1);
      if (lastValidIdx >= 0 && lastValidIdx < timeline.length - 1) {
        macdTimeline = timeline.slice(0, lastValidIdx + 1);
      }
    }

    const prices = macdTimeline.map((d) => d.price);
    const macdResult = calculateMACD(prices);

    const result: { time: string; dif: number | null; dea: number | null; macd: number | null }[] = [];
    for (let i = 0; i < macdTimeline.length; i++) {
      const m = macdResult[i];
      if (isNaN(m.dif) || isNaN(m.dea) || isNaN(m.macd)) {
        result.push({ time: macdTimeline[i].time, dif: null, dea: null, macd: null });
      } else {
        result.push({
          time: macdTimeline[i].time,
          dif: m.dif,
          dea: m.dea,
          macd: m.macd,
        });
      }
    }

    return result.filter((d) => d.dif != null);
  }, [timeline]);

  // Generate T-trading signals for timeline (with DB factor overrides + index regime)
  const timelineSignals = useMemo(() => {
    return generateTimelineSignals(liveTimeline, timelineMACDData, timelinePrevClose, factorOverrides, szIndexRegime, customFactors, sectorRegime);
  }, [liveTimeline, timelineMACDData, timelinePrevClose, factorOverrides, szIndexRegime, customFactors, sectorRegime]);

  // ── Pulse & Volume Surge markers for timeline chart ──
  // Detect pulse surge and volume surge events from the same timeline data
  // that the screener uses, and mark them on the chart.
  const pvMarkers = useMemo(() => {
    if (liveTimeline.length < 10 || timelinePrevClose <= 0) return [];
    return detectPulseVolumeMarkers(liveTimeline, timelinePrevClose);
  }, [liveTimeline, timelinePrevClose]);

  // Get latest timeline signal for the header badge
  const latestTimelineSignal = useMemo(() => {
    for (let i = timelineSignals.length - 1; i >= 0; i--) {
      if (timelineSignals[i]) return timelineSignals[i];
    }
    return null;
  }, [timelineSignals]);

  // ── Memoized signal counts (avoids repeated filtering in JSX IIFEs) ──
  const signalCounts = useMemo(() => {
    let buyCount = 0, strongBuys = 0, sellCount = 0, strongSells = 0;
    let totalSigs = 0, strongSigs = 0, mediumSigs = 0, weakSigs = 0;
    let confluenceCount = 0, keyLevelCount = 0, vwapSlopeCount = 0, indexRegimeCount = 0;
    for (const s of timelineSignals) {
      if (!s) continue;
      totalSigs++;
      if (s.type === "buy") { buyCount++; if (s.strength === "strong") strongBuys++; }
      else if (s.type === "sell") { sellCount++; if (s.strength === "strong") strongSells++; }
      if (s.strength === "strong") strongSigs++;
      else if (s.strength === "medium") mediumSigs++;
      else if (s.strength === "weak") weakSigs++;
      if (s.description?.includes("共振")) confluenceCount++;
      if (s.description?.includes("阻力确认") || s.description?.includes("支撑确认")) keyLevelCount++;
      if (s.description?.includes("均价线拐头")) vwapSlopeCount++;
      if (s.description?.includes("大盘")) indexRegimeCount++;
    }
    return {
      buyCount, strongBuys, sellCount, strongSells,
      totalSigs, strongSigs, mediumSigs, weakSigs,
      confluenceCount, keyLevelCount, vwapSlopeCount, indexRegimeCount,
    };
  }, [timelineSignals]);

  // ── Signal Alert System State ──
  // Initialize with default to avoid hydration mismatch (localStorage read after mount)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  // Read from localStorage after mount
  useEffect(() => {
    try {
      const v = localStorage.getItem("t-sound-enabled");
      if (v !== null) {
        // Use microtask to avoid lint warning about setState in effect
        queueMicrotask(() => setSoundEnabled(v === "true"));
      }
    } catch {}
  }, []);
  const alertedSignalIdsRef = useRef<Set<string>>(new Set());
  const [flashSignal, setFlashSignal] = useState<'buy' | 'sell' | 'stoploss' | null>(null);

  // Persist sound toggle
  useEffect(() => {
    try { localStorage.setItem("t-sound-enabled", String(soundEnabled)); } catch {}
  }, [soundEnabled]);

  // ── Signal Alert: watch for new strong signals ──
  useEffect(() => {
    if (!soundEnabled && flashSignal === null) return;
    const newStrongSignals: { type: 'buy' | 'sell' | 'stoploss'; id: string }[] = [];
    for (let i = 0; i < timelineSignals.length; i++) {
      const sig = timelineSignals[i];
      if (!sig) continue;
      if (sig.strength !== 'strong') continue;
      const id = `${i}-${sig.type}-${sig.reason}`;
      if (!alertedSignalIdsRef.current.has(id)) {
        alertedSignalIdsRef.current.add(id);
        newStrongSignals.push({ type: sig.type, id });
      }
    }
    if (newStrongSignals.length > 0) {
      const latest = newStrongSignals[newStrongSignals.length - 1];
      // Play sound
      if (soundEnabled) {
        playAlertSound(latest.type);
      }
      // Visual flash — use setTimeout to avoid synchronous setState in effect
      const flashType = latest.type;
      setTimeout(() => {
        setFlashSignal(flashType);
        setTimeout(() => setFlashSignal(null), 1200);
      }, 0);
    }
  }, [timelineSignals, soundEnabled]);

  // ── T-Index (做T指数) Computation ──
  const tIndex = useMemo(() => {
    // Start from base 50 (neutral)
    let score = 50;
    // Aggregate all active signals at the latest time point
    for (let i = timelineSignals.length - 1; i >= 0; i--) {
      const sig = timelineSignals[i];
      if (!sig) continue;
      // Only count signals in the latest 5 minutes (most recent 5 data points)
      if (i < timelineSignals.length - 5) break;
      if (sig.type === 'buy') {
        if (sig.strength === 'strong') score += 15;
        else if (sig.strength === 'medium') score += 8;
        else score += 3;
      } else if (sig.type === 'sell') {
        if (sig.strength === 'strong') score -= 15;
        else if (sig.strength === 'medium') score -= 8;
        else score -= 3;
      } else if (sig.type === 'stoploss') {
        score -= 20;
      }
    }
    // Market regime adjustment
    const regime = szIndexRegime?.regime;
    if (regime === '震荡市') score += 5;
    else if (regime === '上升通道') score -= 5;
    else if (regime === '下跌趋势') score -= 10;
    else if (regime === '横盘末期') score -= 15;
    // Cap between 0-100
    return Math.max(0, Math.min(100, score));
  }, [timelineSignals, szIndexRegime]);

  // ── Smart Action Recommendation (智能操作建议) ──
  const smartAction = useMemo(() => {
    // Analyze latest signals, market regime, time window, and T-index
    const lastTime = liveTimeline[liveTimeline.length - 1]?.time;
    const timeWindow = lastTime ? getTimeWindow(lastTime) : undefined;

    // Find the latest strong/medium signals
    let latestStrong: TSignal | null = null;
    let strongCount = 0;
    let mediumCount = 0;
    for (let i = timelineSignals.length - 1; i >= 0; i--) {
      const sig = timelineSignals[i];
      if (!sig) continue;
      if (i < timelineSignals.length - 10) break;
      if (sig.strength === 'strong') { strongCount++; if (!latestStrong) latestStrong = sig; }
      if (sig.strength === 'medium') { mediumCount++; }
    }

    // Check for stoploss
    const hasStoploss = timelineSignals.slice(-10).some(s => s?.type === 'stoploss');
    if (hasStoploss) {
      return {
        icon: '⚡',
        text: '紧急止损',
        reason: '触发止损信号，建议立即平仓',
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10 border-amber-500/25',
        confidence: 95,
        type: 'stoploss' as const,
      };
    }

    // Strong buy signal in buy window
    if (latestStrong?.type === 'buy' && latestStrong.strength === 'strong') {
      const isBuyWindow = timeWindow?.includes('买入') || timeWindow?.includes('低吸');
      return {
        icon: '🟢',
        text: isBuyWindow ? '建议正T买回' : '建议买入',
        reason: `强买入信号(${latestStrong.reason})${isBuyWindow ? '，处于买入时段' : ''}`,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10 border-green-500/25',
        confidence: 80 + strongCount * 5,
        type: 'buy' as const,
      };
    }

    // Strong sell signal in sell window
    if (latestStrong?.type === 'sell' && latestStrong.strength === 'strong') {
      const isSellWindow = timeWindow?.includes('卖出') || timeWindow?.includes('冲高');
      return {
        icon: '🔴',
        text: isSellWindow ? '建议正T卖出' : '建议卖出',
        reason: `强卖出信号(${latestStrong.reason})${isSellWindow ? '，处于卖出时段' : ''}`,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10 border-red-500/25',
        confidence: 80 + strongCount * 5,
        type: 'sell' as const,
      };
    }

    // Medium signals — wait for confirmation
    if (mediumCount > 0 && strongCount === 0) {
      const mediumSig = (() => {
        for (let i = timelineSignals.length - 1; i >= 0; i--) {
          if (timelineSignals[i]?.strength === 'medium') return timelineSignals[i];
        }
        return null;
      })();
      return {
        icon: '📊',
        text: '等待确认',
        reason: `${mediumSig?.type === 'buy' ? '买入' : '卖出'}信号强度中等(${mediumSig?.reason})，等待加强确认`,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10 border-orange-500/25',
        confidence: 50 + mediumCount * 10,
        type: (mediumSig?.type || 'buy') as 'buy' | 'sell',
      };
    }

    // No signals — observe
    return {
      icon: '⏳',
      text: '观望等待',
      reason: tIndex <= 50 ? '做T指数偏低，暂无明显操作机会' : '暂无有效信号，继续观察',
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50 border-border',
      confidence: 30,
      type: 'buy' as const,
    };
  }, [timelineSignals, timeline, tIndex]);

  // ── MA5 value from K-line chart (same as K-line's latest MA5) ──
  const prevDayMA5 = useMemo(() => {
    // Use the latest K-line MA5 value (same as K-line chart)
    if (allChartData.length < 1) return null;
    const lastBar = allChartData[allChartData.length - 1];
    // If today's candle was appended with null MA (real-time merge), fall back to previous bar
    if (lastBar.ma5 != null) return lastBar.ma5;
    if (allChartData.length >= 2) return allChartData[allChartData.length - 2].ma5 ?? null;
    return null;
  }, [allChartData]);

  // ── Key Price Levels (support/resistance) for timeline chart ──
  const keyPriceLevels = useMemo(() => {
    if (liveTimeline.length < 5 || !timelinePrevClose || timelinePrevClose <= 0) return [];
    return computeKeyPriceLevels(timelinePrevClose, liveTimeline);
  }, [liveTimeline, timelinePrevClose]);

  // Memoized tooltip components and wrapperStyle to avoid re-renders
  const tooltipWrapperStyle = useMemo(() => ({ background: 'transparent' as const, border: 'none' as const }), []);
  const klineTooltipEl = useMemo(() => <KLineTooltip />, []);
  const klineVolumeTooltipEl = useMemo(() => <VolumeTooltip />, []);
  const klineMacdTooltipEl = useMemo(() => <MACDTooltip />, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Injected CSS animations for signal alerts */}
      <style dangerouslySetInnerHTML={{ __html: SIGNAL_PULSE_CSS }} />
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Zap className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-bold hidden sm:block">做T助手</h1>
              <Badge variant="outline" className="text-xs hidden sm:flex">A股</Badge>
              {/* Mode Toggle */}
              <div className="flex items-center border border-border rounded-md overflow-hidden ml-1">
                <button
                  onClick={() => setPageMode("t-assistant")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    pageMode === "t-assistant"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  做T
                </button>
                <button
                  onClick={() => setPageMode("screener")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                    pageMode === "screener"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  选股
                </button>
                <button
                  onClick={() => setPageMode("limit-up")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                    pageMode === "limit-up"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TrendingUp className="w-3 h-3" />
                  涨停
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    handleSearch(e.target.value);
                    setShowSearch(true);
                  }}
                  onFocus={() => setShowSearch(true)}
                  placeholder="搜索A股代码或名称..."
                  className="pl-9 pr-8 h-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>

              {showSearch && (searchResults.length > 0 || searchLoading) && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  {searchLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">搜索中...</div>
                  ) : (
                    searchResults.map((stock) => (
                      <button
                        key={stock.symbol}
                        onClick={() => handleSelectStock(stock.symbol)}
                        className="w-full px-4 py-2.5 text-left hover:bg-accent flex items-center justify-between transition-colors"
                      >
                        <div>
                          <span className="font-medium text-sm">{stock.symbol}</span>
                          <span className="ml-2 text-sm text-muted-foreground">{stock.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {stock.type === "ETF" && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-purple-500/10 text-purple-600 border-purple-500/20">ETF</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">{stock.exchange}</Badge>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Quick stocks */}
            <div className="hidden lg:flex items-center gap-1">
              {menuStocks.map((s) => (
                <Button
                  key={s.symbol}
                  variant={symbol === s.symbol ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => handleSelectStock(s.symbol)}
                >
                  {s.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Click outside to close search */}
      {showSearch && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSearch(false)} />
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-4">
        {pageMode === "screener" ? (
          <StockScreener
            onSelectStock={(sym) => {
              selectStock(sym);
              setPageMode("t-assistant");
            }}
          />
        ) : pageMode === "limit-up" ? (
          <LimitUpAnalysis
            onSelectStock={(sym) => {
              selectStock(sym);
              setPageMode("t-assistant");
            }}
          />
        ) : (
        <>
        {/* Stock Info Bar */}
        <Card className={`mb-4 transition-all ${flashSignal === 'buy' ? 'animate-flash-green' : flashSignal ? 'animate-flash-red' : ''}`}>
          <CardContent className="p-4">
            {loading && !quote ? (
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-6 w-20" />
              </div>
            ) : quote ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="font-bold text-lg">{quote.symbol}</div>
                    <div className="text-sm text-muted-foreground">{quote.name}</div>
                  </div>
                  <button
                    onClick={toggleMenuStock}
                    title={isInMenu ? "从菜单栏移除" : "添加到菜单栏"}
                    className={`p-1.5 rounded-md transition-colors ${
                      isInMenu
                        ? "text-yellow-500 hover:text-yellow-600 bg-yellow-500/10"
                        : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
                    }`}
                  >
                    <Star className="h-4 w-4" fill={isInMenu ? "currentColor" : "none"} />
                  </button>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold tabular-nums ${priceColor}`}>
                    {formatNum(quote.price)}
                  </span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${priceColor}`}>
                    {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {formatNum(Math.abs(quote.change))}
                    ({formatNum(Math.abs(quote.changePercent))}%)
                  </span>
                </div>

                {(chartMode === "timeline" ? latestTimelineSignal : (latestSignal && latestSignal.type !== "hold" ? latestSignal : null)) && (
                  <Badge
                    variant={(chartMode === "timeline" ? latestTimelineSignal!.type : latestSignal!.type) === "buy" ? "default" : "destructive"}
                    className="text-xs px-3 py-1"
                  >
                    {((chartMode === "timeline" ? latestTimelineSignal!.type : latestSignal!.type) === "buy" ? "🟢 买入信号" : "🔴 卖出信号")} · {(chartMode === "timeline" ? latestTimelineSignal!.reason : latestSignal!.reason)}
                  </Badge>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm ml-auto">
                  <div>
                    <span className="text-muted-foreground">开盘</span>{" "}
                    <span className="font-mono">{formatNum(quote.open)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">最高</span>{" "}
                    <span className="font-mono text-red-500">{formatNum(quote.high)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">最低</span>{" "}
                    <span className="font-mono text-green-500">{formatNum(quote.low)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">昨收</span>{" "}
                    <span className="font-mono">{formatNum(quote.prevClose)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">成交量</span>{" "}
                    <span className="font-mono">{formatVolume(quote.volume)}</span>
                  </div>
                  {quote.turnover != null && quote.turnover > 0 && (
                    <div>
                      <span className="text-muted-foreground">换手</span>{" "}
                      <span className="font-mono">{quote.turnover.toFixed(2)}%</span>
                    </div>
                  )}
                  {quote.peRatio > 0 && (
                    <div>
                      <span className="text-muted-foreground">PE</span>{" "}
                      <span className="font-mono">{formatNum(quote.peRatio)}</span>
                    </div>
                  )}
                  {quote.marketCap > 0 && (
                    <div>
                      <span className="text-muted-foreground">市值</span>{" "}
                      <span className="font-mono">{formatMarketCap(quote.marketCap)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">选择或搜索A股开始分析</div>
            )}
          </CardContent>
        </Card>

        {/* T-Index & Smart Action Panel */}
        {quote && liveTimeline.length > 0 && (
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* T-Index Card */}
            <Card className="border overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-4">
                  {/* Circular Gauge */}
                  <div className="relative shrink-0">
                    <svg width="72" height="72" viewBox="0 0 72 72">
                      {/* Background arc */}
                      <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="6" strokeDasharray={`${Math.PI * 30}`} strokeDashoffset="0" transform="rotate(-90 36 36)" strokeLinecap="round" />
                      {/* Score arc */}
                      <circle cx="36" cy="36" r="30" fill="none" stroke={getTIndexColor(tIndex)} strokeWidth="6" strokeDasharray={`${(tIndex / 100) * Math.PI * 30} ${Math.PI * 30}`} strokeDashoffset="0" transform="rotate(-90 36 36)" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }} />
                    </svg>
                    {/* Score number in center */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold tabular-nums" style={{ color: getTIndexColor(tIndex) }}>{tIndex}</span>
                    </div>
                  </div>
                  {/* Score details */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">做T指数</div>
                    <div className={`text-base font-bold ${getTIndexLabelColor(tIndex)}`}>{getTIndexLabel(tIndex)}</div>
                    {/* Score bar */}
                    <div className="mt-2 h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${tIndex}%`, backgroundColor: getTIndexColor(tIndex) }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
                      <span>卖出</span><span>观望</span><span>做T</span><span>优质</span>
                    </div>
                  </div>
                  {/* Pulsing indicator for strong signals */}
                  {latestTimelineSignal?.strength === 'strong' && (
                    <div className="animate-signal-pulse shrink-0">
                      <Volume2 className="h-5 w-5" style={{ color: latestTimelineSignal.type === 'buy' ? '#22c55e' : latestTimelineSignal.type === 'stoploss' ? '#f59e0b' : '#ef4444' }} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Smart Action Recommendation Card */}
            <Card className={`border overflow-hidden ${smartAction.bgColor}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  {/* Main recommendation */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">智能操作建议</div>
                    <div className={`text-lg font-bold ${smartAction.color}`}>
                      {smartAction.icon} {smartAction.text}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{smartAction.reason}</div>
                    {/* Time window indicator */}
                    {(() => {
                      const lastTime = liveTimeline[liveTimeline.length - 1]?.time;
                      const tw = lastTime ? getTimeWindow(lastTime) : null;
                      if (!tw) return null;
                      const twColor = tw === '开盘观察' || tw === '尾盘不操作'
                        ? 'text-muted-foreground bg-muted/50'
                        : tw.includes('卖出') ? 'text-red-600 bg-red-500/10' : 'text-green-600 bg-green-500/10';
                      return (
                        <Badge variant="outline" className={`text-[10px] h-5 mt-2 ${twColor}`}>
                          <Clock className="h-2.5 w-2.5 mr-0.5" />{tw}
                        </Badge>
                      );
                    })()}
                    {/* News Analysis Tags */}
                    {newsData && (newsData.market || newsData.sector || newsData.stock) && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {(["market", "sector", "stock"] as const).map((tab) => {
                          const d = newsData[tab];
                          if (!d?.analysis) return null;
                          const a = d.analysis;
                          const labels = { market: "大盘", sector: d.sectorName ? `${d.sectorName}` : "板块", stock: quote?.name || "个股" };
                          const trendColors: Record<string, string> = {
                            "上升": "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
                            "下降": "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
                            "震荡": "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
                          };
                          const sentimentIcons: Record<string, string> = { "偏多": "🔺", "偏空": "🔻", "中性": "↔️" };
                          const tc = trendColors[a.trend] || trendColors["震荡"];
                          const si = sentimentIcons[a.newsSentiment] || "↔️";
                          return (
                            <span key={tab} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${tc}`}>
                              {labels[tab]}: {a.trend} {si}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Confidence bar */}
                  <div className="shrink-0 w-16 text-center">
                    <div className="text-[10px] text-muted-foreground mb-1">信心度</div>
                    <div className="text-sm font-bold tabular-nums" style={{ color: smartAction.confidence >= 80 ? '#22c55e' : smartAction.confidence >= 50 ? '#f59e0b' : '#9ca3af' }}>
                      {Math.min(smartAction.confidence, 100)}%
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(smartAction.confidence, 100)}%`,
                          backgroundColor: smartAction.confidence >= 80 ? '#22c55e' : smartAction.confidence >= 50 ? '#f59e0b' : '#9ca3af',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Chart Mode & Interval Selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {isAShareStock && (
            <Tabs value={chartMode} onValueChange={(v) => changeChartMode(v as ChartMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="timeline" className="text-xs px-3 h-6">
                  <LineChart className="h-3.5 w-3.5 mr-1" />
                  分时
                </TabsTrigger>
                <TabsTrigger value="kline" className="text-xs px-3 h-6">
                  <CandlestickChart className="h-3.5 w-3.5 mr-1" />
                  K线
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* News Analysis Button */}
          <Button
            variant={showNewsAnalysis ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs px-3"
            onClick={() => {
              const next = !showNewsAnalysis;
              setShowNewsAnalysis(next);
              if (next && !newsData.market) fetchNewsAnalysis();
            }}
          >
            <Newspaper className="h-3.5 w-3.5 mr-1" />
            资讯分析
          </Button>

          {chartMode === "kline" && (
            <div className="flex items-center gap-1">
              {INTERVALS.map((intv) => (
                <Button
                  key={intv.value}
                  variant={interval === intv.value ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => changeInterval(intv.value)}
                >
                  {intv.label}
                </Button>
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {/* Price / AvgPrice deviation badge */}
            {(() => {
              const lastTl = liveTimeline[liveTimeline.length - 1];
              if (lastTl && lastTl.avgPrice && lastTl.avgPrice > 0) {
                const deviation = ((lastTl.price - lastTl.avgPrice) / lastTl.avgPrice) * 100;
                const isAbove = deviation >= 0;
                return (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${
                      isAbove
                        ? "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400"
                        : "bg-green-500/10 border-green-500/25 text-green-600 dark:text-green-400"
                    }`}
                    title={`价格 ${lastTl.price.toFixed(2)} 相对均价 ${lastTl.avgPrice.toFixed(2)} 偏离 ${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}%`}
                  >
                    <span className="opacity-70">{isAbove ? "↑均线上方" : "↓均线下方"}</span>
                    <span className="font-mono">{deviation >= 0 ? "+" : ""}{deviation.toFixed(2)}%</span>
                  </span>
                );
              }
              return null;
            })()}
            {/* Sound Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setSoundEnabled(prev => !prev)}
              title={soundEnabled ? '关闭声音提醒' : '开启声音提醒'}
            >
              {soundEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
            </Button>
            <Clock className="h-3 w-3" />
            实时刷新 3s
          </div>
        </div>

        {/* Error */}
        {error && (
          <Card className="mb-4 border-destructive/50">
            <CardContent className="p-4 text-destructive text-sm">{error}</CardContent>
          </Card>
        )}

        {/* Charts */}
        {loading && chartData.length === 0 && liveTimeline.length === 0 ? (
          <div className="space-y-4">
            <Skeleton className="h-[400px] w-full" />
            <Skeleton className="h-[150px] w-full" />
            <Skeleton className="h-[100px] w-full" />
          </div>
        ) : chartMode === "timeline" && liveTimeline.length > 0 ? (
          <div className="space-y-4">
            {/* ─── 同花顺风格 统一分时面板 ─── */}
            <TimeSharingPanel
              data={liveTimeline}
              prevClose={timelinePrevClose}
              symbol={symbol}
              signals={timelineSignals}
              macdData={timelineMACDData}
              visibleMinutes={tlVisibleMinutes}
              onZoomIn={tlZoomIn}
              onZoomOut={tlZoomOut}
              onZoomReset={tlZoomReset}
              zoomIdx={tlZoomIdx}
              maxZoomIdx={TL_ZOOM_LEVELS.length - 1}
              prevDayMA5={prevDayMA5}
              szIndexRegime={szIndexRegime}
              activeIndexKey={activeIndexKey}
              indexConfig={INDEX_CONFIG}
              onCycleIndex={cycleIndexKey}
              keyPriceLevels={keyPriceLevels}
              panOffset={tlPanOffset}
              onPanOffsetChange={setTlPanOffset}
              sectorRegime={sectorRegime}
              sectorInfo={sectorInfo}
              pvMarkers={pvMarkers}
            />
          </div>
        ) : chartData.length > 0 ? (
          <div
            ref={klineChartContainerRef}
            className="space-y-1"
          >
            {/* K-Line Chart with Candlesticks */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <CardTitle className="text-sm font-medium">{symbol} · K线走势</CardTitle>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
                    MA5{chartData.length > 0 && chartData[chartData.length - 1]?.ma5 != null ? ` ${chartData[chartData.length - 1].ma5!.toFixed(2)}` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    MA10{chartData.length > 0 && chartData[chartData.length - 1]?.ma10 != null ? ` ${chartData[chartData.length - 1].ma10!.toFixed(2)}` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
                    MA20{chartData.length > 0 && chartData[chartData.length - 1]?.ma20 != null ? ` ${chartData[chartData.length - 1].ma20!.toFixed(2)}` : ''}
                  </span>
                  {/* Zoom Controls */}
                  <div className="ml-auto flex items-center gap-1">
                    {allChartData.length > klineVisibleBars && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const maxOffset = allChartData.length - klineVisibleBars;
                          const step = Math.max(1, Math.round(klineVisibleBars * 0.3));
                          setKlinePanOffset(Math.min(klinePanOffset + step, maxOffset));
                        }}
                        disabled={klinePanOffset >= allChartData.length - klineVisibleBars}
                        title="向左平移（查看更早数据）"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={zoomIn}
                      disabled={klineVisibleBars <= ZOOM_LEVELS[0]}
                      title="放大（减少K线数）"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[10px] text-muted-foreground tabular-nums min-w-[48px] text-center">
                      {chartData.length}根
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={zoomOut}
                      disabled={klineVisibleBars >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1] || klineVisibleBars >= allChartData.length}
                      title="缩小（增加K线数）"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    {allChartData.length > klineVisibleBars && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const step = Math.max(1, Math.round(klineVisibleBars * 0.3));
                          setKlinePanOffset(Math.max(0, klinePanOffset - step));
                        }}
                        disabled={klinePanOffset <= 0}
                        title="向右平移（查看最新数据）"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={zoomReset}
                      title="重置缩放"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-2 px-2">
                <ResponsiveContainer width="100%" height={460}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[minPrice - pricePadding, maxPrice + pricePadding]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(2)} />
                    <Tooltip content={klineTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
                    <Bar dataKey="close" opacity={0} isAnimationActive={false} barSize={chartData.length > 150 ? 5 : chartData.length > 80 ? 7 : chartData.length > 50 ? 9 : 12} />
                    <Customized component={CandlestickRenderer} />
                    <Line type="monotone" dataKey="ma5" stroke="#eab308" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="ma10" stroke="#3b82f6" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="ma20" stroke="#a855f7" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Volume Chart */}
            <Card>
              <CardHeader className="pb-1 pt-2 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  成交量
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-2 px-2">
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, maxVolume * 1.01]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => formatVolume(v)} />
                    <Tooltip content={klineVolumeTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
                    <Bar dataKey="volume" isAnimationActive={false} barSize={chartData.length > 150 ? 5 : chartData.length > 80 ? 7 : chartData.length > 50 ? 9 : 12}
                      shape={(props: any) => {
                        const { x, y, width, height, payload } = props;
                        return <rect x={x} y={y} width={width} height={height} fill={payload.close >= payload.open ? "#ef4444" : "#16a34a"} />;
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* MACD Chart */}
            <Card>
              <CardHeader className="pb-1 pt-2 px-4">
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <CardTitle className="text-sm font-medium">MACD</CardTitle>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    DIF
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
                    DEA
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-1.5 bg-red-500 rounded-sm" />
                    <span className="inline-block w-3 h-1.5 bg-green-500 rounded-sm" />
                    MACD柱
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pb-2 px-2">
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[macdMin - macdPadding, macdMax + macdPadding]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={65} tickFormatter={(v: number) => v.toFixed(3)} />
                    <Tooltip content={klineMacdTooltipEl} cursor={false} wrapperStyle={tooltipWrapperStyle} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Bar dataKey="macd" isAnimationActive={false} barSize={chartData.length > 150 ? 5 : chartData.length > 80 ? 7 : chartData.length > 50 ? 9 : 12}
                      shape={(props: any) => {
                        const { x, y, width, height, payload } = props;
                        if (payload?.macd == null) return null;
                        const h = Math.abs(height || 0);
                        if (h < 0.3) return null;
                        const ry = height < 0 ? y + height : y;
                        return <rect x={x} y={ry} width={width} height={h} fill={payload.macd >= 0 ? "#ef4444" : "#16a34a"} />;
                      }}
                    />
                    <Line type="monotone" dataKey="dif" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="dea" stroke="#f97316" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        ) : (
          !loading && (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">选择A股开始分析</p>
                <p className="text-sm">在搜索框中输入股票代码或名称，或点击上方热门股票</p>
              </CardContent>
            </Card>
          )
        )}

        {/* ── Market Index & Sector Overview ── */}
        {chartMode === "timeline" && liveTimeline.length > 0 && (() => {
          const szData = indexTimelineData[activeIndexKey];
          const idxInfo = INDEX_CONFIG[activeIndexKey];
          const hasIdxData = szData && szData.items.length > 10;
          const hasSectorData = sectorTimelineData.items.length > 10 && sectorInfo;

          // Regime badge helper
          const regimeBadge = (regime: RegimeDetail | null) => {
            if (!regime) return null;
            const cfg = REGIME_CONFIG[regime.regime] || REGIME_CONFIG["震荡市"];
            return (
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
                <span>{cfg.icon}</span>
                <span>{regime.regime}</span>
              </span>
            );
          };

          if (!hasIdxData && !hasSectorData) return null;

          return (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">大盘 & 板块走势</span>
                <span className="text-[10px] text-muted-foreground">— 与个股联动参考</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hasIdxData && (
                  <MiniTimelinePanel
                    title={idxInfo?.label || "深证成指"}
                    data={szData.items}
                    prevClose={szData.prevClose}
                    badge={
                      <div className="flex items-center gap-1 ml-auto">
                        {regimeBadge(szIndexRegime)}
                        <span
                          className="text-[8px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none"
                          onClick={cycleIndexKey}
                          title="点击切换指数"
                        >
                          切换
                        </span>
                      </div>
                    }
                  />
                )}
                {hasSectorData && (
                  <MiniTimelinePanel
                    title={`${sectorInfo.name}板块`}
                    data={sectorTimelineData.items}
                    prevClose={sectorTimelineData.prevClose}
                    badge={<div className="ml-auto">{regimeBadge(sectorRegime)}</div>}
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* T-Trading Signals Summary */}
        {(chartData.length > 0 || (chartMode === "timeline" && liveTimeline.length > 0)) && (
          <Card className="mt-4">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                做T信号分析
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {chartMode === "timeline" && signalCounts.totalSigs > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="text-red-500"><TrendingUp className="h-4 w-4" /></div>
                      <div>
                        <div className="text-xs text-muted-foreground">买入信号</div>
                        <div className="text-sm font-medium text-red-500">
                          {signalCounts.buyCount}个 {signalCounts.strongBuys > 0 && `(强信号${signalCounts.strongBuys}个)`}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="text-green-500"><TrendingDown className="h-4 w-4" /></div>
                      <div>
                        <div className="text-xs text-muted-foreground">卖出信号</div>
                        <div className="text-sm font-medium text-green-500">
                          {signalCounts.sellCount}个 {signalCounts.strongSells > 0 && `(强信号${signalCounts.strongSells}个)`}
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const lastTL = liveTimeline[liveTimeline.length - 1];
                      if (!lastTL) return null;
                      const aboveVWAP = lastTL.price > lastTL.avgPrice;
                      const dev = ((lastTL.price - lastTL.avgPrice) / lastTL.avgPrice * 100).toFixed(2);

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={aboveVWAP ? "text-red-500" : "text-green-500"}>
                            <Activity className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">价格/均价</div>
                            <div className={`text-sm font-medium ${aboveVWAP ? "text-red-500" : "text-green-500"}`}>
                              {aboveVWAP ? "均线上方" : "均线下方"} ({aboveVWAP ? "+" : ""}{dev}%)
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Pulse & Volume Surge Markers Summary */}
                  {pvMarkers.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pvMarkers.map((m, i) => (
                        <div key={`pvm-${i}`} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border ${
                          m.type === "pulse"
                            ? "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-cyan-500/5 border-cyan-500/20 text-cyan-700 dark:text-cyan-300"
                        }`}>
                          {m.type === "pulse" ? <Zap className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                          <span className="font-mono">{m.time}</span>
                          <span className="font-medium">{m.label}</span>
                          <span className="text-muted-foreground">{m.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Signal Timeline */}
                  <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                    {(() => {
                      const startIdx = Math.max(0, timelineSignals.length - 50);
                      return timelineSignals.slice(startIdx).map((sig, i) => {
                      if (!sig) return null;
                      const origIdx = startIdx + i;
                      const hasEnhance = sig.description?.includes("共振") || sig.description?.includes("确认→") || sig.description?.includes("大盘");
                      return (
                        <div key={`sig-${origIdx}`} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
                          <Badge variant={sig.type === "buy" ? "default" : "destructive"} className="text-xs h-5 shrink-0">
                            {sig.type === "buy" ? "买" : "卖"}
                          </Badge>
                          <span className="font-mono text-muted-foreground">{timeline[origIdx]?.time}</span>
                          <span className={sig.type === "buy" ? "text-red-500" : "text-green-500"}>{sig.reason}</span>
                          <span className="text-muted-foreground ml-auto">
                            {sig.strength === "strong" ? "强" : sig.strength === "medium" ? "中" : "弱"}
                          </span>
                          {hasEnhance && (
                            <Shield className="h-3 w-3 text-amber-500 shrink-0" title={sig.description} />
                          )}
                        </div>
                      );
                    })})()}
                  </div>

                  {/* v3.6 胜率增强提示 */}
                  {(() => {
                    const { totalSigs, strongSigs, confluenceCount, keyLevelCount, vwapSlopeCount, indexRegimeCount } = signalCounts;
                    const strongRatio = totalSigs > 0 ? (strongSigs / totalSigs * 100).toFixed(0) : "0";

                    const enhancements: { icon: string; label: string; count: number; color: string }[] = [
                      { icon: "🎯", label: "因子共振", count: confluenceCount, color: "text-amber-600 dark:text-amber-400" },
                      { icon: "📍", label: "关键价位", count: keyLevelCount, color: "text-blue-600 dark:text-blue-400" },
                      { icon: "📐", label: "均价拐头", count: vwapSlopeCount, color: "text-purple-600 dark:text-purple-400" },
                      { icon: "🌐", label: "大盘联动", count: indexRegimeCount, color: "text-teal-600 dark:text-teal-400" },
                    ];
                    const activeEnhancements = enhancements.filter(e => e.count > 0);

                    if (activeEnhancements.length === 0) return null;

                    return (
                      <div className="mt-3 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">胜率增强 (v3.6)</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">强信号占比 {strongRatio}%</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {activeEnhancements.map(e => (
                            <span key={e.label} className={`inline-flex items-center gap-1 text-[10px] ${e.color}`}>
                              <span>{e.icon}</span>
                              <span>{e.label}</span>
                              <span className="font-mono font-bold">{e.count}</span>
                            </span>
                          ))}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-1.5 leading-relaxed">
                          {confluenceCount > 0 && "多因子共振确认的信号胜率显著高于单因子。"}
                          {keyLevelCount > 0 && "关键价位附近的信号更可靠。"}
                          {vwapSlopeCount > 0 && "均价线拐头确认趋势反转。"}
                          {indexRegimeCount > 0 && "大盘方向与个股信号一致时增强。"}
                        </div>
                      </div>
                    );
                  })()}

                  {latestTimelineSignal && (
                    <div className="mt-4 p-3 rounded-lg border border-border">
                      <div className="flex items-start gap-2">
                        <Badge
                          variant={latestTimelineSignal.type === "buy" ? "default" : "destructive"}
                          className="shrink-0 mt-0.5"
                        >
                          {latestTimelineSignal.type === "buy" ? "做多T" : "做空T"}
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          {latestTimelineSignal.reason}。信号强度:{" "}
                          {latestTimelineSignal.strength === "strong" ? "强" : latestTimelineSignal.strength === "medium" ? "中" : "弱"}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : chartData.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(() => {
                      const lastItem = chartData[chartData.length - 1];
                      const prevItem = chartData.length > 1 ? chartData[chartData.length - 2] : null;

                      let macdSignal = "震荡";
                      let macdColor = "text-muted-foreground";
                      let macdIcon = <Minus className="h-4 w-4" />;

                      if (lastItem?.dif != null && lastItem?.dea != null && prevItem?.dif != null && prevItem?.dea != null) {
                        if (prevItem.dif! <= prevItem.dea! && lastItem.dif! > lastItem.dea!) {
                          macdSignal = "金叉买入";
                          macdColor = "text-red-500";
                          macdIcon = <TrendingUp className="h-4 w-4" />;
                        } else if (prevItem.dif! >= prevItem.dea! && lastItem.dif! < lastItem.dea!) {
                          macdSignal = "死叉卖出";
                          macdColor = "text-green-500";
                          macdIcon = <TrendingDown className="h-4 w-4" />;
                        } else if (lastItem.dif! > lastItem.dea!) {
                          macdSignal = "多头趋势";
                          macdColor = "text-red-500";
                          macdIcon = <TrendingUp className="h-4 w-4" />;
                        } else {
                          macdSignal = "空头趋势";
                          macdColor = "text-green-500";
                          macdIcon = <TrendingDown className="h-4 w-4" />;
                        }
                      }

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={macdColor}>{macdIcon}</div>
                          <div>
                            <div className="text-xs text-muted-foreground">MACD信号</div>
                            <div className={`text-sm font-medium ${macdColor}`}>{macdSignal}</div>
                          </div>
                        </div>
                      );
                    })()}

                    {(() => {
                      const lastItem = chartData[chartData.length - 1];
                      const avgVol = chartData.slice(-20).reduce((s, d) => s + d.volume, 0) / Math.min(20, chartData.length);
                      const volRatio = lastItem && avgVol > 0 ? lastItem.volume / avgVol : 1;

                      let volSignal = "正常量";
                      let volColor = "text-muted-foreground";

                      if (volRatio > 2) {
                        volSignal = "放量";
                        volColor = "text-orange-500";
                      } else if (volRatio > 1.5) {
                        volSignal = "温和放量";
                        volColor = "text-yellow-500";
                      } else if (volRatio < 0.5) {
                        volSignal = "缩量";
                        volColor = "text-blue-500";
                      }

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={volColor}>
                            <BarChart3 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">量能状态</div>
                            <div className={`text-sm font-medium ${volColor}`}>
                              {volSignal} ({volRatio.toFixed(2)}x)
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {(() => {
                      const lastItem = chartData[chartData.length - 1];
                      let trendSignal = "整理";
                      let trendColor = "text-muted-foreground";

                      if (lastItem?.ma5 != null && lastItem?.ma10 != null && lastItem?.ma20 != null) {
                        if (lastItem.ma5! > lastItem.ma10! && lastItem.ma10! > lastItem.ma20!) {
                          trendSignal = "多头排列";
                          trendColor = "text-red-500";
                        } else if (lastItem.ma5! < lastItem.ma10! && lastItem.ma10! < lastItem.ma20!) {
                          trendSignal = "空头排列";
                          trendColor = "text-green-500";
                        }
                      }

                      return (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className={trendColor}>
                            <Activity className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">均线趋势</div>
                            <div className={`text-sm font-medium ${trendColor}`}>{trendSignal}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {latestSignal && latestSignal.type !== "hold" && (
                    <div className="mt-4 p-3 rounded-lg border border-border">
                      <div className="flex items-start gap-2">
                        <Badge
                          variant={latestSignal.type === "buy" ? "default" : "destructive"}
                          className="shrink-0 mt-0.5"
                        >
                          {latestSignal.type === "buy" ? "做多T" : "做空T"}
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          {latestSignal.reason}。信号强度:{" "}
                          {latestSignal.strength === "strong" ? "强" : latestSignal.strength === "medium" ? "中" : "弱"}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* News Analysis Panel */}
        {showNewsAnalysis && (
          <Card className="mb-4">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Newspaper className="h-4 w-4" />
                  资讯分析 · {newsActiveTab === "overseas" ? "美港股分析" : `${currentPredictionDay}预判`}
                  {newsActiveTab !== "overseas" && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {currentPredictionDay === "今日" ? "(11:30前)" : "(11:30后)"}
                    </span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Cache freshness timer */}
                  {newsData[newsActiveTab] && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {newsCacheAge < 60 ? `${newsCacheAge}秒前` :
                       newsCacheAge < 3600 ? `${Math.floor(newsCacheAge / 60)}分钟前` :
                       `${Math.floor(newsCacheAge / 3600)}小时前`}
                      {newsCacheAge > 600 && (
                        <span className="text-amber-500 ml-0.5">·建议刷新</span>
                      )}
                    </span>
                  )}
                  {newsData[newsActiveTab]?.sourceDiversity && (
                    <span className="text-[10px] text-muted-foreground">
                      {Object.values(newsData[newsActiveTab].sourceDiversity).reduce((a: number, b: any) => a + Number(b), 0)}条 · {Object.keys(newsData[newsActiveTab].sourceDiversity).length}渠道
                    </span>
                  )}
                  {/* Cache status badges */}
                  {newsData[newsActiveTab] && !newsData[newsActiveTab]?.cached && newsLoading && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      缓存·检查更新中
                    </span>
                  )}
                  {!newsLoading && newsData[newsActiveTab] && !newsData[newsActiveTab]?.cached && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      本地缓存
                    </span>
                  )}
                  {newsData[newsActiveTab]?.cached && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      服务端缓存
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => fetchNewsAnalysis()}
                    disabled={newsLoading}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${newsLoading ? 'animate-spin' : ''}`} />
                    刷新
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setShowNewsAnalysis(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              {/* Tabs: 大盘 / 板块 / 个股 / 美港股 */}
              <div className="flex items-center gap-1 mb-4">
                {(["market", "sector", "stock", "overseas"] as const).map((tab) => {
                  const labels = { market: "大盘分析", sector: "板块分析", stock: "个股分析", overseas: "美港股" };
                  const icons = { market: "📈", sector: "🏭", stock: "📊", overseas: "🌍" };
                  const disabled = tab === "sector" && !sectorInfo;
                  return (
                    <Button
                      key={tab}
                      variant={newsActiveTab === tab ? "default" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-3"
                      onClick={() => { setNewsActiveTab(tab); setNewsFilterSource("all"); setNewsFilterDimension("all"); }}
                      disabled={disabled}
                    >
                      <span className="mr-1">{icons[tab]}</span>
                      {labels[tab]}
                    </Button>
                  );
                })}
                {/* Prediction accuracy badge */}
                {predictionStats.withFeedback > 0 && (
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                    predictionStats.accuracy >= 60 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                    predictionStats.accuracy >= 40 ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' :
                    'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                  }`}>
                    <Target className="h-3 w-3" />
                    {currentPredictionDay}预判准确率 {predictionStats.accuracy}%
                  </span>
                )}
              </div>

              {/* Content */}
              {newsLoading && !newsData[newsActiveTab] ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {newsActiveTab === "market" ? `正在多渠道搜索大盘资讯，深度分析${currentPredictionDay}走势...` :
                     newsActiveTab === "sector" ? `正在多渠道搜索板块资讯，深度分析${currentPredictionDay}走势...` :
                     newsActiveTab === "overseas" ? `正在搜索隔夜美港股资讯，分析外盘影响...` :
                     `正在多渠道搜索个股资讯，深度分析${currentPredictionDay}走势...`}
                  </span>
                  <span className="text-xs text-muted-foreground/60">搜索维度：宏观政策 · 资金流向 · 外盘影响 · 技术分析</span>
                </div>
              ) : newsData[newsActiveTab] ? (
                <div className="space-y-3">
                  {(() => {
                    const data = newsData[newsActiveTab];
                    const analysis = data.analysis;
                    if (!analysis) return null;

                    const trendConfig: Record<string, { bg: string; text: string; icon: string; border: string }> = {
                      "上升": { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: "📈", border: "border-red-500/30" },
                      "下降": { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", icon: "📉", border: "border-green-500/30" },
                      "震荡": { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", icon: "↔️", border: "border-yellow-500/30" },
                    };
                    const cfg = trendConfig[analysis.trend] || trendConfig["震荡"];
                    const suggestionConfig: Record<string, { bg: string; text: string }> = {
                      "正T": { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-600 dark:text-blue-400" },
                      "反T": { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-600 dark:text-orange-400" },
                      "观望": { bg: "bg-gray-500/10 border-gray-500/30", text: "text-gray-600 dark:text-gray-400" },
                    };
                    const sCfg = suggestionConfig[analysis.suggestion] || suggestionConfig["观望"];
                    const riskConfig: Record<string, { bg: string; text: string }> = {
                      "高": { bg: "bg-red-500/15 border-red-500/30", text: "text-red-600 dark:text-red-400" },
                      "中": { bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-600 dark:text-yellow-400" },
                      "低": { bg: "bg-green-500/15 border-green-500/30", text: "text-green-600 dark:text-green-400" },
                    };
                    const rCfg = riskConfig[analysis.riskLevel] || riskConfig["中"];
                    const sentimentConfig: Record<string, { icon: string; text: string; color: string }> = {
                      "偏多": { icon: "🔺", text: "偏多", color: "text-red-500" },
                      "偏空": { icon: "🔻", text: "偏空", color: "text-green-500" },
                      "中性": { icon: "↔️", text: "中性", color: "text-yellow-500" },
                    };
                    const sentCfg = sentimentConfig[analysis.newsSentiment] || sentimentConfig["中性"];

                    return (
                      <>
                        {/* ── Top: Trend Overview + Sentiment Radar ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                          {/* Left: Trend Overview Card (3 cols) */}
                          <div className={`sm:col-span-3 rounded-lg border p-4 ${cfg.bg} ${cfg.border}`}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{cfg.icon}</span>
                                <div>
                                  <div className={`text-lg font-bold ${cfg.text}`}>
                                    {newsActiveTab === "overseas" ? `A股影响：${analysis.trend}` : `${currentPredictionDay}预判：${analysis.trend}`}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {newsActiveTab === "market" ? "大盘" : newsActiveTab === "sector" ? `${data.sectorName}板块` : newsActiveTab === "overseas" ? "美港股" : quote?.name || symbol} · {data.timestamp ? new Date(data.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "--"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1.5">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${sCfg.bg} ${sCfg.text}`}>
                                  {newsActiveTab === "overseas" ? "A股建议" : `${currentPredictionDay}建议`}：{analysis.suggestion}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${rCfg.bg} ${rCfg.text}`}>
                                    风险{analysis.riskLevel}
                                  </span>
                                  <span className={`text-xs font-medium ${sentCfg.color}`}>
                                    {sentCfg.icon} {sentCfg.text}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Confidence Bar */}
                            <div className="mb-3">
                              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                <span>信心度</span>
                                <span className="font-medium">{analysis.confidence}%</span>
                              </div>
                              <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(analysis.confidence || 0, 100)}%`,
                                    backgroundColor: analysis.confidence >= 70 ? '#22c55e' : analysis.confidence >= 40 ? '#f59e0b' : '#ef4444',
                                  }}
                                />
                              </div>
                            </div>

                            {/* Summary */}
                            <p className="text-sm text-foreground/80 mb-3">{analysis.summary}</p>

                            {/* Key Factors */}
                            {analysis.keyFactors && analysis.keyFactors.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {analysis.keyFactors.map((factor: string, i: number) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-xs text-muted-foreground">
                                    <Zap className="h-3 w-3" />
                                    {factor}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Right: Sentiment Radar Chart (2 cols) */}
                          <div className="sm:col-span-2 rounded-lg border border-border/50 bg-muted/5 p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">情绪雷达</span>
                            </div>
                            <svg viewBox="0 0 200 180" className="w-full max-w-[200px] mx-auto">
                              {/* Grid polygons */}
                              {[20, 40, 60, 80, 100].map(level => {
                                const r = level * 0.7;
                                const pts = [
                                  [100, 90 - r],
                                  [100 + r * Math.sin(Math.PI / 2), 90 + r * Math.cos(Math.PI / 2)],
                                  [100, 90 + r * 0.8],
                                  [100 - r * Math.sin(Math.PI / 2), 90 + r * Math.cos(Math.PI / 2)],
                                ].map(p => p.join(",")).join(" ");
                                return <polygon key={level} points={pts} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={0.5} />;
                              })}
                              {/* Axis lines */}
                              {[[100, 90 - 70], [100 + 70 * Math.sin(Math.PI / 2), 90 + 70 * Math.cos(Math.PI / 2)], [100, 90 + 56], [100 - 70 * Math.sin(Math.PI / 2), 90 + 70 * Math.cos(Math.PI / 2)]].map((p, i) => (
                                <line key={i} x1={100} y1={90} x2={p[0]} y2={p[1]} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
                              ))}
                              {/* Data polygon */}
                              {(() => {
                                const scores = sentimentScores;
                                const pts = scores.map((s, i) => {
                                  const angle = -Math.PI / 2 + i * (Math.PI / 2);
                                  const r = s * 0.7;
                                  return `${100 + r * Math.cos(angle)},${90 + r * Math.sin(angle)}`;
                                }).join(" ");
                                const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                                const fill = avg >= 60 ? 'rgba(239,68,68,0.15)' : avg >= 40 ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)';
                                const stroke = avg >= 60 ? '#ef4444' : avg >= 40 ? '#eab308' : '#22c55e';
                                return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.5} />;
                              })()}
                              {/* Data points + Labels */}
                              {sentimentScores.map((s, i) => {
                                const angle = -Math.PI / 2 + i * (Math.PI / 2);
                                const r = s * 0.7;
                                const cx = 100 + r * Math.cos(angle);
                                const cy = 90 + r * Math.sin(angle);
                                const labelR = 78;
                                const lx = 100 + labelR * Math.cos(angle);
                                const ly = 90 + labelR * Math.sin(angle);
                                const labels = radarLabels;
                                return (
                                  <g key={i}>
                                    <circle cx={cx} cy={cy} r={3} fill={s >= 60 ? '#ef4444' : s >= 40 ? '#eab308' : '#22c55e'} />
                                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="text-[8px] fill-muted-foreground">{labels[i]}</text>
                                    <text x={lx} y={ly + 9} textAnchor="middle" dominantBaseline="middle" className="text-[7px] fill-muted-foreground/60">{s}</text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        </div>

                        {/* ── Top 5 Gaining Sectors (overseas only) ── */}
                        {newsActiveTab === "overseas" && analysis.topSectors && analysis.topSectors.length > 0 && (
                          <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                            <div className="flex items-center gap-1.5 mb-3">
                              <Trophy className="h-3.5 w-3.5 text-amber-500" />
                              <span className="text-xs font-medium">涨幅前五板块</span>
                              <span className="text-[10px] text-muted-foreground ml-1">美港股领涨行业及催动因素</span>
                            </div>
                            <div className="space-y-2">
                              {analysis.topSectors.map((sector: { name: string; market: string; change: string; driver: string }, idx: number) => {
                                const rankColors = [
                                  "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
                                  "bg-gray-400/15 text-gray-600 dark:text-gray-300 border-gray-400/30",
                                  "bg-orange-700/15 text-orange-700 dark:text-orange-400 border-orange-700/30",
                                  "bg-muted/30 text-muted-foreground border-border/50",
                                  "bg-muted/30 text-muted-foreground border-border/50",
                                ];
                                const isPositive = sector.change?.startsWith("+") || parseFloat(sector.change) > 0;
                                return (
                                  <div key={idx} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-muted/10 border border-border/30 hover:bg-muted/20 transition-colors">
                                    <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${rankColors[idx] || rankColors[4]}`}>
                                      {idx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-foreground/90 truncate">{sector.name}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${sector.market === "美股" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                                          {sector.market}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                        <Zap className="h-2.5 w-2.5 inline mr-0.5" />
                                        {sector.driver || "—"}
                                      </div>
                                    </div>
                                    <span className={`shrink-0 text-sm font-bold ${isPositive ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                                      {sector.change?.startsWith("+") || sector.change?.startsWith("-") ? sector.change : isPositive ? `+${sector.change}` : sector.change}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* ── AI Action Summary ── */}
                        <div className="rounded-lg border border-border/50 bg-gradient-to-r from-muted/10 to-muted/5 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-medium">AI 操作建议</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sCfg.bg} ${sCfg.text}`}>
                              {analysis.suggestion}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${rCfg.bg} ${rCfg.text}`}>
                              风险{analysis.riskLevel}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div className="flex items-start gap-1.5">
                              <span className="shrink-0 mt-0.5">
                                {analysis.suggestion === "正T" ? "🔄" : analysis.suggestion === "反T" ? "🔃" : "⏸️"}
                              </span>
                              <span className="text-foreground/70">
                                {analysis.suggestion === "正T" ? "先买后卖：开盘逢低买入，反弹后卖出，适合预判上升行情" :
                                 analysis.suggestion === "反T" ? "先卖后买：开盘逢高卖出，回调后买回，适合预判下降行情" :
                                 "暂不操作：市场方向不明，等待信号确认后再行动"}
                              </span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="shrink-0 mt-0.5">📊</span>
                              <span className="text-foreground/70">
                                信心度{analysis.confidence}%{analysis.confidence >= 70 ? "，信号较强可适当加仓" : analysis.confidence >= 40 ? "，建议轻仓操作" : "，信号较弱建议观望"}
                              </span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="shrink-0 mt-0.5">⚠️</span>
                              <span className="text-foreground/70">
                                {analysis.riskLevel === "高" ? "高风险环境，严格控制仓位和止损" :
                                 analysis.riskLevel === "中" ? "中等风险，注意仓位管理" :
                                 "低风险环境，可适度操作"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* ── Multi-Dimensional Analysis Cards ── */}
                        {(analysis.technicalView || analysis.capitalView || analysis.policyView || analysis.sentimentView) && (
                          <div className="grid grid-cols-2 gap-2">
                            {analysis.technicalView && (
                              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-xs">{newsActiveTab === "overseas" ? "🇺🇸" : "📊"}</span>
                                  <span className="text-xs font-medium text-muted-foreground">{newsActiveTab === "overseas" ? "美股走势" : "技术面"}</span>
                                  <span className={`ml-auto text-[9px] px-1 rounded ${
                                    sentimentScores[0] >= 60 ? 'bg-red-500/10 text-red-500' :
                                    sentimentScores[0] >= 40 ? 'bg-yellow-500/10 text-yellow-500' :
                                    'bg-green-500/10 text-green-500'
                                  }`}>
                                    {sentimentScores[0] >= 60 ? '偏多' : sentimentScores[0] >= 40 ? '中性' : '偏空'}
                                  </span>
                                </div>
                                <p className="text-xs text-foreground/80 leading-relaxed">{analysis.technicalView}</p>
                              </div>
                            )}
                            {analysis.capitalView && (
                              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-xs">{newsActiveTab === "overseas" ? "🇭🇰" : "💰"}</span>
                                  <span className="text-xs font-medium text-muted-foreground">{newsActiveTab === "overseas" ? "港股走势" : "资金面"}</span>
                                  <span className={`ml-auto text-[9px] px-1 rounded ${
                                    sentimentScores[1] >= 60 ? 'bg-red-500/10 text-red-500' :
                                    sentimentScores[1] >= 40 ? 'bg-yellow-500/10 text-yellow-500' :
                                    'bg-green-500/10 text-green-500'
                                  }`}>
                                    {sentimentScores[1] >= 60 ? '偏多' : sentimentScores[1] >= 40 ? '中性' : '偏空'}
                                  </span>
                                </div>
                                <p className="text-xs text-foreground/80 leading-relaxed">{analysis.capitalView}</p>
                              </div>
                            )}
                            {analysis.policyView && (
                              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-xs">📜</span>
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {newsActiveTab === "overseas" ? "资金流向" : newsActiveTab === "stock" ? "消息面" : newsActiveTab === "sector" ? "政策/行业" : "政策面"}
                                  </span>
                                  <span className={`ml-auto text-[9px] px-1 rounded ${
                                    sentimentScores[2] >= 60 ? 'bg-red-500/10 text-red-500' :
                                    sentimentScores[2] >= 40 ? 'bg-yellow-500/10 text-yellow-500' :
                                    'bg-green-500/10 text-green-500'
                                  }`}>
                                    {sentimentScores[2] >= 60 ? '偏多' : sentimentScores[2] >= 40 ? '中性' : '偏空'}
                                  </span>
                                </div>
                                <p className="text-xs text-foreground/80 leading-relaxed">{analysis.policyView}</p>
                              </div>
                            )}
                            {analysis.sentimentView && (
                              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-xs">🎭</span>
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {newsActiveTab === "overseas" ? "政策消息" : "情绪面"}
                                  </span>
                                  <span className={`ml-auto text-[9px] px-1 rounded ${
                                    sentimentScores[3] >= 60 ? 'bg-red-500/10 text-red-500' :
                                    sentimentScores[3] >= 40 ? 'bg-yellow-500/10 text-yellow-500' :
                                    'bg-green-500/10 text-green-500'
                                  }`}>
                                    {sentimentScores[3] >= 60 ? '偏多' : sentimentScores[3] >= 40 ? '中性' : '偏空'}
                                  </span>
                                </div>
                                <p className="text-xs text-foreground/80 leading-relaxed">{analysis.sentimentView}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Detailed Reasoning (Collapsible) ── */}
                        {analysis.detailedReasoning && (
                          <details className="group">
                            <summary className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                              <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                              详细分析推理
                            </summary>
                            <div className="mt-2 p-3 rounded-lg bg-muted/10 border border-border/50">
                              <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-line">{analysis.detailedReasoning}</p>
                            </div>
                          </details>
                        )}

                        {/* ── Prediction Feedback ── */}
                        {(() => {
                          const currentPrediction = newsPredictions.find(p =>
                            p.id === `${newsActiveTab}-${data.symbol}-${data.timestamp}`
                          );
                          return (
                            <div className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <History className="h-3.5 w-3.5" />
                                  <span>预判反馈</span>
                                  {currentPrediction?.actualResult ? (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                      currentPrediction.actualResult === "正确" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                      currentPrediction.actualResult === "部分正确" ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" :
                                      "bg-red-500/10 text-red-600 border-red-500/20"
                                    }`}>
                                      {currentPrediction.actualResult === "正确" ? "✓ " : currentPrediction.actualResult === "部分正确" ? "~ " : "✗ "}
                                      {currentPrediction.actualResult}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/50">{currentPredictionDay}验证后反馈</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-6 text-[10px] px-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                    onClick={() => recordPredictionFeedback(`${newsActiveTab}-${data.symbol}-${data.timestamp}`, "正确")}
                                  >
                                    <ThumbsUp className="h-3 w-3 mr-0.5" />准
                                  </Button>
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-6 text-[10px] px-1.5 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/10"
                                    onClick={() => recordPredictionFeedback(`${newsActiveTab}-${data.symbol}-${data.timestamp}`, "部分正确")}
                                  >
                                    <MinusCircle className="h-3 w-3 mr-0.5" />半
                                  </Button>
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-6 text-[10px] px-1.5 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                    onClick={() => recordPredictionFeedback(`${newsActiveTab}-${data.symbol}-${data.timestamp}`, "错误")}
                                  >
                                    <ThumbsDown className="h-3 w-3 mr-0.5" />偏
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* ── Source Diversity Stats ── */}
                        {data.sourceDiversity && Object.keys(data.sourceDiversity).length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">资讯渠道:</span>
                            {Object.entries(data.sourceDiversity).map(([type, count]: [string, any]) => {
                              const typeColors: Record<string, string> = {
                                "券商研报": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                                "财经媒体": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                                "政策公告": "bg-red-500/10 text-red-600 dark:text-red-400",
                                "投资社区": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
                                "外媒": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                "综合资讯": "bg-gray-500/10 text-gray-600 dark:text-gray-400",
                              };
                              return (
                                <button
                                  key={type}
                                  onClick={() => setNewsFilterSource(newsFilterSource === type ? "all" : type)}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-opacity ${typeColors[type] || typeColors["综合资讯"]} ${newsFilterSource === type ? "opacity-100 ring-1 ring-current" : newsFilterSource !== "all" ? "opacity-40" : ""}`}
                                >
                                  {type} {String(count)}
                                </button>
                              );
                            })}
                            {newsFilterSource !== "all" && (
                              <button onClick={() => setNewsFilterSource("all")} className="text-[10px] text-muted-foreground hover:text-foreground">✕ 清除</button>
                            )}
                          </div>
                        )}

                        {/* ── News Filter Bar ── */}
                        {data.news && data.news.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Filter className="h-3 w-3 text-muted-foreground" />
                            {/* Dimension filter */}
                            {data.searchGroups && data.searchGroups.length > 0 && (
                              <div className="flex items-center gap-1">
                                {data.searchGroups.map((g: string, i: number) => (
                                  <button
                                    key={i}
                                    onClick={() => setNewsFilterDimension(newsFilterDimension === g ? "all" : g)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded transition-opacity ${
                                      newsFilterDimension === g ? 'bg-primary/10 text-primary ring-1 ring-primary/30' :
                                      newsFilterDimension !== "all" ? 'bg-muted/30 text-muted-foreground/40' :
                                      'bg-muted/30 text-muted-foreground'
                                    }`}
                                  >
                                    {g}
                                  </button>
                                ))}
                                {newsFilterDimension !== "all" && (
                                  <button onClick={() => setNewsFilterDimension("all")} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
                                )}
                              </div>
                            )}
                            <span className="text-[10px] text-muted-foreground/50 ml-auto">
                              显示 {filteredNews.length}/{data.news.length} 条
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* ── News List with Source Tags ── */}
                  {filteredNews.length > 0 ? (
                    <div>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {filteredNews.map((item: any, i: number) => {
                          const sourceTypeColors: Record<string, string> = {
                            "券商研报": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                            "财经媒体": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                            "政策公告": "bg-red-500/10 text-red-600 dark:text-red-400",
                            "投资社区": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
                            "外媒": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                            "综合资讯": "bg-gray-500/10 text-gray-600 dark:text-gray-400",
                          };
                          const tagColor = sourceTypeColors[item.sourceType] || sourceTypeColors["综合资讯"];
                          // Highlight important news based on source type
                          const isImportant = ["券商研报", "政策公告"].includes(item.sourceType);
                          return (
                            <a
                              key={i}
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`block p-2.5 rounded-lg transition-colors group ${
                                isImportant ? 'bg-primary/5 hover:bg-primary/10 border border-primary/10' : 'bg-muted/20 hover:bg-muted/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-foreground/90 group-hover:text-foreground line-clamp-1 flex items-center gap-1">
                                    {isImportant && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-bold shrink-0">重要</span>}
                                    {item.title}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {item.snippet}
                                  </div>
                                </div>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-0.5" />
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${tagColor}`}>
                                  {item.sourceType}
                                </span>
                                {item.searchLabel && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                                    {item.searchLabel}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground/60 ml-auto">{item.source}</span>
                                {item.date && <span className="text-[10px] text-muted-foreground/60">· {item.date}</span>}
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  ) : newsData[newsActiveTab]?.news?.length > 0 ? (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      当前筛选条件下无匹配资讯，<button className="text-primary hover:underline" onClick={() => { setNewsFilterSource("all"); setNewsFilterDimension("all"); }}>清除筛选</button>
                    </div>
                  ) : null}

                  {/* ── Prediction History ── */}
                  {newsPredictions.length > 0 && (
                    <details className="group">
                      <summary className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                        预判历史记录
                        <span className="text-[10px] text-muted-foreground/50 ml-1">({newsPredictions.length}条)</span>
                        {predictionStats.withFeedback > 0 && (
                          <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                            predictionStats.accuracy >= 60 ? 'bg-emerald-500/10 text-emerald-600' :
                            predictionStats.accuracy >= 40 ? 'bg-yellow-500/10 text-yellow-600' :
                            'bg-red-500/10 text-red-600'
                          }`}>
                            今日准确率 {predictionStats.accuracy}%
                          </span>
                        )}
                      </summary>
                      <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5">
                        {newsPredictions.slice(0, 20).map((p) => {
                          const typeLabels: Record<string, string> = { market: "大盘", sector: "板块", stock: "个股", overseas: "美港股" };
                          const trendColors: Record<string, string> = {
                            "上升": "text-red-600 dark:text-red-400",
                            "下降": "text-green-600 dark:text-green-400",
                            "震荡": "text-yellow-600 dark:text-yellow-400",
                          };
                          return (
                            <div key={p.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/10 border border-border/30 text-xs">
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{typeLabels[p.type] || p.type}</span>
                              <span className={`font-medium ${trendColors[p.trend] || ""}`}>{p.trend}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">{p.suggestion}</span>
                              <span className="text-muted-foreground/50 ml-auto">
                                {p.timestamp ? new Date(p.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}
                              </span>
                              {p.actualResult && (
                                <span className={`text-[10px] px-1 py-0.5 rounded ${
                                  p.actualResult === "正确" ? "bg-emerald-500/10 text-emerald-600" :
                                  p.actualResult === "部分正确" ? "bg-yellow-500/10 text-yellow-600" :
                                  "bg-red-500/10 text-red-600"
                                }`}>
                                  {p.actualResult === "正确" ? "✓" : p.actualResult === "部分正确" ? "~" : "✗"} {p.actualResult}
                                </span>
                              )}
                              {!p.actualResult && (
                                <div className="flex gap-0.5">
                                  <button className="text-[10px] px-1 py-0.5 rounded hover:bg-emerald-500/10 text-emerald-600" onClick={() => recordPredictionFeedback(p.id, "正确")}>✓</button>
                                  <button className="text-[10px] px-1 py-0.5 rounded hover:bg-yellow-500/10 text-yellow-600" onClick={() => recordPredictionFeedback(p.id, "部分正确")}>~</button>
                                  <button className="text-[10px] px-1 py-0.5 rounded hover:bg-red-500/10 text-red-600" onClick={() => recordPredictionFeedback(p.id, "错误")}>✗</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Newspaper className="h-8 w-8 text-muted-foreground/40" />
                  <span className="text-sm text-muted-foreground">点击"刷新"获取多渠道资讯分析</span>
                  <span className="text-xs text-muted-foreground/60">覆盖：宏观政策 · 资金流向 · 外盘影响 · 技术分析 · 研报评级</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Strategy Admin Panel */}
        <StrategyAdminPanel onFactorsChanged={(factors) => setFactorOverrides(buildFactorOverridesFromDB(factors))} />
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/30 mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>做T助手 · A股日内交易信号分析工具</span>
            <span>数据仅供参考，不构成投资建议</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
