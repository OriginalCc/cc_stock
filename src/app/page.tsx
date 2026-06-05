"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect, startTransition } from "react";
import dynamic from "next/dynamic";
import { useStockData, type TimeInterval, type StockSearchResult, type KLineItem, type TimelineItem, type ChartMode } from "@/hooks/use-stock-data";

// Dynamic imports to reduce initial compilation memory
// Use loading skeletons for critical chart components
const StockScreener = dynamic(() => import("@/components/stock-screener").then(m => ({ default: m.StockScreener })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载选股器...</span></div> });
const IntradayScreener = dynamic(() => import("@/components/intraday-screener").then(m => ({ default: m.IntradayScreener })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载分时选股...</span></div> });
const LimitUpAnalysis = dynamic(() => import("@/components/limit-up-analysis").then(m => ({ default: m.LimitUpAnalysis })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载涨停回踩...</span></div> });
const EarlyTradingScreener = dynamic(() => import("@/components/early-trading-screener").then(m => ({ default: m.EarlyTradingScreener })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载早盘选股...</span></div> });
const LowOpenScreener = dynamic(() => import("@/components/low-open-screener").then(m => ({ default: m.LowOpenScreener })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载低开选股...</span></div> });
const SectorRotationPanel = dynamic(() => import("@/components/sector-rotation-panel").then(m => ({ default: m.SectorRotationPanel })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载板块轮动...</span></div> });
const ScreenerHistoryPanel = dynamic(() => import("@/components/screener-history-panel").then(m => ({ default: m.ScreenerHistoryPanel })), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载历史记录...</span></div> });
const StrategyAdminPanel = dynamic(() => import("@/components/strategy-admin-panel").then(m => ({ default: m.StrategyAdminPanel })), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载策略管理...</span></div> });
const TimeSharingPanel = dynamic(() => import("@/components/time-sharing-panel").then(m => ({ default: m.TimeSharingPanel })), {
  ssr: false,
  loading: () => <div className="h-[500px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载分时图...</span></div>,
});
const KLineChartPanel = dynamic(() => import("@/components/kline-chart-panel").then(m => ({ default: m.KLineChartPanel })), {
  ssr: false,
  loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载K线图...</span></div>,
});
const FiveDayTimelinePanel = dynamic(() => import("@/components/five-day-timeline-panel").then(m => ({ default: m.FiveDayTimelinePanel })), {
  ssr: false,
  loading: () => <div className="h-[500px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载五日分时图...</span></div>,
});
const NewsAnalysisPanel = dynamic(() => import("@/components/news-analysis-panel").then(m => ({ default: m.NewsAnalysisPanel })), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载新闻分析...</span></div> });
const SignalSummaryPanel = dynamic(() => import("@/components/signal-summary-panel").then(m => ({ default: m.SignalSummaryPanel })), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载信号汇总...</span></div> });
const BaotaDeployGuide = dynamic(() => import("@/components/baota-deploy-guide"), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载部署指南...</span></div> });
const TSuitabilityScore = dynamic(() => import("@/components/t-suitability-score").then(m => ({ default: m.TSuitabilityScore })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载适宜度评分...</span></div> });
const RiskAlertPanel = dynamic(() => import("@/components/risk-alert-panel").then(m => ({ default: m.RiskAlertPanel })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载风险仪表盘...</span></div> });
const TradingRulesCard = dynamic(() => import("@/components/trading-rules-card").then(m => ({ default: m.TradingRulesCard })), { ssr: false, loading: () => <div className="h-[120px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载交易规矩...</span></div> });
const PositionSignalCard = dynamic(() => import("@/components/position-signal-card").then(m => ({ default: m.PositionSignalCard })), { ssr: false, loading: () => <div className="h-[60px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载仓位信号...</span></div> });
const PasswordManageDialog = dynamic(() => import("@/components/password-manage-dialog").then(m => ({ default: m.PasswordManageDialog })), { ssr: false });
const MarketBreadthChart = dynamic(() => import("@/components/market-breadth-chart").then(m => ({ default: m.MarketBreadthChart })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载涨跌家数图...</span></div> });
const MarketSentiment = dynamic(() => import("@/components/market-sentiment").then(m => ({ default: m.MarketSentiment })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载市场情绪...</span></div> });
const MarketChangeDistribution = dynamic(() => import("@/components/market-change-distribution").then(m => ({ default: m.MarketChangeDistribution })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载涨跌幅分布...</span></div> });
const MarketLimitStats = dynamic(() => import("@/components/market-limit-stats").then(m => ({ default: m.MarketLimitStats })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载涨跌停详情...</span></div> });
const SectorTopBottomCard = dynamic(() => import("@/components/sector-top-bottom-card").then(m => ({ default: m.SectorTopBottomCard })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载板块排行...</span></div> });
import { PasswordGate } from "@/components/password-gate";
import { LazyMount } from "@/components/lazy-mount";
import { calculateMACD } from "@/lib/indicators";
import { macdFingerprintCache, signalFingerprintCache, pvFingerprintCache } from "@/lib/fingerprint-cache";
import { getTimeWindow, detectMarketRegimeDetail, buildFactorOverridesFromDB, computeKeyPriceLevels, type FactorOverride, type RegimeDetail } from "@/lib/t-strategy";
import { generateTimelineSignals, detectPulseVolumeMarkers, type TSignal, type PulseVolumeMarker, type CustomFactorDefinition, formatVolume, formatPrice, formatNum, formatMarketCap, REGIME_CONFIG, T_MODE_CONFIG, DEFAULT_ASHARES, INTERVALS, INDEX_CONFIG, INDEX_KEYS, SIGNAL_PULSE_CSS, playAlertSound, getTIndexColor, getTIndexLabel, getTIndexLabelColor, BUILT_IN_CUSTOM_FACTORS, CUSTOM_FACTORS_STORAGE_KEY, type IndexKey } from "@/lib/chart-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, TrendingUp, TrendingDown, Activity, ArrowUpRight, ArrowDownRight,
  X, Clock, Zap, LineChart, CandlestickChart, Filter,
  Star, Bell, BellOff, Volume2, Newspaper, CalendarDays, Flame,
  History, ShieldCheck, Server, Scale, AlertTriangle, BookOpen, Info,
} from "lucide-react";

export default function StockTAssistant() {
  const {
    symbol, quote, history, timeline, timelinePrevClose, interval, chartMode,
    loading, timelineLoading, error, latestSignal, selectStock, changeInterval, changeChartMode,
    searchStocks, isAShare: isAShareStock,
  } = useStockData();

  const [pageMode, setPageMode] = useState<"t-assistant" | "screener" | "intraday-screener" | "sector-rotation" | "early-screen" | "limit-up" | "low-open" | "baota-deploy">("t-assistant");
  const [screenerSubView, setScreenerSubView] = useState<"screener" | "history">("screener");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [autoExpanded, setAutoExpanded] = useState<boolean>(false);
  const [marketBreadth, setMarketBreadth] = useState<{ totalUp: number; totalDown: number; totalFlat: number; shUp: number; shDown: number; szUp: number; szDown: number; limitUp: number; limitDown: number; history: { time: string; totalUp: number; totalDown: number; totalFlat: number; limitUp: number; limitDown: number }[] } | null>(null);
  const [marketDistribution, setMarketDistribution] = useState<{ buckets: { label: string; count: number; color: string; min?: number; max?: number }[]; total: number; median: number; avgChange: number; limitUpSealed: number; limitUpBroken: number; limitDownSealed: number; limitDownBroken: number } | null>(null);
  const [marketLimitStats, setMarketLimitStats] = useState<any>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Auto-show opening reminder badge in first 3 minutes of market open ──
  useEffect(() => {
    if (chartMode !== "timeline") return;
    const checkMarketOpen = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const minutes = h * 60 + m;
      // 9:30 (570) ~ 9:33 (573) = first 3 minutes of market open
      const isOpeningMinutes = minutes >= 570 && minutes < 573;
      if (isOpeningMinutes && !autoExpanded) {
        setAutoExpanded(true);
      }
      // After 9:33, reset autoExpanded flag
      if (minutes >= 573 && autoExpanded) {
        setAutoExpanded(false);
      }
    };
    checkMarketOpen();
    const timer = setInterval(checkMarketOpen, 10000); // check every 10s
    return () => clearInterval(timer);
  }, [chartMode, autoExpanded]);

  // ── News state (passed to NewsAnalysisPanel) ──
  const [showNewsAnalysis, setShowNewsAnalysis] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsData, setNewsData] = useState<Record<string, any>>({});

  // ── Mount tracking (prevent hydration mismatch for localStorage-dependent renders) ──
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  // ── Menu Bar Stocks ──
  // Fix: use a ref to track whether localStorage has been loaded,
  // so we don't overwrite saved data with DEFAULT_ASHARES on first render.
  const menuStocksLoadedRef = useRef(false);
  const [menuStocks, setMenuStocks] = useState<{ symbol: string; name: string }[]>(DEFAULT_ASHARES);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("menuStocks");
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) { setMenuStocks(parsed); } }
    } catch {}
    menuStocksLoadedRef.current = true;
  }, []);
  useEffect(() => {
    // Only save to localStorage AFTER initial load is complete,
    // otherwise we overwrite saved data with DEFAULT_ASHARES
    if (!menuStocksLoadedRef.current) return;
    try { localStorage.setItem("menuStocks", JSON.stringify(menuStocks)); } catch {}
  }, [menuStocks]);
  const isInMenu = menuStocks.some((s) => s.symbol === symbol);
  const toggleMenuStock = useCallback(() => {
    if (!quote) return;
    setMenuStocks((prev) => {
      if (prev.some((s) => s.symbol === symbol)) return prev.filter((s) => s.symbol !== symbol);
      return [...prev, { symbol, name: quote.name || symbol }].slice(-10);
    });
  }, [symbol, quote]);

  // ── Market Index Regime Detection ──
  const [indexRegimes, setIndexRegimes] = useState<Record<IndexKey, RegimeDetail | null>>({ sz: null, sh: null, cyb: null });
  const [activeIndexKey, setActiveIndexKey] = useState<IndexKey>("sz");
  const [indexTimelineData, setIndexTimelineData] = useState<Record<IndexKey, { items: TimelineItem[]; prevClose: number }>>({ sz: { items: [], prevClose: 0 }, sh: { items: [], prevClose: 0 }, cyb: { items: [], prevClose: 0 } });
  const [indexLoading, setIndexLoading] = useState(false);

  // Ref for manual retry
  const fetchIndexDataRef = useCallback(() => {
    setIndexLoading(true);
    const fetchIndex = async (key: IndexKey) => {
      const { symbol: sym } = INDEX_CONFIG[key];
      try {
        const res = await fetch(`/api/stock/ashare-timeline?symbol=${encodeURIComponent(sym)}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.error || !data.items || data.items.length < 5) return null;
        return { regime: detectMarketRegimeDetail(data.items, data.prevClose || data.items[0].price), items: data.items as TimelineItem[], prevClose: data.prevClose || data.items[0].price };
      } catch { return null; }
    };

    Promise.allSettled(INDEX_KEYS.map(key => fetchIndex(key))).then(results => {
      setIndexRegimes(prev => { let changed = false; const next = { ...prev }; INDEX_KEYS.forEach((key, i) => { if (results[i].status === "fulfilled" && results[i].value) { const newRegime = results[i].value!.regime; if (prev[key]?.regime !== newRegime.regime || prev[key]?.confidence !== newRegime.confidence) { next[key] = newRegime; changed = true; } } }); return changed ? next : prev; });
      setIndexTimelineData(prev => { let changed = false; const next = { ...prev }; INDEX_KEYS.forEach((key, i) => { if (results[i].status === "fulfilled" && results[i].value) { const newVal = { items: results[i].value!.items, prevClose: results[i].value!.prevClose }; if (prev[key]?.items.length !== newVal.items.length || prev[key]?.items[newVal.items.length - 1]?.time !== newVal.items[newVal.items.length - 1]?.time) { next[key] = newVal; changed = true; } } }); return changed ? next : prev; });
      setIndexLoading(false);

      // Auto-retry: if any index still empty, retry after 5s
      const failedKeys = INDEX_KEYS.filter((_, i) => results[i].status !== "fulfilled" || !results[i].value);
      if (failedKeys.length > 0) {
        setTimeout(async () => {
          const retryResults = await Promise.allSettled(failedKeys.map(key => fetchIndex(key)));
          setIndexRegimes(prev => { let changed = false; const next = { ...prev }; failedKeys.forEach((key, i) => { if (retryResults[i].status === "fulfilled" && retryResults[i].value) { const newRegime = (retryResults[i].value as any).regime; if (prev[key]?.regime !== newRegime.regime || prev[key]?.confidence !== newRegime.confidence) { next[key] = newRegime; changed = true; } } }); return changed ? next : prev; });
          setIndexTimelineData(prev => { let changed = false; const next = { ...prev }; failedKeys.forEach((key, i) => { if (retryResults[i].status === "fulfilled" && retryResults[i].value) { const newVal = { items: (retryResults[i].value as any).items, prevClose: (retryResults[i].value as any).prevClose }; if (prev[key]?.items.length !== newVal.items.length || prev[key]?.items[newVal.items.length - 1]?.time !== newVal.items[newVal.items.length - 1]?.time) { next[key] = newVal; changed = true; } } }); return changed ? next : prev; });
          // Check again - if still failing, schedule another retry
          const stillFailed = failedKeys.filter((_, i) => retryResults[i].status !== "fulfilled" || !retryResults[i].value);
          if (stillFailed.length > 0) {
            setTimeout(() => fetchIndexDataRef(), 10000);
          }
        }, 5000);
      }
    });
  }, []);

  const retryIndexFetch = useCallback(() => {
    fetchIndexDataRef();
  }, [fetchIndexDataRef]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Defer index fetch to avoid competing with stock timeline for connection pool
    const startDelay = 3000;
    setTimeout(() => fetchIndexDataRef(), startDelay);

    // Refresh every 15s during trading hours
    const isTradingHours = () => {
      const now = new Date(); const h = (now.getUTCHours() + 8) % 24; const m = now.getUTCMinutes();
      const t = h * 100 + m; const day = now.getUTCDay();
      return day >= 1 && day <= 5 && ((t >= 925 && t <= 1135) || (t >= 1255 && t <= 1505));
    };
    if (isTradingHours()) {
      intervalId = setInterval(() => { if (!document.hidden && isTradingHours()) fetchIndexDataRef(); }, 15000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [fetchIndexDataRef]);

  // ── Market Breadth (涨跌家数) ──
  useEffect(() => {
    if (pageMode !== "t-assistant") return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchBreadth = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/stock/market-breadth", { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.error && !cancelled) {
          setMarketBreadth(data);
        }
      } catch { /* ignore */ }
    };

    const fetchDistribution = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/stock/market-breadth-distribution", { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.error && !cancelled) {
          setMarketDistribution(data);
        }
      } catch { /* ignore */ }
    };

    const fetchLimitStats = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/stock/market-breadth-stats", { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMarketLimitStats(data);
        }
      } catch { /* ignore */ }
    };

    const isTradingHours = () => {
      const now = new Date(); const h = (now.getUTCHours() + 8) % 24; const m = now.getUTCMinutes();
      const t = h * 100 + m; const day = now.getUTCDay();
      return day >= 1 && day <= 5 && ((t >= 925 && t <= 1135) || (t >= 1255 && t <= 1505));
    };

    const fetchAll = () => { fetchBreadth(); fetchDistribution(); fetchLimitStats(); };

    // Always fetch immediately on mount — API has DB fallback so data will show even outside trading hours
    fetchAll();

    // During trading hours, poll every 15s
    if (isTradingHours()) {
      intervalId = setInterval(() => { if (!document.hidden && isTradingHours()) fetchAll(); }, 15000);
    }
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId); };
  }, [pageMode]);

  const szIndexRegime = indexRegimes[activeIndexKey];
  const cycleIndexKey = useCallback(() => { setActiveIndexKey(prev => { const idx = INDEX_KEYS.indexOf(prev); return INDEX_KEYS[(idx + 1) % INDEX_KEYS.length]; }); }, []);

  // ── Sector Regime Detection ──
  const [sectorInfoRaw, setSectorInfoRaw] = useState<{ code: string; name: string } | null>(null);
  const [sectorRegimeRaw, setSectorRegimeRaw] = useState<RegimeDetail | null>(null);
  const [sectorTimelineData, setSectorTimelineData] = useState<{ items: TimelineItem[]; prevClose: number }>({ items: [], prevClose: 0 });
  const [sectorLoading, setSectorLoading] = useState(false);
  const sectorInfo = isAShareStock ? sectorInfoRaw : null;
  const sectorRegime = isAShareStock ? sectorRegimeRaw : null;

  // Ref to hold the latest fetchSectorData function so the retry button can call it
  const fetchSectorDataRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    if (!symbol || !isAShareStock) return;
    let cancelled = false;
    let abortCtrl: AbortController | null = null;
    // Track current symbol to avoid stale responses
    const currentSymbol = symbol;

    // Clear stale sector data when switching stocks
    setSectorInfoRaw(null);
    setSectorRegimeRaw(null);
    setSectorTimelineData({ items: [], prevClose: 0 });

    const applySectorResult = (infoData: { success: boolean; sectorInfo?: any; data?: any }) => {
      if (cancelled) return;
      if (!infoData.success) {
        // API returned an error — don't clear existing state, just log
        console.warn("Sector API returned error:", infoData.error);
        return;
      }
      if (!infoData.sectorInfo) {
        // sectorInfo=null means this stock has no sector mapping — NOT an error.
        // Don't clear existing state; just leave things as they are.
        return;
      }
      const sInfo = infoData.sectorInfo;
      setSectorInfoRaw({ code: sInfo.code, name: sInfo.name });
      // Update timeline & regime even if items are few (early morning, inactive sectors)
      if (infoData.data && infoData.data.items && infoData.data.items.length > 0) {
        const sectorPrevClose = infoData.data.prevClose || infoData.data.items[0].price;
        const regime = detectMarketRegimeDetail(infoData.data.items, sectorPrevClose);
        setSectorRegimeRaw(regime); setSectorTimelineData({ items: infoData.data.items, prevClose: sectorPrevClose });
      }
      // Don't clear sectorRegimeRaw/sectorTimelineData when timeline is empty —
      // keep showing stale data rather than flickering to nothing
    };

    let retryCount = 0;
    const MAX_FAST_RETRIES = 3; // Fast retries for initial load failures

    const fetchSectorData = async () => {
      try {
        setSectorLoading(true);
        // Abort previous request if still pending
        if (abortCtrl) abortCtrl.abort();
        abortCtrl = new AbortController();
        const timeoutId = setTimeout(() => abortCtrl?.abort(), 15000);

        const infoRes = await fetch(`/api/stock/ashare-sector?symbol=${encodeURIComponent(currentSymbol)}&type=full`, { signal: abortCtrl.signal });
        clearTimeout(timeoutId);
        if (cancelled) { setSectorLoading(false); return; }
        if (!infoRes.ok) {
          // Server error — schedule a fast retry if under limit
          if (retryCount < MAX_FAST_RETRIES) {
            retryCount++;
            const delay = retryCount * 2000; // 2s, 4s, 6s
            console.warn(`Sector API returned ${infoRes.status}, retrying in ${delay}ms (attempt ${retryCount}/${MAX_FAST_RETRIES})`);
            setTimeout(() => { if (!cancelled) fetchSectorData(); }, delay);
          }
          setSectorLoading(false);
          return;
        }
        const infoData = await infoRes.json();
        if (cancelled) { setSectorLoading(false); return; }

        // If sectorInfo is null and we haven't exhausted fast retries, try again
        // (the API might have had a transient failure getting sector info from EastMoney)
        if (!infoData.sectorInfo && infoData.success && retryCount < MAX_FAST_RETRIES) {
          retryCount++;
          const delay = retryCount * 2000;
          console.warn(`Sector info null for ${currentSymbol}, retrying in ${delay}ms (attempt ${retryCount}/${MAX_FAST_RETRIES})`);
          setTimeout(() => { if (!cancelled) fetchSectorData(); }, delay);
          setSectorLoading(false);
          return;
        }

        applySectorResult(infoData);
      } catch (e) {
        // AbortError = intentional cancellation (new request, unmount) — not a real failure
        if (e instanceof DOMException && e.name === "AbortError") { if (!cancelled) setSectorLoading(false); return; }
        // Real error — schedule a fast retry if under limit
        if (!cancelled) {
          if (retryCount < MAX_FAST_RETRIES) {
            retryCount++;
            const delay = retryCount * 2000;
            console.warn(`Sector fetch error, retrying in ${delay}ms (attempt ${retryCount}/${MAX_FAST_RETRIES}):`, e);
            setTimeout(() => { if (!cancelled) fetchSectorData(); }, delay);
          } else {
            console.warn("Sector fetch error (max retries reached, will retry on 30s cycle):", e);
          }
        }
      } finally {
        if (!cancelled) setSectorLoading(false);
      }
    };

    // Store ref so retry button can trigger it
    fetchSectorDataRef.current = () => {
      retryCount = 0; // Reset retry counter for manual retry
      fetchSectorData();
    };

    // Initial fetch — delayed 2s to avoid competing with main stock timeline data
    setTimeout(() => { if (!cancelled) fetchSectorData(); }, 2000);
    // Periodic refresh every 15s — no fail counter, always retry
    const refreshInterval = setInterval(() => {
      retryCount = 0; // Reset retry counter on periodic refresh
      if (!cancelled) fetchSectorData();
    }, 15000);
    return () => { cancelled = true; abortCtrl?.abort(); clearInterval(refreshInterval); };
  }, [symbol, isAShareStock]);

  // Retry function for manual sector fetch
  const retrySectorFetch = useCallback(() => {
    fetchSectorDataRef.current();
  }, []);

  // ── DB Factor Overrides (fetch immediately — no delay to avoid delayed label rendering) ──
  const [factorOverrides, setFactorOverrides] = useState<FactorOverride[]>([]);
  useEffect(() => {
    const fetchFactors = async () => {
      try { const res = await fetch("/api/stock/strategy"); if (res.ok) { const data = await res.json(); if (data.dbFactors && Array.isArray(data.dbFactors)) startTransition(() => setFactorOverrides(buildFactorOverridesFromDB(data.dbFactors))); } } catch (e) { console.error("Failed to fetch factor overrides:", e); }
    };
    fetchFactors();
  }, []);

  // ── Custom Factors ──
  const [customFactors, setCustomFactors] = useState<CustomFactorDefinition[]>([]);
  const loadCustomFactorsFromDB = useCallback(async () => {
    try {
      const res = await fetch("/api/stock/strategy-factors");
      if (!res.ok) { setCustomFactors(BUILT_IN_CUSTOM_FACTORS); return; }
      const data = await res.json();
      if (data.factors && Array.isArray(data.factors)) {
        const customFactorRecords = data.factors.filter((f: any) => f.category === "CUSTOM_COMBINED");
        const converted = customFactorRecords
          .map((r: any) => {
            try {
              const params = typeof r.params === "string" ? JSON.parse(r.params) : r.params || {};
              const conditions = Array.isArray(params.conditions)
                ? params.conditions.map((c: any) => ({
                    key: c.key || "",
                    label: c.label || c.key || "",
                    description: c.description || "",
                    category: c.category || "price" as const,
                  }))
                : [];
              const isBuiltIn = params.isBuiltIn === true;
              const dataSource = params.dataSource || "分时线";
              let id = r.id;
              if (isBuiltIn) {
                if (r.name === "脉冲缩量企稳") id = "factor_31";
                else if (r.name === "脉冲拉升缩量滞涨") id = "factor_32";
                else if (r.name === "缩量横盘突破") id = "factor_33";
                else if (r.name === "放量突破均线") id = "factor_34";
              }
              return {
                id,
                name: r.name,
                description: r.description || "",
                signalType: r.signalType || "buy",
                tMode: r.tMode || "正T",
                strength: r.strength || "medium",
                conditions,
                enabled: r.enabled ?? true,
                isBuiltIn,
                dataSource: dataSource as "分时线",
                _dbId: r.id,
              } as CustomFactorDefinition;
            } catch { return null; }
          })
          .filter(Boolean) as CustomFactorDefinition[];
        startTransition(() => setCustomFactors(converted));
      } else {
        setCustomFactors(BUILT_IN_CUSTOM_FACTORS);
      }
    } catch {
      // Fallback to localStorage
      try {
        const saved = localStorage.getItem(CUSTOM_FACTORS_STORAGE_KEY);
        if (saved) setCustomFactors(JSON.parse(saved));
        else setCustomFactors(BUILT_IN_CUSTOM_FACTORS);
      } catch { setCustomFactors(BUILT_IN_CUSTOM_FACTORS); }
    }
  }, []);
  useEffect(() => { loadCustomFactorsFromDB(); }, [loadCustomFactorsFromDB]);

  // ── Debounced search ──
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => { const results = await searchStocks(value); setSearchResults(results); setSearchLoading(false); }, 400);
  }, [searchStocks]);

  // ── K-line zoom state ──
  const [klineVisibleBars, setKlineVisibleBars] = useState<number>(80);
  const [klinePanOffset, setKlinePanOffset] = useState<number>(0);

  // ── allChartData: merge today's quote into K-line history ──
  const allChartData = useMemo(() => {
    // In timeline mode, skip heavy quote-merge logic since K-line data is only used for
    // prevDayMA5 and SignalSummaryPanel — neither needs real-time quote updates
    if (chartMode === 'timeline' || chartMode === '5d-timeline') {
      return history.filter((h) => h.close > 0);
    }

    // Helper: normalize a date string to just the date part (YYYY-MM-DD)
    const normalizeDate = (d: string | undefined): string => {
      if (!d) return "";
      return d.split(" ")[0].split("T")[0];
    };

    const data = history.filter((h) => h.close > 0);
    if (quote && quote.price > 0 && (interval === "1d" || interval === "1wk")) {
      const now = new Date(); const chinaOffset = 8 * 60;
      const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
      const todayStr = chinaTime.toISOString().split("T")[0];
      let todayKey = todayStr;
      if (interval === "1wk") { const dayOfWeek = chinaTime.getDay(); const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; const monday = new Date(chinaTime.getTime() + mondayOffset * 86400000); todayKey = monday.toISOString().split("T")[0]; }

      // Only add/merge today's bar if it's a trading day (Mon-Fri) and
      // the date key makes sense (don't add bars for weekends/holidays)
      const dayOfWeek = chinaTime.getDay();
      const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

      const todayQuote = { open: quote.open || quote.price, high: quote.high || quote.price, low: quote.low || quote.price, close: quote.price, volume: quote.volume || 0 };

      // Search from the end of the array for a bar matching todayKey (normalized)
      let existingTodayIdx = -1;
      for (let i = data.length - 1; i >= 0; i--) {
        if (normalizeDate(data[i].date) === todayKey) {
          existingTodayIdx = i;
          break;
        }
      }

      if (existingTodayIdx >= 0) {
        // API already has a bar for today — merge quote data into it, preserving MA/MACD values from API
        const existing = data[existingTodayIdx];
        data[existingTodayIdx] = {
          ...existing,
          high: Math.max(existing.high, todayQuote.high),
          low: Math.min(existing.low, todayQuote.low),
          close: todayQuote.close,
          volume: todayQuote.volume,
          // Preserve API-computed MA/MACD values (they may be null if API hasn't computed them yet)
          ma5: existing.ma5,
          ma10: existing.ma10,
          ma20: existing.ma20,
          dif: existing.dif,
          dea: existing.dea,
          macd: existing.macd,
        };
      } else if (isWeekday) {
        // No existing bar for today and it's a weekday — push a new bar
        data.push({ date: todayKey, ...todayQuote, ma5: null, ma10: null, ma20: null, dif: null, dea: null, macd: null });
      }
    }
    // Deduplicate: remove any bars with duplicate dates, preferring bars with MA values (API data)
    const seen = new Map<string, number>();
    for (let i = 0; i < data.length; i++) {
      const dateKey = normalizeDate(data[i].date);
      const prevIdx = seen.get(dateKey);
      if (prevIdx === undefined) {
        seen.set(dateKey, i);
      } else {
        // Prefer the bar that has computed MA values (API data over quote-pushed data)
        const prevItem = data[prevIdx];
        const curItem = data[i];
        const prevHasMA = prevItem.ma5 != null;
        const curHasMA = curItem.ma5 != null;
        if (curHasMA && !prevHasMA) {
          // Current bar has MA values, previous doesn't — prefer current
          // But merge the quote-updated OHLCV from the other bar
          seen.set(dateKey, i);
        } else if (prevHasMA && !curHasMA) {
          // Previous bar has MA values, current doesn't — prefer previous
          // (keep prevIdx)
        } else {
          // Both have or lack MA values — keep the last occurrence (quote-merged data)
          seen.set(dateKey, i);
        }
      }
    }
    if (seen.size < data.length) {
      // For any kept index that was a duplicate, also normalize the date field to clean format
      const deduped = data.filter((item, i) => {
        const dateKey = normalizeDate(item.date);
        return seen.get(dateKey) === i;
      }).map((item) => {
        // Normalize the date to just the date part (remove time component)
        const normalizedDate = normalizeDate(item.date);
        if (normalizedDate && normalizedDate !== item.date) {
          return { ...item, date: normalizedDate };
        }
        return item;
      });
      return deduped;
    }
    return data;
  }, [history, chartMode, quote, interval]);

  // ── chartData for signal summary (visible K-line slice) ──
  const chartData = useMemo(() => {
    if (allChartData.length <= klineVisibleBars) return allChartData;
    const maxOffset = allChartData.length - klineVisibleBars;
    const offset = Math.max(0, Math.min(klinePanOffset, maxOffset));
    return allChartData.slice(-(klineVisibleBars + offset), allChartData.length - offset);
  }, [allChartData, klineVisibleBars, klinePanOffset]);

  // ── Timeline zoom state ──
  const TL_ZOOM_LEVELS = [250, 180, 120, 90, 60];
  const [tlZoomIdx, setTlZoomIdx] = useState<number>(0);
  const [tlPanOffset, setTlPanOffset] = useState<number>(0);
  const tlVisibleMinutes = TL_ZOOM_LEVELS[tlZoomIdx];

  const handleSelectStock = useCallback((sym: string) => {
    // Invalidate fingerprint caches when switching stocks
    macdFingerprintCache.invalidate();
    signalFingerprintCache.invalidate();
    pvFingerprintCache.invalidate();
    selectStock(sym); setShowSearch(false); setSearchQuery(""); setSearchResults([]);
    setKlineVisibleBars(80); setTlZoomIdx(0);
  }, [selectStock]);

  // ── Performance flag: skip heavy timeline computations in K-line mode ──
  const isTimelineActive = chartMode === "timeline" || chartMode === "5d-timeline";

  // ── Live Timeline (skip heavy computation in kline mode) ──
  const liveTimeline = useMemo(() => {
    if (!isTimelineActive || timeline.length === 0) return timeline;
    const now = new Date(); const h = now.getHours(); const m = now.getMinutes();
    const isMorningSession = (h === 9 && m >= 30) || (h === 10) || (h === 11 && m <= 30);
    const isAfternoonSession = (h >= 13 && h < 15) || (h === 15 && m === 0);
    const isTradingHours = isMorningSession || isAfternoonSession;
    let truncated = timeline;
    if (isTradingHours) {
      const curMin = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const lastValidIdx = timeline.reduce((lastIdx: number, d: TimelineItem, i: number) => d.time <= curMin ? i : lastIdx, -1);
      if (lastValidIdx >= 0 && lastValidIdx < timeline.length - 1) truncated = timeline.slice(0, lastValidIdx + 1);
    }
    if (!quote || !quote.price || quote.price <= 0) return truncated;
    const last = truncated[truncated.length - 1];
    if (!last) return truncated;
    const curMin = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (last.time === curMin) {
      // Fast path: if only the price changed, return same array with last element updated
      // This reduces downstream useMemo recomputation when just the quote price ticks
      if (last.price === quote.price) return truncated;
      const changePercent = quote.prevClose > 0 ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : last.changePercent;
      const newChangePercent = Number((changePercent ?? 0).toFixed(2));
      // Only update if price or changePercent actually differs
      if (last.price === quote.price && last.changePercent === newChangePercent) return truncated;
      // Mutate-friendly: create minimal new array with only last element changed
      const updated = truncated.slice(0, -1);
      updated.push({ ...last, price: quote.price, changePercent: newChangePercent });
      return updated;
    }
    if (isTradingHours) {
      const changePercent = quote.prevClose > 0 ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : 0;
      return [...truncated, { time: curMin, price: quote.price, avgPrice: quote.price, volume: 0, changePercent: Number((changePercent ?? 0).toFixed(2)) }];
    }
    return truncated;
  }, [timeline, quote, isTimelineActive]);

  const tlLastDataIdx = useMemo(() => {
    if (liveTimeline.length === 0) return -1;
    const lastTime = liveTimeline[liveTimeline.length - 1].time;
    const [h, m] = lastTime.split(':').map(Number);
    return h < 12 ? (h - 9) * 60 + (m - 30) : 121 + (h - 13) * 60 + m;
  }, [liveTimeline]);

  const tlZoomIn = (cursorRatio?: number) => {
    if (cursorRatio !== undefined && cursorRatio >= 0) {
      const oldVisible = TL_ZOOM_LEVELS[tlZoomIdx]; const newIdx = Math.min(tlZoomIdx + 1, TL_ZOOM_LEVELS.length - 1);
      const newVisible = TL_ZOOM_LEVELS[newIdx]; const lastDataIdx = tlLastDataIdx; const totalSlots = 242;
      if (oldVisible >= totalSlots || lastDataIdx < 0) { const cursorSlotIdx = cursorRatio * (totalSlots - 1); const newStartIdx = cursorSlotIdx - cursorRatio * (newVisible - 1); const newEndIdx = newStartIdx + newVisible - 1; setTlZoomIdx(newIdx); setTlPanOffset(Math.max(0, Math.round(lastDataIdx - newEndIdx))); }
      else { const currentEndIdx = Math.min(lastDataIdx, Math.max(oldVisible - 1, lastDataIdx - tlPanOffset)); const currentStartIdx = Math.max(0, currentEndIdx - oldVisible + 1); const cursorIdx = currentStartIdx + cursorRatio * (currentEndIdx - currentStartIdx); const newStartIdx = cursorIdx - cursorRatio * (newVisible - 1); const newEndIdx = newStartIdx + newVisible - 1; setTlZoomIdx(newIdx); setTlPanOffset(Math.max(0, Math.round(lastDataIdx - newEndIdx))); }
    } else { setTlZoomIdx((prev) => Math.min(prev + 1, TL_ZOOM_LEVELS.length - 1)); setTlPanOffset(0); }
  };
  const tlZoomOut = (cursorRatio?: number) => {
    if (cursorRatio !== undefined && cursorRatio >= 0 && tlZoomIdx > 0) {
      const oldVisible = TL_ZOOM_LEVELS[tlZoomIdx]; const newIdx = Math.max(tlZoomIdx - 1, 0); const newVisible = TL_ZOOM_LEVELS[newIdx]; const lastDataIdx = tlLastDataIdx;
      if (newVisible >= 242) { setTlZoomIdx(newIdx); setTlPanOffset(0); }
      else { const currentEndIdx = Math.min(lastDataIdx, Math.max(oldVisible - 1, lastDataIdx - tlPanOffset)); const currentStartIdx = Math.max(0, currentEndIdx - oldVisible + 1); const cursorIdx = currentStartIdx + cursorRatio * (currentEndIdx - currentStartIdx); const newStartIdx = cursorIdx - cursorRatio * (newVisible - 1); const newEndIdx = newStartIdx + newVisible - 1; setTlZoomIdx(newIdx); setTlPanOffset(Math.max(0, Math.round(lastDataIdx - newEndIdx))); }
    } else { setTlZoomIdx((prev) => Math.max(prev - 1, 0)); setTlPanOffset(0); }
  };
  const tlZoomReset = () => { setTlZoomIdx(0); setTlPanOffset(0); };

  // ── Timeline MACD & Signals (only compute in timeline mode for performance) ──
  // Optimization: Use fingerprint-based caching to skip heavy recomputation
  // when only the last price ticks by a small amount between refreshes

  const timelineMACDData = useMemo(() => {
    // Skip heavy MACD computation when not in timeline mode
    if (!isTimelineActive || liveTimeline.length === 0) return [];
    // Fingerprint: skip recomputation if data hasn't meaningfully changed
    const fp = `${liveTimeline.length}:${liveTimeline.slice(-3).map(d => (d.price ?? 0).toFixed(2)).join(',')}`;
    return macdFingerprintCache.compute(fp, () => {
      const prices = liveTimeline.map((d) => d.price);
      const macdResult = calculateMACD(prices);
      const result: { time: string; dif: number | null; dea: number | null; macd: number | null }[] = [];
      for (let i = 0; i < liveTimeline.length; i++) { const mr = macdResult[i]; if (isNaN(mr.dif) || isNaN(mr.dea) || isNaN(mr.macd)) result.push({ time: liveTimeline[i].time, dif: null, dea: null, macd: null }); else result.push({ time: liveTimeline[i].time, dif: mr.dif, dea: mr.dea, macd: mr.macd }); }
      return result.filter((d) => d.dif != null);
    });
  }, [liveTimeline, isTimelineActive]);

  const timelineSignals = useMemo(() => {
    // Skip the heaviest computation (~7000 condition evaluations) when not in timeline mode
    if (!isTimelineActive) return [] as (TSignal | null)[];
    // Fingerprint: skip if inputs haven't changed
    // Include signal engine version to invalidate cache when signal logic changes
    const SIGNAL_ENGINE_VERSION = 'v6.1';
    const fp = `${SIGNAL_ENGINE_VERSION}:${liveTimeline.length}:${timelineMACDData.length}:${liveTimeline.slice(-3).map(d => (d.price ?? 0).toFixed(2)).join(',')}:${timelinePrevClose}:${factorOverrides.length}:${szIndexRegime?.regime}:${sectorRegime?.regime}:${customFactors.length}:${quote?.open ?? 0}`;
    return signalFingerprintCache.compute(fp, () =>
      generateTimelineSignals(liveTimeline, timelineMACDData, timelinePrevClose, factorOverrides, szIndexRegime, customFactors, sectorRegime, quote?.open)
    );
  }, [liveTimeline, timelineMACDData, timelinePrevClose, factorOverrides, szIndexRegime, customFactors, sectorRegime, isTimelineActive, quote?.open]);
  // NOTE: Removed useDeferredValue — it was causing labels to appear with visible delay.
  // The fingerprint caching above makes recomputation cheap when data hasn't changed,
  // so deferred rendering is no longer needed and directly using values is faster.
  const pvMarkers = useMemo(() => {
    if (!isTimelineActive || liveTimeline.length < 10 || timelinePrevClose <= 0) return [];
    // Fingerprint includes volume data to avoid stale results when algorithm changes
    const fp = `${liveTimeline.length}:${liveTimeline.slice(-5).map(d => `${(d.price ?? 0).toFixed(2)}:${d.volume}`).join(',')}:${timelinePrevClose}`;
    return pvFingerprintCache.compute(fp, () => detectPulseVolumeMarkers(liveTimeline, timelinePrevClose));
  }, [liveTimeline, timelinePrevClose, isTimelineActive]);
  // NOTE: Removed useDeferredValue for pvMarkers — same reason as signals above.
  const latestTimelineSignal = useMemo(() => { for (let i = timelineSignals.length - 1; i >= 0; i--) { if (timelineSignals[i]) return timelineSignals[i]; } return null; }, [timelineSignals]);

  // ── Recent signals for SignalSummaryPanel (memoized to avoid .slice() creating new array each render) ──
  const recentSignals = useMemo(() => timelineSignals.slice(-60), [timelineSignals]);

  // ── Signal counts ──
  const signalCounts = useMemo(() => {
    if (!isTimelineActive) return { buyCount: 0, strongBuys: 0, sellCount: 0, strongSells: 0, totalSigs: 0, strongSigs: 0, mediumSigs: 0, weakSigs: 0, confluenceCount: 0, keyLevelCount: 0, vwapSlopeCount: 0, indexRegimeCount: 0 };
    let buyCount = 0, strongBuys = 0, sellCount = 0, strongSells = 0;
    let totalSigs = 0, strongSigs = 0, mediumSigs = 0, weakSigs = 0;
    let confluenceCount = 0, keyLevelCount = 0, vwapSlopeCount = 0, indexRegimeCount = 0;
    for (const s of timelineSignals) { if (!s) continue; totalSigs++; if (s.type === "buy") { buyCount++; if (s.strength === "strong") strongBuys++; } else if (s.type === "sell") { sellCount++; if (s.strength === "strong") strongSells++; } if (s.strength === "strong") strongSigs++; else if (s.strength === "medium") mediumSigs++; else if (s.strength === "weak") weakSigs++; if (s.description?.includes("共振")) confluenceCount++; if (s.description?.includes("阻力确认") || s.description?.includes("支撑确认")) keyLevelCount++; if (s.description?.includes("均价线拐头")) vwapSlopeCount++; if (s.description?.includes("大盘")) indexRegimeCount++; }
    return { buyCount, strongBuys, sellCount, strongSells, totalSigs, strongSigs, mediumSigs, weakSigs, confluenceCount, keyLevelCount, vwapSlopeCount, indexRegimeCount };
  }, [timelineSignals, isTimelineActive]);

  // ── Sound / Alert ──
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  useEffect(() => { try { const v = localStorage.getItem("t-sound-enabled"); if (v !== null) queueMicrotask(() => setSoundEnabled(v === "true")); } catch {} }, []);
  const alertedSignalIdsRef = useRef<Set<string>>(new Set());
  const [flashSignal, setFlashSignal] = useState<'buy' | 'sell' | 'stoploss' | null>(null);
  useEffect(() => { try { localStorage.setItem("t-sound-enabled", String(soundEnabled)); } catch {} }, [soundEnabled]);
  useEffect(() => {
    if (!soundEnabled && flashSignal === null) return;
    const newStrongSignals: { type: 'buy' | 'sell' | 'stoploss'; id: string }[] = [];
    for (let i = 0; i < timelineSignals.length; i++) { const sig = timelineSignals[i]; if (!sig || sig.strength !== 'strong') continue; const id = `${i}-${sig.type}-${sig.reason}`; if (!alertedSignalIdsRef.current.has(id)) { alertedSignalIdsRef.current.add(id); newStrongSignals.push({ type: sig.type, id }); } }
    if (newStrongSignals.length > 0) { const latest = newStrongSignals[newStrongSignals.length - 1]; if (soundEnabled) playAlertSound(latest.type); setTimeout(() => { setFlashSignal(latest.type); setTimeout(() => setFlashSignal(null), 1200); }, 0); }
  }, [timelineSignals, soundEnabled]);

  // ── T-Index ──
  const tIndex = useMemo(() => {
    if (!isTimelineActive) return 50;
    let score = 50;
    for (let i = timelineSignals.length - 1; i >= 0; i--) { const sig = timelineSignals[i]; if (!sig) continue; if (i < timelineSignals.length - 5) break; if (sig.type === 'buy') { if (sig.strength === 'strong') score += 15; else if (sig.strength === 'medium') score += 8; else score += 3; } else if (sig.type === 'sell') { if (sig.strength === 'strong') score -= 15; else if (sig.strength === 'medium') score -= 8; else score -= 3; } else if (sig.type === 'stoploss') score -= 20; }
    const regime = szIndexRegime?.regime;
    if (regime === '震荡市') score += 5; else if (regime === '上升通道') score -= 5; else if (regime === '下跌趋势') score -= 10; else if (regime === '横盘末期') score -= 15;
    return Math.max(0, Math.min(100, score));
  }, [timelineSignals, szIndexRegime, isTimelineActive]);

  // ── Smart Action ──
  const smartAction = useMemo(() => {
    if (!isTimelineActive) return { icon: '⏳', text: '观望等待', reason: 'K线模式下暂无实时信号', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', confidence: 30, type: 'buy' as const };
    const lastTime = liveTimeline[liveTimeline.length - 1]?.time;
    const timeWindow = lastTime ? getTimeWindow(lastTime) : undefined;
    let latestStrong: TSignal | null = null; let strongCount = 0; let mediumCount = 0;
    for (let i = timelineSignals.length - 1; i >= 0; i--) { const sig = timelineSignals[i]; if (!sig) continue; if (i < timelineSignals.length - 10) break; if (sig.strength === 'strong') { strongCount++; if (!latestStrong) latestStrong = sig; } if (sig.strength === 'medium') mediumCount++; }
    const hasStoploss = timelineSignals.slice(-10).some(s => s?.type === 'stoploss');
    if (hasStoploss) return { icon: '⚡', text: '紧急止损', reason: '触发止损信号，建议立即平仓', color: 'text-amber-500', bgColor: 'bg-amber-500/10 border-amber-500/25', confidence: 95, type: 'stoploss' as const };
    if (latestStrong?.type === 'buy' && latestStrong.strength === 'strong') { const isBuyWindow = timeWindow?.includes('买入') || timeWindow?.includes('低吸'); return { icon: '🟢', text: isBuyWindow ? '建议正T买回' : '建议买入', reason: `强买入信号(${latestStrong.reason})${isBuyWindow ? '，处于买入时段' : ''}`, color: 'text-green-500', bgColor: 'bg-green-500/10 border-green-500/25', confidence: 80 + strongCount * 5, type: 'buy' as const }; }
    if (latestStrong?.type === 'sell' && latestStrong.strength === 'strong') { const isSellWindow = timeWindow?.includes('卖出') || timeWindow?.includes('冲高'); return { icon: '🔴', text: isSellWindow ? '建议正T卖出' : '建议卖出', reason: `强卖出信号(${latestStrong.reason})${isSellWindow ? '，处于卖出时段' : ''}`, color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/25', confidence: 80 + strongCount * 5, type: 'sell' as const }; }
    if (mediumCount > 0 && strongCount === 0) { const mediumSig = (() => { for (let i = timelineSignals.length - 1; i >= 0; i--) { if (timelineSignals[i]?.strength === 'medium') return timelineSignals[i]; } return null; })(); return { icon: '📊', text: '等待确认', reason: `${mediumSig?.type === 'buy' ? '买入' : '卖出'}信号强度中等(${mediumSig?.reason})，等待加强确认`, color: 'text-orange-500', bgColor: 'bg-orange-500/10 border-orange-500/25', confidence: 50 + mediumCount * 10, type: (mediumSig?.type || 'buy') as 'buy' | 'sell' }; }
    return { icon: '⏳', text: '观望等待', reason: tIndex <= 50 ? '做T指数偏低，暂无明显操作机会' : '暂无有效信号，继续观察', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', confidence: 30, type: 'buy' as const };
  }, [timelineSignals, liveTimeline, tIndex, isTimelineActive]);

  const prevDayMA5 = useMemo(() => {
    if (allChartData.length < 1) return null;
    const lastBar = allChartData[allChartData.length - 1];
    if (lastBar.ma5 != null) return lastBar.ma5;
    if (allChartData.length >= 2) return allChartData[allChartData.length - 2].ma5 ?? null;
    return null;
  }, [allChartData]);

  const keyPriceLevels = useMemo(() => {
    if (!isTimelineActive || liveTimeline.length < 5 || !timelinePrevClose || timelinePrevClose <= 0) return [];
    return computeKeyPriceLevels(timelinePrevClose, liveTimeline);
  }, [liveTimeline, timelinePrevClose, isTimelineActive]);

  const isUp = quote ? quote.change >= 0 : true;
  const priceColor = isUp ? "text-red-500" : "text-green-500";

  return (
    <PasswordGate>
    <div className="min-h-screen flex flex-col bg-background">
      <style dangerouslySetInnerHTML={{ __html: SIGNAL_PULSE_CSS }} />
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Zap className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-bold hidden sm:block">做T助手</h1>
              <Badge variant="outline" className="text-xs hidden sm:flex">A股</Badge>
              <div className="flex items-center border border-border rounded-md overflow-hidden ml-1">
                {(["t-assistant", "screener", "low-open", "intraday-screener", "sector-rotation", "early-screen", "limit-up", "baota-deploy"] as const).map((mode) => (
                  <button key={mode} onClick={() => { setPageMode(mode); setScreenerSubView("screener"); }} className={`px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${pageMode === mode ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}>
                    {mode === "t-assistant" && "做T"}
                    {mode === "screener" && <><Filter className="w-3 h-3" />选股</>}
                    {mode === "intraday-screener" && <><Activity className="w-3 h-3" />分时选股</>}
                    {mode === "sector-rotation" && <><Flame className="w-3 h-3" />轮动</>}
                    {mode === "early-screen" && <><Clock className="w-3 h-3" />早盘选股</>}
                    {mode === "low-open" && <><TrendingDown className="w-3 h-3" />低开</>}
                    {mode === "limit-up" && <><TrendingUp className="w-3 h-3" />回踩</>}
                    {mode === "baota-deploy" && <><Server className="w-3 h-3" />部署</>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 max-w-md relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={searchQuery} onChange={(e) => { handleSearch(e.target.value); setShowSearch(true); }} onFocus={() => setShowSearch(true)} placeholder="搜索A股代码或名称..." className="pl-9 pr-8 h-9" />
                {searchQuery && (<button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground" /></button>)}
              </div>
              {showSearch && (searchResults.length > 0 || searchLoading) && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  {searchLoading ? (<div className="p-4 text-center text-sm text-muted-foreground">搜索中...</div>) : (
                    searchResults.map((stock) => (
                      <button key={stock.symbol} onClick={() => handleSelectStock(stock.symbol)} className="w-full px-4 py-2.5 text-left hover:bg-accent flex items-center justify-between transition-colors">
                        <div><span className="font-medium text-sm">{stock.symbol}</span><span className="ml-2 text-sm text-muted-foreground">{stock.name}</span></div>
                        <div className="flex items-center gap-1">{stock.type === "ETF" && <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-purple-500/10 text-purple-600 border-purple-500/20">ETF</Badge>}<Badge variant="outline" className="text-xs">{stock.exchange}</Badge></div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-1">
                {menuStocks.map((s) => (<Button key={s.symbol} variant={mounted && symbol === s.symbol ? "default" : "ghost"} size="sm" className="h-7 text-xs px-2" onClick={() => handleSelectStock(s.symbol)}>{s.name}</Button>))}
              </div>
              <div className="w-px h-5 bg-border hidden lg:block" />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setShowPasswordDialog(true)}
                title="密码管理"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                密码管理
              </Button>
            </div>
          </div>
        </div>
      </header>
      {showSearch && (<div className="fixed inset-0 z-40" onClick={() => setShowSearch(false)} />)}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-4">
        {/* Screener sub-navigation bar */}
        {pageMode !== "t-assistant" && pageMode !== "sector-rotation" && pageMode !== "baota-deploy" && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setScreenerSubView("screener")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${screenerSubView === "screener" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Filter className="w-3.5 h-3.5" />
                选股结果
              </button>
              <button
                onClick={() => setScreenerSubView("history")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${screenerSubView === "history" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <History className="w-3.5 h-3.5" />
                历史验证
              </button>
            </div>
            {screenerSubView === "history" && (
              <span className="text-[10px] text-muted-foreground">验证选出的股票在1日/3日/5日后是否走强</span>
            )}
          </div>
        )}
        {pageMode === "baota-deploy" ? (<BaotaDeployGuide />) : screenerSubView === "history" && pageMode !== "t-assistant" && pageMode !== "sector-rotation" ? (
          <ScreenerHistoryPanel onSelectStock={(sym) => { selectStock(sym); setPageMode("t-assistant"); }} />
        ) : pageMode === "screener" ? (<StockScreener onSelectStock={(sym) => { selectStock(sym); setPageMode("t-assistant"); }} />) : pageMode === "intraday-screener" ? (<IntradayScreener onSelectStock={(sym) => { selectStock(sym); setPageMode("t-assistant"); }} />) : pageMode === "sector-rotation" ? (<SectorRotationPanel onSelectStock={(sym) => { selectStock(sym); setPageMode("t-assistant"); }} />) : pageMode === "early-screen" ? (<EarlyTradingScreener onSelectStock={(sym) => { selectStock(sym); setPageMode("t-assistant"); }} />) : pageMode === "low-open" ? (<LowOpenScreener onSelectStock={(sym) => { selectStock(sym); setPageMode("t-assistant"); }} />) : pageMode === "limit-up" ? (<LimitUpAnalysis onSelectStock={(sym) => { selectStock(sym); setPageMode("t-assistant"); }} />) : (
        <>
        {/* Stock Info Bar */}
        <Card className={`mb-4 transition-all ${flashSignal === 'buy' ? 'animate-flash-green' : flashSignal ? 'animate-flash-red' : ''}`}>
          <CardContent className="p-4">
            {loading && !quote ? (<div className="flex items-center gap-4"><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-32" /><Skeleton className="h-6 w-20" /></div>) : quote ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <div><div className="font-bold text-lg">{quote.symbol}</div><div className="text-sm text-muted-foreground">{quote.name}</div></div>
                  <button onClick={toggleMenuStock} title={isInMenu ? "从菜单栏移除" : "添加到菜单栏"} className={`p-1.5 rounded-md transition-colors ${isInMenu ? "text-yellow-500 hover:text-yellow-600 bg-yellow-500/10" : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"}`}><Star className="h-4 w-4" fill={isInMenu ? "currentColor" : "none"} /></button>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold tabular-nums ${priceColor}`}>{formatPrice(quote.price)}</span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${priceColor}`}>{isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}{formatPrice(Math.abs(quote.change))}({formatNum(Math.abs(quote.changePercent))}%)</span>
                </div>
                {(isTimelineActive ? latestTimelineSignal : (latestSignal && latestSignal.type !== "hold" ? latestSignal : null)) && (
                  <Badge variant={(isTimelineActive ? latestTimelineSignal!.type : latestSignal!.type) === "buy" ? "default" : "destructive"} className="text-xs px-3 py-1">
                    {((isTimelineActive ? latestTimelineSignal!.type : latestSignal!.type) === "buy" ? "🟢 买入信号" : "🔴 卖出信号")} · {(isTimelineActive ? latestTimelineSignal!.reason : latestSignal!.reason)}
                  </Badge>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm ml-auto">
                  <div><span className="text-muted-foreground">开盘</span> <span className="font-mono">{formatPrice(quote.open)}</span></div>
                  <div><span className="text-muted-foreground">最高</span> <span className="font-mono text-red-500">{formatPrice(quote.high)}</span></div>
                  <div><span className="text-muted-foreground">最低</span> <span className="font-mono text-green-500">{formatPrice(quote.low)}</span></div>
                  <div><span className="text-muted-foreground">昨收</span> <span className="font-mono">{formatPrice(quote.prevClose)}</span></div>
                  <div><span className="text-muted-foreground">成交量</span> <span className="font-mono">{formatVolume(quote.volume)}</span></div>
                  {quote.turnover != null && quote.turnover > 0 && <div><span className="text-muted-foreground">换手</span> <span className="font-mono">{quote.turnover?.toFixed(2)}%</span></div>}
                  {quote.peRatio > 0 && <div><span className="text-muted-foreground">PE</span> <span className="font-mono">{formatNum(quote.peRatio)}</span></div>}
                  {quote.marketCap > 0 && <div><span className="text-muted-foreground">市值</span> <span className="font-mono">{formatMarketCap(quote.marketCap)}</span></div>}
                </div>
              </div>
            ) : (<div className="text-muted-foreground text-sm">选择或搜索A股开始分析</div>)}
          </CardContent>
        </Card>

        {/* Position Signal Card — hidden in 5d-timeline mode */}
        {chartMode !== "5d-timeline" && (
        <PositionSignalCard
          indexRegime={szIndexRegime}
          sectorRegime={sectorRegime}
          stockChangePercent={quote?.changePercent}
          stockName={quote?.name}
          indexLabel={INDEX_CONFIG[activeIndexKey]?.label || "深证"}
          sectorName={sectorInfo?.name}
        />
        )}

        {/* Chart Mode & Interval Selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {isAShareStock && (<Tabs value={chartMode} onValueChange={(v) => changeChartMode(v as ChartMode)}><TabsList className="h-8"><TabsTrigger value="5d-timeline" className="text-xs px-2 h-6"><CalendarDays className="h-3.5 w-3.5 mr-1" />五日</TabsTrigger><TabsTrigger value="timeline" className="text-xs px-3 h-6"><LineChart className="h-3.5 w-3.5 mr-1" />分时</TabsTrigger><TabsTrigger value="kline" className="text-xs px-3 h-6"><CandlestickChart className="h-3.5 w-3.5 mr-1" />K线</TabsTrigger></TabsList></Tabs>)}
          <Button variant={showNewsAnalysis ? "default" : "outline"} size="sm" className="h-8 text-xs px-3" onClick={() => { const next = !showNewsAnalysis; setShowNewsAnalysis(next); if (next && !newsData.market) (window as any).__newsFetchAnalysis?.(); }}><Newspaper className="h-3.5 w-3.5 mr-1" />资讯分析</Button>
          {chartMode === "kline" && (<div className="flex items-center gap-1">{INTERVALS.map((intv) => (<Button key={intv.value} variant={interval === intv.value ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => changeInterval(intv.value)}>{intv.label}</Button>))}</div>)}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {(() => { const lastTl = liveTimeline[liveTimeline.length - 1]; if (lastTl && lastTl.avgPrice && lastTl.avgPrice > 0) { const deviation = ((lastTl.price - lastTl.avgPrice) / lastTl.avgPrice) * 100; const isAbove = deviation >= 0; return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${isAbove ? "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400" : "bg-green-500/10 border-green-500/25 text-green-600 dark:text-green-400"}`} title={`价格 ${formatPrice(lastTl.price)} 相对均价 ${formatPrice(lastTl.avgPrice)} 偏离 ${deviation >= 0 ? "+" : ""}${(deviation ?? 0).toFixed(2)}%`}><span className="opacity-70">{isAbove ? "↑均线上方" : "↓均线下方"}</span><span className="font-mono">{deviation >= 0 ? "+" : ""}{(deviation ?? 0).toFixed(2)}%</span></span>; } return null; })()}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSoundEnabled(prev => !prev)} title={soundEnabled ? '关闭声音提醒' : '开启声音提醒'}>{soundEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}</Button>
            <Clock className="h-3 w-3" />实时刷新 1.5s
          </div>
        </div>

        {error && (<Card className="mb-4 border-destructive/50"><CardContent className="p-4 text-destructive text-sm">{error}</CardContent></Card>)}

        {/* Charts */}
        {(chartMode === "timeline" || chartMode === "5d-timeline") && liveTimeline.length === 0 && timelineLoading ? (
          <div className="space-y-4"><Skeleton className="h-[400px] w-full" /><Skeleton className="h-[150px] w-full" /><Skeleton className="h-[100px] w-full" /></div>
        ) : chartMode === "5d-timeline" ? (
          <FiveDayTimelinePanel symbol={symbol} quote={quote} timeline={liveTimeline} timelinePrevClose={timelinePrevClose} />
        ) : chartMode === "timeline" && liveTimeline.length > 0 ? (
          <div className="space-y-4">
            <TimeSharingPanel data={liveTimeline} prevClose={timelinePrevClose} symbol={symbol} signals={timelineSignals} macdData={timelineMACDData} visibleMinutes={tlVisibleMinutes} onZoomIn={tlZoomIn} onZoomOut={tlZoomOut} onZoomReset={tlZoomReset} zoomIdx={tlZoomIdx} maxZoomIdx={TL_ZOOM_LEVELS.length - 1} prevDayMA5={prevDayMA5} szIndexRegime={szIndexRegime} activeIndexKey={activeIndexKey} indexConfig={INDEX_CONFIG} onCycleIndex={cycleIndexKey} keyPriceLevels={keyPriceLevels} panOffset={tlPanOffset} onPanOffsetChange={setTlPanOffset} sectorRegime={sectorRegime} sectorInfo={sectorInfo} sectorLoading={sectorLoading} onRetrySector={retrySectorFetch} pvMarkers={pvMarkers} stockName={quote?.name} indexTimelineData={indexTimelineData} sectorTimelineData={sectorTimelineData} indexLoading={indexLoading} onRetryIndex={retryIndexFetch} />
            {/* 涨跌家数 + 市场情绪指数 — 放在深证成指分时图后面 */}
            {marketBreadth && (() => {
              const { totalUp, totalDown, totalFlat, shUp, shDown, szUp, szDown, limitUp, limitDown, history } = marketBreadth;
              return (
                <div className="space-y-2">
                  <MarketBreadthChart
                    history={history || []}
                    currentUp={totalUp}
                    currentDown={totalDown}
                    currentFlat={totalFlat}
                    limitUp={limitUp}
                    limitDown={limitDown}
                    shUp={shUp}
                    shDown={shDown}
                    szUp={szUp}
                    szDown={szDown}
                  />
                  <MarketSentiment
                    totalUp={totalUp}
                    totalDown={totalDown}
                    totalFlat={totalFlat}
                    limitUp={limitUp}
                    limitDown={limitDown}
                    breadthHistory={history || []}
                    indexRegimes={indexRegimes}
                  />
                  {/* 涨跌幅分布 + 板块排行 各占50% */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {marketDistribution && (
                      <MarketChangeDistribution
                        buckets={marketDistribution.buckets}
                        total={marketDistribution.total}
                        median={marketDistribution.median}
                        avgChange={marketDistribution.avgChange}
                        limitUpSealed={marketDistribution.limitUpSealed}
                        limitUpBroken={marketDistribution.limitUpBroken}
                        limitDownSealed={marketDistribution.limitDownSealed}
                        limitDownBroken={marketDistribution.limitDownBroken}
                      />
                    )}
                    <SectorTopBottomCard />
                  </div>
                  {/* 涨跌停详情 */}
                  {marketLimitStats && marketLimitStats.limitUp.total + marketLimitStats.limitDown.total > 0 && (
                    <MarketLimitStats stats={marketLimitStats} />
                  )}
                </div>
              );
            })()}
          </div>
        ) : chartMode === "kline" && chartData.length > 0 ? (
          <KLineChartPanel allChartData={allChartData} klineVisibleBars={klineVisibleBars} setKlineVisibleBars={setKlineVisibleBars} klinePanOffset={klinePanOffset} setKlinePanOffset={setKlinePanOffset} interval={interval} />
        ) : chartMode === "kline" && loading ? (
          <div className="space-y-4"><Skeleton className="h-[400px] w-full" /><Skeleton className="h-[150px] w-full" /><Skeleton className="h-[100px] w-full" /></div>
        ) : (
          !loading && (<Card><CardContent className="p-12 text-center text-muted-foreground"><Activity className="h-12 w-12 mx-auto mb-4 opacity-30" /><p className="text-lg font-medium mb-2">选择A股开始分析</p><p className="text-sm">在搜索框中输入股票代码或名称，或点击上方热门股票</p></CardContent></Card>)
        )}

        {/* T-Suitability Score + Risk Dashboard — only in timeline mode */}
        {chartMode === "timeline" && liveTimeline.length > 0 && (
          <LazyMount height={80} className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <TSuitabilityScore symbol={symbol} quote={quote} liveTimeline={liveTimeline} sectorRegime={sectorRegime} szIndexRegime={szIndexRegime} />
              <RiskAlertPanel symbol={symbol} quote={quote} liveTimeline={liveTimeline} sectorRegime={sectorRegime} szIndexRegime={szIndexRegime} signalCounts={signalCounts} />
            </div>
          </LazyMount>
        )}

        {/* T-Trading Signals Summary — hidden in 5d-timeline mode */}
        {chartMode !== "5d-timeline" && (chartData.length > 0 || (chartMode === "timeline" && liveTimeline.length > 0)) && (
          <LazyMount height={120}>
            <SignalSummaryPanel chartMode={chartMode} chartData={chartData} liveTimeline={liveTimeline} timeline={timeline} timelineSignals={recentSignals} latestTimelineSignal={latestTimelineSignal} latestSignal={latestSignal} signalCounts={signalCounts} pvMarkers={pvMarkers} />
          </LazyMount>
        )}


        {/* News Analysis Panel */}
        <LazyMount height={100}>
          <NewsAnalysisPanel symbol={symbol} stockName={quote?.name} isAShare={isAShareStock} quote={quote} sectorInfo={sectorInfo} newsData={newsData} setNewsData={setNewsData} newsLoading={newsLoading} setNewsLoading={setNewsLoading} showNewsAnalysis={showNewsAnalysis} setShowNewsAnalysis={setShowNewsAnalysis} />
        </LazyMount>

        {/* Strategy Admin Panel — hidden in 5d-timeline mode */}
        {chartMode !== "5d-timeline" && (
        <LazyMount height={100}>
          <StrategyAdminPanel onFactorsChanged={(factors) => setFactorOverrides(buildFactorOverridesFromDB(factors))} onCustomFactorsChanged={loadCustomFactorsFromDB} />
        </LazyMount>
        )}
        </>
        )}

        {/* Trading Rules Reference — only on t-assistant timeline page */}
        {pageMode === "t-assistant" && chartMode === "timeline" && liveTimeline.length > 0 && (
        <div className="mb-4">
          <TradingRulesCard autoExpanded={autoExpanded} pvMarkers={pvMarkers} />
        </div>
        )}

      </main>
      <footer className="border-t border-border bg-card/30 mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>做T助手 · A股日内交易信号分析工具</span>
            <span>数据仅供参考，不构成投资建议</span>
          </div>
        </div>
      </footer>
      {/* Password Management Dialog */}
      <PasswordManageDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog} />
    </div>
    </PasswordGate>
  );
}
