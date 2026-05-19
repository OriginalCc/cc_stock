"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect, startTransition, useDeferredValue } from "react";
import dynamic from "next/dynamic";
import { useStockData, type TimeInterval, type StockSearchResult, type KLineItem, type TimelineItem, type ChartMode } from "@/hooks/use-stock-data";

// Dynamic imports to reduce initial compilation memory
// Use loading skeletons for critical chart components
const StockScreener = dynamic(() => import("@/components/stock-screener").then(m => ({ default: m.StockScreener })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载选股器...</span></div> });
const IntradayScreener = dynamic(() => import("@/components/intraday-screener").then(m => ({ default: m.IntradayScreener })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载分时选股...</span></div> });
const LimitUpAnalysis = dynamic(() => import("@/components/limit-up-analysis").then(m => ({ default: m.LimitUpAnalysis })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载涨停分析...</span></div> });
const EarlyTradingScreener = dynamic(() => import("@/components/early-trading-screener").then(m => ({ default: m.EarlyTradingScreener })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载早盘选股...</span></div> });
const LowOpenScreener = dynamic(() => import("@/components/low-open-screener").then(m => ({ default: m.LowOpenScreener })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载低开选股...</span></div> });
const SectorRotationPanel = dynamic(() => import("@/components/sector-rotation-panel").then(m => ({ default: m.SectorRotationPanel })), { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载板块轮动...</span></div> });
const ScreenerHistoryPanel = dynamic(() => import("@/components/screener-history-panel").then(m => ({ default: m.ScreenerHistoryPanel })), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载历史记录...</span></div> });
const StrategyAdminPanel = dynamic(() => import("@/components/strategy-admin-panel").then(m => ({ default: m.StrategyAdminPanel })), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载策略管理...</span></div> });
const TimeSharingPanel = dynamic(() => import("@/components/time-sharing-panel").then(m => ({ default: m.TimeSharingPanel })), {
  ssr: false,
  loading: () => <div className="h-[500px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载分时图...</span></div>,
});
const MiniTimelinePanel = dynamic(() => import("@/components/time-sharing-panel").then(m => ({ default: m.MiniTimelinePanel })), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载分时图...</span></div> });
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
const TTradeJournal = dynamic(() => import("@/components/t-trade-journal").then(m => ({ default: m.TTradeJournal })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载做T记录...</span></div> });
const RiskAlertPanel = dynamic(() => import("@/components/risk-alert-panel").then(m => ({ default: m.RiskAlertPanel })), { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center"><span className="text-sm text-muted-foreground animate-pulse">加载风险仪表盘...</span></div> });
import { PasswordGate } from "@/components/password-gate";
import { PasswordManageDialog } from "@/components/password-manage-dialog";
import { calculateMACD } from "@/lib/indicators";
import { getTimeWindow, detectMarketRegimeDetail, buildFactorOverridesFromDB, computeKeyPriceLevels, type FactorOverride, type RegimeDetail } from "@/lib/t-strategy";
import { generateTimelineSignals, detectPulseVolumeMarkers, type TSignal, type PulseVolumeMarker, type CustomFactorDefinition, formatVolume, formatNum, formatMarketCap, REGIME_CONFIG, T_MODE_CONFIG, DEFAULT_ASHARES, INTERVALS, INDEX_CONFIG, INDEX_KEYS, SIGNAL_PULSE_CSS, playAlertSound, getTIndexColor, getTIndexLabel, getTIndexLabelColor, BUILT_IN_CUSTOM_FACTORS, CUSTOM_FACTORS_STORAGE_KEY, type IndexKey } from "@/lib/chart-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, TrendingUp, TrendingDown, Activity, ArrowUpRight, ArrowDownRight,
  X, Clock, Zap, LineChart, CandlestickChart, GitBranch, Filter,
  Star, Bell, BellOff, Volume2, Newspaper, CalendarDays, Flame,
  History, ShieldCheck, Server, Scale, AlertTriangle, BookOpen, Info,
  ChevronUp, ChevronDown,
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
  const [rulesExpanded, setRulesExpanded] = useState<boolean>(true);
  const [autoExpanded, setAutoExpanded] = useState<boolean>(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Auto-expand rules in first 3 minutes of market open ──
  useEffect(() => {
    if (chartMode !== "timeline") return;
    const checkMarketOpen = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const minutes = h * 60 + m;
      // 9:30 (570) ~ 9:33 (573) = first 3 minutes of market open
      const isOpeningMinutes = minutes >= 570 && minutes < 573;
      if (isOpeningMinutes && !rulesExpanded && !autoExpanded) {
        setRulesExpanded(true);
        setAutoExpanded(true);
      }
      // After 9:33, reset autoExpanded flag so user can manually toggle
      if (minutes >= 573 && autoExpanded) {
        setAutoExpanded(false);
      }
    };
    checkMarketOpen();
    const timer = setInterval(checkMarketOpen, 10000); // check every 10s
    return () => clearInterval(timer);
  }, [chartMode, rulesExpanded, autoExpanded]);

  // ── News state (passed to NewsAnalysisPanel) ──
  const [showNewsAnalysis, setShowNewsAnalysis] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsData, setNewsData] = useState<Record<string, any>>({});

  // ── Mount tracking (prevent hydration mismatch for localStorage-dependent renders) ──
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  // ── Menu Bar Stocks ──
  const [menuStocks, setMenuStocks] = useState<{ symbol: string; name: string }[]>(DEFAULT_ASHARES);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("menuStocks");
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) queueMicrotask(() => setMenuStocks(parsed)); }
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("menuStocks", JSON.stringify(menuStocks)); } catch {} }, [menuStocks]);
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

  useEffect(() => {
    // Index data fetch - start with active index immediately, then others with a delay
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchIndex = async (key: IndexKey) => {
      const { symbol: sym } = INDEX_CONFIG[key];
      try {
        const res = await fetch(`/api/stock/ashare-timeline?symbol=${encodeURIComponent(sym)}`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.error || !data.items || data.items.length < 10) return null;
        return { regime: detectMarketRegimeDetail(data.items, data.prevClose || data.items[0].price), items: data.items as TimelineItem[], prevClose: data.prevClose || data.items[0].price };
      } catch { return null; }
    };

    const fetchAllIndices = async () => {
      const results = await Promise.allSettled(
        INDEX_KEYS.map(key => fetchIndex(key))
      );
      if (cancelled) return;
      setIndexRegimes(prev => { let changed = false; const next = { ...prev }; INDEX_KEYS.forEach((key, i) => { if (results[i].status === "fulfilled" && results[i].value) { const newRegime = results[i].value!.regime; if (prev[key]?.regime !== newRegime.regime || prev[key]?.confidence !== newRegime.confidence) { next[key] = newRegime; changed = true; } } }); return changed ? next : prev; });
      setIndexTimelineData(prev => { let changed = false; const next = { ...prev }; INDEX_KEYS.forEach((key, i) => { if (results[i].status === "fulfilled" && results[i].value) { const newVal = { items: results[i].value!.items, prevClose: results[i].value!.prevClose }; if (prev[key]?.items.length !== newVal.items.length || prev[key]?.items[newVal.items.length - 1]?.time !== newVal.items[newVal.items.length - 1]?.time) { next[key] = newVal; changed = true; } } }); return changed ? next : prev; });
    };

    // Fetch all indices immediately in parallel (no double-fetch for active index)
    fetchAllIndices();

    // Refresh every 30s during trading hours
    const isTradingHours = () => {
      const now = new Date(); const h = (now.getUTCHours() + 8) % 24; const m = now.getUTCMinutes();
      const t = h * 100 + m; const day = now.getUTCDay();
      return day >= 1 && day <= 5 && ((t >= 925 && t <= 1135) || (t >= 1255 && t <= 1505));
    };
    if (isTradingHours()) {
      intervalId = setInterval(() => { if (!document.hidden && isTradingHours()) fetchAllIndices(); }, 30000);
    }
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId); };
  }, []);

  const szIndexRegime = indexRegimes[activeIndexKey];
  const cycleIndexKey = useCallback(() => { setActiveIndexKey(prev => { const idx = INDEX_KEYS.indexOf(prev); return INDEX_KEYS[(idx + 1) % INDEX_KEYS.length]; }); }, []);

  // ── Sector Regime Detection ──
  const [sectorInfoRaw, setSectorInfoRaw] = useState<{ code: string; name: string } | null>(null);
  const [sectorRegimeRaw, setSectorRegimeRaw] = useState<RegimeDetail | null>(null);
  const [sectorTimelineData, setSectorTimelineData] = useState<{ items: TimelineItem[]; prevClose: number }>({ items: [], prevClose: 0 });
  const sectorInfo = isAShareStock ? sectorInfoRaw : null;
  const sectorRegime = isAShareStock ? sectorRegimeRaw : null;
  const sectorFailCountRef = useRef(0);

  useEffect(() => {
    if (!symbol || !isAShareStock) return;
    // Reset fail count when switching stocks — previous failures shouldn't block new stock
    sectorFailCountRef.current = 0;
    let cancelled = false;
    let abortCtrl: AbortController | null = null;
    const fetchSectorData = async () => {
      // If sector failed too many times for THIS stock, stop trying (but allow reset on symbol change)
      if (sectorFailCountRef.current >= 5) return;
      try {
        // Abort previous request if still pending
        if (abortCtrl) abortCtrl.abort();
        abortCtrl = new AbortController();
        const timeoutId = setTimeout(() => abortCtrl?.abort(), 15000); // 15s timeout for chained API calls

        const infoRes = await fetch(`/api/stock/ashare-sector?symbol=${encodeURIComponent(symbol)}&type=full`, { signal: abortCtrl.signal });
        clearTimeout(timeoutId);
        if (!infoRes.ok) { sectorFailCountRef.current++; if (!cancelled) { setSectorInfoRaw(null); setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); } return; }
        const infoData = await infoRes.json();
        if (!infoData.success || !infoData.sectorInfo) { sectorFailCountRef.current++; if (!cancelled) { setSectorInfoRaw(null); setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); } return; }
        const sInfo = infoData.sectorInfo;
        if (cancelled) return;
        sectorFailCountRef.current = 0; // Reset on success
        setSectorInfoRaw({ code: sInfo.code, name: sInfo.name });
        // Relax threshold: show sector chart even with few data points (early morning, inactive sectors)
        if (infoData.data && infoData.data.items && infoData.data.items.length > 0) {
          const sectorPrevClose = infoData.data.prevClose || infoData.data.items[0].price;
          const regime = detectMarketRegimeDetail(infoData.data.items, sectorPrevClose);
          if (!cancelled) { setSectorRegimeRaw(regime); setSectorTimelineData({ items: infoData.data.items, prevClose: sectorPrevClose }); }
        } else { if (!cancelled) { setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); } }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") { sectorFailCountRef.current++; return; }
        console.error("Sector regime fetch error:", e);
        sectorFailCountRef.current++;
        if (!cancelled) { setSectorInfoRaw(null); setSectorRegimeRaw(null); setSectorTimelineData({ items: [], prevClose: 0 }); }
      }
    };
    // Start immediately - no idle callback delay for sector data
    fetchSectorData();
    // Refresh sector data every 30s during trading hours
    const refreshInterval = setInterval(() => {
      if (!cancelled) fetchSectorData();
    }, 30000);
    return () => { cancelled = true; abortCtrl?.abort(); clearInterval(refreshInterval); };
  }, [symbol, isAShareStock]);

  // ── DB Factor Overrides (deferred - not needed for initial render) ──
  const [factorOverrides, setFactorOverrides] = useState<FactorOverride[]>([]);
  useEffect(() => {
    // Fetch factor overrides - low priority but no artificial delay
    const fetchFactors = async () => {
      try { const res = await fetch("/api/stock/strategy"); if (res.ok) { const data = await res.json(); if (data.dbFactors && Array.isArray(data.dbFactors)) startTransition(() => setFactorOverrides(buildFactorOverridesFromDB(data.dbFactors))); } } catch (e) { console.error("Failed to fetch factor overrides:", e); }
    };
    // Start after a short delay to let critical data load first
    const timer = setTimeout(fetchFactors, 300);
    return () => clearTimeout(timer);
  }, []);

  // ── Custom Factors ──
  const [customFactors, setCustomFactors] = useState<CustomFactorDefinition[]>([]);
  useEffect(() => {
    const load = () => { try { const saved = localStorage.getItem(CUSTOM_FACTORS_STORAGE_KEY); if (saved) setCustomFactors(JSON.parse(saved)); else setCustomFactors(BUILT_IN_CUSTOM_FACTORS); } catch { setCustomFactors(BUILT_IN_CUSTOM_FACTORS); } };
    load(); const handler = () => load(); window.addEventListener('custom-factors-changed', handler); return () => window.removeEventListener('custom-factors-changed', handler);
  }, []);

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
  }, [history, quote, interval]);

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
      const newChangePercent = Number(changePercent.toFixed(2));
      // Only update if price or changePercent actually differs
      if (last.price === quote.price && last.changePercent === newChangePercent) return truncated;
      // Mutate-friendly: create minimal new array with only last element changed
      const updated = truncated.slice(0, -1);
      updated.push({ ...last, price: quote.price, changePercent: newChangePercent });
      return updated;
    }
    if (isTradingHours) {
      const changePercent = quote.prevClose > 0 ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : 0;
      return [...truncated, { time: curMin, price: quote.price, avgPrice: quote.price, volume: 0, changePercent: Number(changePercent.toFixed(2)) }];
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

  const timelineMACDData = useMemo(() => {
    // Skip heavy MACD computation when not in timeline mode
    if (!isTimelineActive || timeline.length === 0) return [];
    const now = new Date(); const h = now.getHours(); const m = now.getMinutes();
    const isMorningSession = (h === 9 && m >= 30) || (h === 10) || (h === 11 && m <= 30);
    const isAfternoonSession = (h >= 13 && h < 15) || (h === 15 && m === 0);
    let macdTimeline = timeline;
    if (isMorningSession || isAfternoonSession) { const curMin = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; const lastValidIdx = timeline.reduce((lastIdx: number, d: TimelineItem, i: number) => d.time <= curMin ? i : lastIdx, -1); if (lastValidIdx >= 0 && lastValidIdx < timeline.length - 1) macdTimeline = timeline.slice(0, lastValidIdx + 1); }
    const prices = macdTimeline.map((d) => d.price);
    const macdResult = calculateMACD(prices);
    const result: { time: string; dif: number | null; dea: number | null; macd: number | null }[] = [];
    for (let i = 0; i < macdTimeline.length; i++) { const mr = macdResult[i]; if (isNaN(mr.dif) || isNaN(mr.dea) || isNaN(mr.macd)) result.push({ time: macdTimeline[i].time, dif: null, dea: null, macd: null }); else result.push({ time: macdTimeline[i].time, dif: mr.dif, dea: mr.dea, macd: mr.macd }); }
    return result.filter((d) => d.dif != null);
  }, [timeline, isTimelineActive]);

  const timelineSignals = useMemo(() => {
    // Skip the heaviest computation (~7000 condition evaluations) when not in timeline mode
    if (!isTimelineActive) return [] as (TSignal | null)[];
    return generateTimelineSignals(liveTimeline, timelineMACDData, timelinePrevClose, factorOverrides, szIndexRegime, customFactors, sectorRegime);
  }, [liveTimeline, timelineMACDData, timelinePrevClose, factorOverrides, szIndexRegime, customFactors, sectorRegime, isTimelineActive]);
  // Defer signal rendering so the chart paints first, then signals overlay on next frame
  const deferredTimelineSignals = useDeferredValue(timelineSignals);
  const pvMarkers = useMemo(() => { if (!isTimelineActive || liveTimeline.length < 10 || timelinePrevClose <= 0) return []; return detectPulseVolumeMarkers(liveTimeline, timelinePrevClose); }, [liveTimeline, timelinePrevClose, isTimelineActive]);
  const deferredPvMarkers = useDeferredValue(pvMarkers);
  const latestTimelineSignal = useMemo(() => { for (let i = deferredTimelineSignals.length - 1; i >= 0; i--) { if (deferredTimelineSignals[i]) return deferredTimelineSignals[i]; } return null; }, [deferredTimelineSignals]);

  // ── Signal counts ──
  const signalCounts = useMemo(() => {
    if (!isTimelineActive) return { buyCount: 0, strongBuys: 0, sellCount: 0, strongSells: 0, totalSigs: 0, strongSigs: 0, mediumSigs: 0, weakSigs: 0, confluenceCount: 0, keyLevelCount: 0, vwapSlopeCount: 0, indexRegimeCount: 0 };
    let buyCount = 0, strongBuys = 0, sellCount = 0, strongSells = 0;
    let totalSigs = 0, strongSigs = 0, mediumSigs = 0, weakSigs = 0;
    let confluenceCount = 0, keyLevelCount = 0, vwapSlopeCount = 0, indexRegimeCount = 0;
    for (const s of deferredTimelineSignals) { if (!s) continue; totalSigs++; if (s.type === "buy") { buyCount++; if (s.strength === "strong") strongBuys++; } else if (s.type === "sell") { sellCount++; if (s.strength === "strong") strongSells++; } if (s.strength === "strong") strongSigs++; else if (s.strength === "medium") mediumSigs++; else if (s.strength === "weak") weakSigs++; if (s.description?.includes("共振")) confluenceCount++; if (s.description?.includes("阻力确认") || s.description?.includes("支撑确认")) keyLevelCount++; if (s.description?.includes("均价线拐头")) vwapSlopeCount++; if (s.description?.includes("大盘")) indexRegimeCount++; }
    return { buyCount, strongBuys, sellCount, strongSells, totalSigs, strongSigs, mediumSigs, weakSigs, confluenceCount, keyLevelCount, vwapSlopeCount, indexRegimeCount };
  }, [deferredTimelineSignals, isTimelineActive]);

  // ── Sound / Alert ──
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  useEffect(() => { try { const v = localStorage.getItem("t-sound-enabled"); if (v !== null) queueMicrotask(() => setSoundEnabled(v === "true")); } catch {} }, []);
  const alertedSignalIdsRef = useRef<Set<string>>(new Set());
  const [flashSignal, setFlashSignal] = useState<'buy' | 'sell' | 'stoploss' | null>(null);
  useEffect(() => { try { localStorage.setItem("t-sound-enabled", String(soundEnabled)); } catch {} }, [soundEnabled]);
  useEffect(() => {
    if (!soundEnabled && flashSignal === null) return;
    const newStrongSignals: { type: 'buy' | 'sell' | 'stoploss'; id: string }[] = [];
    for (let i = 0; i < deferredTimelineSignals.length; i++) { const sig = deferredTimelineSignals[i]; if (!sig || sig.strength !== 'strong') continue; const id = `${i}-${sig.type}-${sig.reason}`; if (!alertedSignalIdsRef.current.has(id)) { alertedSignalIdsRef.current.add(id); newStrongSignals.push({ type: sig.type, id }); } }
    if (newStrongSignals.length > 0) { const latest = newStrongSignals[newStrongSignals.length - 1]; if (soundEnabled) playAlertSound(latest.type); setTimeout(() => { setFlashSignal(latest.type); setTimeout(() => setFlashSignal(null), 1200); }, 0); }
  }, [deferredTimelineSignals, soundEnabled]);

  // ── T-Index ──
  const tIndex = useMemo(() => {
    if (!isTimelineActive) return 50;
    let score = 50;
    for (let i = deferredTimelineSignals.length - 1; i >= 0; i--) { const sig = deferredTimelineSignals[i]; if (!sig) continue; if (i < deferredTimelineSignals.length - 5) break; if (sig.type === 'buy') { if (sig.strength === 'strong') score += 15; else if (sig.strength === 'medium') score += 8; else score += 3; } else if (sig.type === 'sell') { if (sig.strength === 'strong') score -= 15; else if (sig.strength === 'medium') score -= 8; else score -= 3; } else if (sig.type === 'stoploss') score -= 20; }
    const regime = szIndexRegime?.regime;
    if (regime === '震荡市') score += 5; else if (regime === '上升通道') score -= 5; else if (regime === '下跌趋势') score -= 10; else if (regime === '横盘末期') score -= 15;
    return Math.max(0, Math.min(100, score));
  }, [deferredTimelineSignals, szIndexRegime, isTimelineActive]);

  // ── Smart Action ──
  const smartAction = useMemo(() => {
    if (!isTimelineActive) return { icon: '⏳', text: '观望等待', reason: 'K线模式下暂无实时信号', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', confidence: 30, type: 'buy' as const };
    const lastTime = liveTimeline[liveTimeline.length - 1]?.time;
    const timeWindow = lastTime ? getTimeWindow(lastTime) : undefined;
    let latestStrong: TSignal | null = null; let strongCount = 0; let mediumCount = 0;
    for (let i = deferredTimelineSignals.length - 1; i >= 0; i--) { const sig = deferredTimelineSignals[i]; if (!sig) continue; if (i < deferredTimelineSignals.length - 10) break; if (sig.strength === 'strong') { strongCount++; if (!latestStrong) latestStrong = sig; } if (sig.strength === 'medium') mediumCount++; }
    const hasStoploss = deferredTimelineSignals.slice(-10).some(s => s?.type === 'stoploss');
    if (hasStoploss) return { icon: '⚡', text: '紧急止损', reason: '触发止损信号，建议立即平仓', color: 'text-amber-500', bgColor: 'bg-amber-500/10 border-amber-500/25', confidence: 95, type: 'stoploss' as const };
    if (latestStrong?.type === 'buy' && latestStrong.strength === 'strong') { const isBuyWindow = timeWindow?.includes('买入') || timeWindow?.includes('低吸'); return { icon: '🟢', text: isBuyWindow ? '建议正T买回' : '建议买入', reason: `强买入信号(${latestStrong.reason})${isBuyWindow ? '，处于买入时段' : ''}`, color: 'text-green-500', bgColor: 'bg-green-500/10 border-green-500/25', confidence: 80 + strongCount * 5, type: 'buy' as const }; }
    if (latestStrong?.type === 'sell' && latestStrong.strength === 'strong') { const isSellWindow = timeWindow?.includes('卖出') || timeWindow?.includes('冲高'); return { icon: '🔴', text: isSellWindow ? '建议正T卖出' : '建议卖出', reason: `强卖出信号(${latestStrong.reason})${isSellWindow ? '，处于卖出时段' : ''}`, color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/25', confidence: 80 + strongCount * 5, type: 'sell' as const }; }
    if (mediumCount > 0 && strongCount === 0) { const mediumSig = (() => { for (let i = deferredTimelineSignals.length - 1; i >= 0; i--) { if (deferredTimelineSignals[i]?.strength === 'medium') return deferredTimelineSignals[i]; } return null; })(); return { icon: '📊', text: '等待确认', reason: `${mediumSig?.type === 'buy' ? '买入' : '卖出'}信号强度中等(${mediumSig?.reason})，等待加强确认`, color: 'text-orange-500', bgColor: 'bg-orange-500/10 border-orange-500/25', confidence: 50 + mediumCount * 10, type: (mediumSig?.type || 'buy') as 'buy' | 'sell' }; }
    return { icon: '⏳', text: '观望等待', reason: tIndex <= 50 ? '做T指数偏低，暂无明显操作机会' : '暂无有效信号，继续观察', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', confidence: 30, type: 'buy' as const };
  }, [deferredTimelineSignals, liveTimeline, tIndex, isTimelineActive]);

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
                    {mode === "limit-up" && <><TrendingUp className="w-3 h-3" />涨停</>}
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
                  <span className={`text-3xl font-bold tabular-nums ${priceColor}`}>{formatNum(quote.price)}</span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${priceColor}`}>{isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}{formatNum(Math.abs(quote.change))}({formatNum(Math.abs(quote.changePercent))}%)</span>
                </div>
                {(isTimelineActive ? latestTimelineSignal : (latestSignal && latestSignal.type !== "hold" ? latestSignal : null)) && (
                  <Badge variant={(isTimelineActive ? latestTimelineSignal!.type : latestSignal!.type) === "buy" ? "default" : "destructive"} className="text-xs px-3 py-1">
                    {((isTimelineActive ? latestTimelineSignal!.type : latestSignal!.type) === "buy" ? "🟢 买入信号" : "🔴 卖出信号")} · {(isTimelineActive ? latestTimelineSignal!.reason : latestSignal!.reason)}
                  </Badge>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm ml-auto">
                  <div><span className="text-muted-foreground">开盘</span> <span className="font-mono">{formatNum(quote.open)}</span></div>
                  <div><span className="text-muted-foreground">最高</span> <span className="font-mono text-red-500">{formatNum(quote.high)}</span></div>
                  <div><span className="text-muted-foreground">最低</span> <span className="font-mono text-green-500">{formatNum(quote.low)}</span></div>
                  <div><span className="text-muted-foreground">昨收</span> <span className="font-mono">{formatNum(quote.prevClose)}</span></div>
                  <div><span className="text-muted-foreground">成交量</span> <span className="font-mono">{formatVolume(quote.volume)}</span></div>
                  {quote.turnover != null && quote.turnover > 0 && <div><span className="text-muted-foreground">换手</span> <span className="font-mono">{quote.turnover.toFixed(2)}%</span></div>}
                  {quote.peRatio > 0 && <div><span className="text-muted-foreground">PE</span> <span className="font-mono">{formatNum(quote.peRatio)}</span></div>}
                  {quote.marketCap > 0 && <div><span className="text-muted-foreground">市值</span> <span className="font-mono">{formatMarketCap(quote.marketCap)}</span></div>}
                </div>
              </div>
            ) : (<div className="text-muted-foreground text-sm">选择或搜索A股开始分析</div>)}
          </CardContent>
        </Card>

        {/* T-Index & Smart Action Panel (only in timeline modes) */}
        {quote && isTimelineActive && liveTimeline.length > 0 && (
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="border overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <svg width="72" height="72" viewBox="0 0 72 72">
                      <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="6" strokeDasharray={`${Math.PI * 30}`} strokeDashoffset="0" transform="rotate(-90 36 36)" strokeLinecap="round" />
                      <circle cx="36" cy="36" r="30" fill="none" stroke={getTIndexColor(tIndex)} strokeWidth="6" strokeDasharray={`${(tIndex / 100) * Math.PI * 30} ${Math.PI * 30}`} strokeDashoffset="0" transform="rotate(-90 36 36)" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center"><span className="text-xl font-bold tabular-nums" style={{ color: getTIndexColor(tIndex) }}>{tIndex}</span></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">做T指数</div>
                    <div className={`text-base font-bold ${getTIndexLabelColor(tIndex)}`}>{getTIndexLabel(tIndex)}</div>
                    <div className="mt-2 h-2 w-full bg-muted/30 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${tIndex}%`, backgroundColor: getTIndexColor(tIndex) }} /></div>
                    <div className="flex justify-between mt-1 text-[9px] text-muted-foreground"><span>卖出</span><span>观望</span><span>做T</span><span>优质</span></div>
                  </div>
                  {latestTimelineSignal?.strength === 'strong' && (
                    <div className="animate-signal-pulse shrink-0"><Volume2 className="h-5 w-5" style={{ color: latestTimelineSignal.type === 'buy' ? '#22c55e' : latestTimelineSignal.type === 'stoploss' ? '#f59e0b' : '#ef4444' }} /></div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className={`border overflow-hidden ${smartAction.bgColor}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">智能操作建议</div>
                    <div className={`text-lg font-bold ${smartAction.color}`}>{smartAction.icon} {smartAction.text}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{smartAction.reason}</div>
                    {(() => { const lastTime = liveTimeline[liveTimeline.length - 1]?.time; const tw = lastTime ? getTimeWindow(lastTime) : null; if (!tw) return null; const twColor = tw === '开盘观察' || tw === '尾盘不操作' ? 'text-muted-foreground bg-muted/50' : tw.includes('卖出') ? 'text-red-600 bg-red-500/10' : 'text-green-600 bg-green-500/10'; return <Badge variant="outline" className={`text-[10px] h-5 mt-2 ${twColor}`}><Clock className="h-2.5 w-2.5 mr-0.5" />{tw}</Badge>; })()}
                    {newsData && (newsData.market || newsData.sector || newsData.stock) && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {(["market", "sector", "stock"] as const).map((tab) => { const d = newsData[tab]; if (!d?.analysis) return null; const a = d.analysis; const labels = { market: "大盘", sector: d.sectorName ? `${d.sectorName}` : "板块", stock: quote?.name || "个股" }; const trendColors: Record<string, string> = { "上升": "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", "下降": "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", "震荡": "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20" }; const sentimentIcons: Record<string, string> = { "偏多": "🔺", "偏空": "🔻", "中性": "↔️" }; const tc = trendColors[a.trend] || trendColors["震荡"]; const si = sentimentIcons[a.newsSentiment] || "↔️"; return <span key={tab} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${tc}`}>{labels[tab]}: {a.trend} {si}</span>; })}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 w-16 text-center">
                    <div className="text-[10px] text-muted-foreground mb-1">信心度</div>
                    <div className="text-sm font-bold tabular-nums" style={{ color: smartAction.confidence >= 80 ? '#22c55e' : smartAction.confidence >= 50 ? '#f59e0b' : '#9ca3af' }}>{Math.min(smartAction.confidence, 100)}%</div>
                    <div className="mt-1 h-1.5 w-full bg-muted/30 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(smartAction.confidence, 100)}%`, backgroundColor: smartAction.confidence >= 80 ? '#22c55e' : smartAction.confidence >= 50 ? '#f59e0b' : '#9ca3af' }} /></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Chart Mode & Interval Selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {isAShareStock && (<Tabs value={chartMode} onValueChange={(v) => changeChartMode(v as ChartMode)}><TabsList className="h-8"><TabsTrigger value="5d-timeline" className="text-xs px-2 h-6"><CalendarDays className="h-3.5 w-3.5 mr-1" />五日</TabsTrigger><TabsTrigger value="timeline" className="text-xs px-3 h-6"><LineChart className="h-3.5 w-3.5 mr-1" />分时</TabsTrigger><TabsTrigger value="kline" className="text-xs px-3 h-6"><CandlestickChart className="h-3.5 w-3.5 mr-1" />K线</TabsTrigger></TabsList></Tabs>)}
          <Button variant={showNewsAnalysis ? "default" : "outline"} size="sm" className="h-8 text-xs px-3" onClick={() => { const next = !showNewsAnalysis; setShowNewsAnalysis(next); if (next && !newsData.market) (window as any).__newsFetchAnalysis?.(); }}><Newspaper className="h-3.5 w-3.5 mr-1" />资讯分析</Button>
          {chartMode === "kline" && (<div className="flex items-center gap-1">{INTERVALS.map((intv) => (<Button key={intv.value} variant={interval === intv.value ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => changeInterval(intv.value)}>{intv.label}</Button>))}</div>)}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {(() => { const lastTl = liveTimeline[liveTimeline.length - 1]; if (lastTl && lastTl.avgPrice && lastTl.avgPrice > 0) { const deviation = ((lastTl.price - lastTl.avgPrice) / lastTl.avgPrice) * 100; const isAbove = deviation >= 0; return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${isAbove ? "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400" : "bg-green-500/10 border-green-500/25 text-green-600 dark:text-green-400"}`} title={`价格 ${lastTl.price.toFixed(2)} 相对均价 ${lastTl.avgPrice.toFixed(2)} 偏离 ${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}%`}><span className="opacity-70">{isAbove ? "↑均线上方" : "↓均线下方"}</span><span className="font-mono">{deviation >= 0 ? "+" : ""}{deviation.toFixed(2)}%</span></span>; } return null; })()}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSoundEnabled(prev => !prev)} title={soundEnabled ? '关闭声音提醒' : '开启声音提醒'}>{soundEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}</Button>
            <Clock className="h-3 w-3" />实时刷新 3s
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
            <TimeSharingPanel data={liveTimeline} prevClose={timelinePrevClose} symbol={symbol} signals={deferredTimelineSignals} macdData={timelineMACDData} visibleMinutes={tlVisibleMinutes} onZoomIn={tlZoomIn} onZoomOut={tlZoomOut} onZoomReset={tlZoomReset} zoomIdx={tlZoomIdx} maxZoomIdx={TL_ZOOM_LEVELS.length - 1} prevDayMA5={prevDayMA5} szIndexRegime={szIndexRegime} activeIndexKey={activeIndexKey} indexConfig={INDEX_CONFIG} onCycleIndex={cycleIndexKey} keyPriceLevels={keyPriceLevels} panOffset={tlPanOffset} onPanOffsetChange={setTlPanOffset} sectorRegime={sectorRegime} sectorInfo={sectorInfo} pvMarkers={deferredPvMarkers} />
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
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TSuitabilityScore symbol={symbol} quote={quote} liveTimeline={liveTimeline} sectorRegime={sectorRegime} szIndexRegime={szIndexRegime} />
            <RiskAlertPanel symbol={symbol} quote={quote} liveTimeline={liveTimeline} sectorRegime={sectorRegime} szIndexRegime={szIndexRegime} signalCounts={signalCounts} />
          </div>
        )}

        {/* Market Index & Sector Overview */}
        {chartMode === "timeline" && liveTimeline.length > 0 && (() => {
          const szData = indexTimelineData[activeIndexKey]; const idxInfo = INDEX_CONFIG[activeIndexKey];
          const hasIdxData = szData && szData.items.length > 0; const hasSectorData = sectorTimelineData.items.length > 0 && sectorInfo;
          const regimeBadge = (regime: RegimeDetail | null) => { if (!regime) return null; const cfg = REGIME_CONFIG[regime.regime] || REGIME_CONFIG["震荡市"]; return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}><span>{cfg.icon}</span><span>{regime.regime}</span></span>; };
          if (!hasIdxData && !hasSectorData) return null;
          return (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2"><GitBranch className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium text-foreground">大盘 & 板块走势</span><span className="text-[10px] text-muted-foreground">— 与个股联动参考</span></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hasIdxData && <MiniTimelinePanel title={idxInfo?.label || "深证成指"} data={szData.items} prevClose={szData.prevClose} badge={<div className="flex items-center gap-1 ml-auto">{regimeBadge(szIndexRegime)}<span className="text-[8px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none" onClick={cycleIndexKey} title="点击切换指数">切换</span></div>} />}
                {hasSectorData && <MiniTimelinePanel title={`${sectorInfo.name}板块`} data={sectorTimelineData.items} prevClose={sectorTimelineData.prevClose} badge={<div className="ml-auto">{regimeBadge(sectorRegime)}</div>} />}
              </div>
            </div>
          );
        })()}

        {/* T-Trading Signals Summary */}
        {(chartData.length > 0 || (chartMode === "timeline" && liveTimeline.length > 0)) && (
          <SignalSummaryPanel chartMode={chartMode} chartData={chartData} liveTimeline={liveTimeline} timeline={timeline} timelineSignals={deferredTimelineSignals.slice(-60)} latestTimelineSignal={latestTimelineSignal} latestSignal={latestSignal} signalCounts={signalCounts} pvMarkers={deferredPvMarkers} />
        )}

        {/* T-Trade Journal — only in timeline mode */}
        {chartMode === "timeline" && liveTimeline.length > 0 && (
          <TTradeJournal symbol={symbol} stockName={quote?.name} currentPrice={quote?.price} />
        )}

        {/* News Analysis Panel */}
        <NewsAnalysisPanel symbol={symbol} stockName={quote?.name} isAShare={isAShareStock} quote={quote} sectorInfo={sectorInfo} newsData={newsData} setNewsData={setNewsData} newsLoading={newsLoading} setNewsLoading={setNewsLoading} showNewsAnalysis={showNewsAnalysis} setShowNewsAnalysis={setShowNewsAnalysis} />

        {/* Strategy Admin Panel */}
        <StrategyAdminPanel onFactorsChanged={(factors) => setFactorOverrides(buildFactorOverridesFromDB(factors))} />

        {/* Trading Rules Card */}
        <Card className="border-border/50 shadow-sm mb-4">
          <CardHeader className="pb-2">
            <button
              onClick={() => setRulesExpanded(!rulesExpanded)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-500" />
                交易规矩
                {autoExpanded && <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/25 animate-pulse">🔔 开盘提醒</Badge>}
              </CardTitle>
              {rulesExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {rulesExpanded && (
            <CardContent className="pt-0 space-y-3">
              {/* ── 做T自检三问 ── */}
              <div className="p-3 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/8 to-orange-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-base">🎯</span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">做T前必问三件事（3秒快速自检）</span>
                </div>
                <div className="text-[11px] leading-relaxed space-y-1.5">
                  <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-red-500/15 text-red-600 border border-red-500/25 shrink-0">1</span>
                    <div>
                      <span className="text-foreground font-medium">大盘安全吗？</span>
                      <span className="text-muted-foreground ml-1">深证红盘✅ → 可做T；深证暴跌🚫 → 空仓</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-orange-500/15 text-orange-600 border border-orange-500/25 shrink-0">2</span>
                    <div>
                      <span className="text-foreground font-medium">方向对了吗？</span>
                      <span className="text-muted-foreground ml-1">三跌偏反T(先卖再买)，三涨偏正T，方向错=白做</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-green-500/15 text-green-600 border border-green-500/25 shrink-0">3</span>
                    <div>
                      <span className="text-foreground font-medium">仓位控住了吗？</span>
                      <span className="text-muted-foreground ml-1">1万资金：三跌≤2500，双跌≤3300，三涨≤4000</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 一、仓位阶梯 ── */}
              <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300">一、仓位阶梯（大盘×板块×个股 三维决策）</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
                  <p className="text-foreground font-medium mb-1.5">以深证成指为大盘方向，按三维度共振数定仓位等级：</p>
                  {/* 阶梯可视化 */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 p-2 rounded-md border border-red-500/30 bg-red-500/10">
                      <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-red-500/20 text-red-600 border border-red-500/30 shrink-0">≤1/4</span>
                      <div className="flex-1">
                        <span className="text-red-600 dark:text-red-400 font-bold text-xs">🚫 一级·极度危险</span>
                        <span className="text-red-500/70 text-[10px] ml-1">深证↓+板块↓+个股↓（三跌）</span>
                      </div>
                      <span className="text-[10px] text-red-500/60 shrink-0">25%</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-md border border-orange-500/25 bg-orange-500/8">
                      <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-orange-500/15 text-orange-600 border border-orange-500/25 shrink-0">≤1/3</span>
                      <div className="flex-1">
                        <span className="text-orange-600 dark:text-orange-400 font-bold text-xs">⛔ 二级·高危</span>
                        <span className="text-orange-500/70 text-[10px] ml-1">任意两维度下跌（双跌）</span>
                      </div>
                      <span className="text-[10px] text-orange-500/60 shrink-0">33%</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-md border border-yellow-500/20 bg-yellow-500/5">
                      <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 shrink-0">20%</span>
                      <div className="flex-1">
                        <span className="text-yellow-600 dark:text-yellow-400 font-bold text-xs">🔸 三级·谨慎</span>
                        <span className="text-yellow-500/70 text-[10px] ml-1">单维度弱势+另一维度震荡</span>
                      </div>
                      <span className="text-[10px] text-yellow-500/60 shrink-0">20-25%</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-md border border-blue-500/20 bg-blue-500/5">
                      <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0">30%</span>
                      <div className="flex-1">
                        <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">🔹 四级·积极</span>
                        <span className="text-blue-500/70 text-[10px] ml-1">至少两维度上涨+一维度震荡</span>
                      </div>
                      <span className="text-[10px] text-blue-500/60 shrink-0">25-35%</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-md border border-green-500/25 bg-green-500/8">
                      <span className="inline-flex items-center justify-center w-8 h-7 rounded text-[10px] font-bold bg-green-500/15 text-green-600 border border-green-500/25 shrink-0">40%</span>
                      <div className="flex-1">
                        <span className="text-green-600 dark:text-green-400 font-bold text-xs">✅ 五级·最安全</span>
                        <span className="text-green-500/70 text-[10px] ml-1">深证↑+板块↑+个股↑（三涨）</span>
                      </div>
                      <span className="text-[10px] text-green-500/60 shrink-0">30-40%</span>
                    </div>
                  </div>
                  <div className="mt-1.5 p-1.5 rounded border border-orange-500/10 bg-orange-500/5">
                    <p className="text-orange-600 dark:text-orange-400 font-medium text-[10px]">💡 记忆口诀：三跌1/4、双跌1/3、单弱2成、双强3成、三涨4成</p>
                  </div>
                </div>
              </div>

              {/* ── 二、做T策略选择 ── */}
              <div className="p-3 rounded-lg border border-violet-500/20 bg-violet-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3.5 h-3.5 text-violet-500" />
                  <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">二、做T策略选择（正T vs 反T(先卖再买)）</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="p-2 rounded-md border border-green-500/15 bg-green-500/5">
                      <p className="text-green-600 dark:text-green-400 font-bold text-xs mb-1.5">🟢 正T（先买后卖）</p>
                      <p className="text-foreground font-medium mb-1">适用场景：预期股价先跌后涨</p>
                      <div className="space-y-0.5 text-[11px]">
                        <p>• 大盘↑+板块↑+个股↓ → 低吸良机</p>
                        <p>• 大盘震荡+板块↑+个股↓ → 板块保护下低吸</p>
                        <p>• 适合盘中低吸后反弹卖出，当天完成闭环</p>
                        <p>• 量能配合：缩量下跌→放量反弹</p>
                      </div>
                    </div>
                    <div className="p-2 rounded-md border border-red-500/15 bg-red-500/5">
                      <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1.5">🔴 反T(先卖再买)</p>
                      <p className="text-foreground font-medium mb-1">适用场景：预期股价先涨后跌</p>
                      <div className="space-y-0.5 text-[11px]">
                        <p>• 大盘↓+板块↓+个股↑ → 冲高减仓</p>
                        <p>• 大盘↓+板块震荡+个股↑ → 大盘压制下卖出</p>
                        <p>• 适合早盘冲高卖出、盘中回落买回，当天完成闭环</p>
                        <p>• 量能配合：缩量反弹→放量下跌</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-1.5 rounded border border-violet-500/10 bg-violet-500/5">
                    <p className="text-violet-600 dark:text-violet-400 font-medium text-[10px]">⚡ 核心原则：顺势做T！大盘涨时偏正T，大盘跌时偏反T(先卖再买)。三跌时严禁正T（不抄底），三涨时严禁反T(先卖再买)（不卖飞）。</p>
                  </div>
                </div>
              </div>

              {/* ── 三、时间窗口规矩 ── */}
              <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-cyan-500" />
                  <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">三、时间窗口规矩</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
                  <div className="grid grid-cols-1 gap-1.5">
                    <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5">
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold text-[10px] shrink-0 w-24">9:30-10:00</span>
                      <div>
                        <span className="text-foreground font-medium">早盘观察期</span>
                        <span className="text-amber-500 text-[10px] ml-1">⚠ 仓位减半</span>
                        <p>开盘波动剧烈，方向不明。按仓位表×50%执行，不追涨不抄底。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5">
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold text-[10px] shrink-0 w-24">10:00-11:30</span>
                      <div>
                        <span className="text-foreground font-medium">上午操作期</span>
                        <span className="text-green-500 text-[10px] ml-1">✅ 按仓位表执行</span>
                        <p>趋势基本确立，可按仓位阶梯正常做T。重点关注大盘+板块方向确认。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5">
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold text-[10px] shrink-0 w-24">13:00-14:00</span>
                      <div>
                        <span className="text-foreground font-medium">午盘确认期</span>
                        <span className="text-yellow-500 text-[10px] ml-1">🔸 观察方向</span>
                        <p>午后方向可能与上午相反。若大盘午后翻绿，上午仓位立即缩减。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-cyan-500/10 bg-cyan-500/5">
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold text-[10px] shrink-0 w-24">14:00-14:30</span>
                      <div>
                        <span className="text-foreground font-medium">尾盘决策期</span>
                        <span className="text-orange-500 text-[10px] ml-1">⚠ 准备清仓</span>
                        <p>做T仓位必须在此区间完成平仓。大盘弱势时14:00即开始减仓。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                      <span className="text-red-600 dark:text-red-400 font-bold text-[10px] shrink-0 w-24">14:30-15:00</span>
                      <div>
                        <span className="text-foreground font-medium">收盘冲刺期</span>
                        <span className="text-red-500 text-[10px] ml-1">🚫 必须完成闭环</span>
                        <p>任何做T仓位必须在收盘前完成买卖闭环！严禁隔夜。尾盘拉升不追。</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 四、止损止盈规矩 ── */}
              <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">四、止损止盈规矩</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="p-2 rounded-md border border-red-500/15 bg-red-500/5">
                      <p className="text-red-600 dark:text-red-400 font-bold text-xs mb-1">🛑 止损规矩</p>
                      <div className="space-y-1 text-[11px]">
                        <p>• <span className="text-foreground font-medium">单笔止损 -2%</span>：1万本金做T亏200元，无条件止损</p>
                        <p>• <span className="text-foreground font-medium">时间止损</span>：持仓超2小时未盈利，择机平仓</p>
                        <p>• <span className="text-foreground font-medium">信号止损</span>：出现强卖出信号，立即平仓</p>
                        <p>• <span className="text-foreground font-medium">大盘止损</span>：深证翻绿，所有做T仓位减半</p>
                        <p>• <span className="text-foreground font-medium">日亏损上限</span>：当日累计亏损达本金0.5%（1万亏50），停止当日所有做T</p>
                      </div>
                    </div>
                    <div className="p-2 rounded-md border border-green-500/15 bg-green-500/5">
                      <p className="text-green-600 dark:text-green-400 font-bold text-xs mb-1">💰 止盈规矩</p>
                      <div className="space-y-1 text-[11px]">
                        <p>• <span className="text-foreground font-medium">首目标 +1.5%</span>：3000 T仓赚45元，先卖一半锁定利润</p>
                        <p>• <span className="text-foreground font-medium">二目标 +3%</span>：3000 T仓赚90元，全部卖出落袋</p>
                        <p>• <span className="text-foreground font-medium">冲高回落</span>：从最高点回落0.5%即卖出，宁可少赚不可倒亏</p>
                        <p>• <span className="text-foreground font-medium">大盘翻绿</span>：不管盈亏立即卖出，不抱幻想</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-1.5 rounded border border-rose-500/10 bg-rose-500/5">
                    <p className="text-rose-600 dark:text-rose-400 font-medium text-[10px]">⚠ 铁律：止损永远优先于止盈！做T亏1%是成本，亏5%是灾难。宁可少赚不可多亏。</p>
                  </div>
                </div>
              </div>

              {/* ── 五、量能确认规矩 ── */}
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">五、量能确认规矩</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
                  <div className="grid grid-cols-1 gap-1.5">
                    <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                      <span className="text-amber-500 text-xs shrink-0">📊</span>
                      <div>
                        <span className="text-foreground font-medium">缩量下跌 → 不急于买入</span>
                        <p>缩量说明卖盘不活跃，但也说明买盘不积极。等放量企稳再参与。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                      <span className="text-amber-500 text-xs shrink-0">📈</span>
                      <div>
                        <span className="text-foreground font-medium">放量上涨 → 确认强势，可加仓</span>
                        <p>量价齐升是最健康的走势，可在回调时按仓位表上限操作。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                      <span className="text-amber-500 text-xs shrink-0">⚡</span>
                      <div>
                        <span className="text-foreground font-medium">脉冲放量 → 关注异动，谨慎追入</span>
                        <p>突然放量可能是主力试盘或诱多。观察5分钟内是否持续，不追脉冲量。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                      <span className="text-amber-500 text-xs shrink-0">📉</span>
                      <div>
                        <span className="text-foreground font-medium">放量下跌 → 最危险，规避</span>
                        <p>放量下跌说明抛压沉重，即使有买入信号也要降一个仓位等级。</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-1.5 rounded border border-amber-500/10 bg-amber-500/5">
                    <p className="text-amber-600 dark:text-amber-400 font-medium text-[10px]">💡 量能是价格方向的确认器：无量上涨不可信，放量下跌要远离。</p>
                  </div>
                </div>
              </div>

              {/* ── 六、大盘影响说明 ── */}
              <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">六、大盘（深证成指）仓位调节器</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                  <p className="text-foreground font-medium">大盘方向是仓位"调节器"，在阶梯基础上微调：</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="p-2 rounded border border-red-500/15 bg-red-500/5">
                      <p className="text-red-600 dark:text-red-400 font-medium text-[11px] mb-1">🔻 深证下跌：全面收紧</p>
                      <div className="space-y-0.5 text-[11px]">
                        <p>• 三跌场景 → 降至1/4（最低级）</p>
                        <p>• 双跌场景 → 不超1/3</p>
                        <p>• 逆势走强 → 上限降低5-10%</p>
                        <p>• 暴跌(&gt;2%) → 空仓，不参与</p>
                      </div>
                    </div>
                    <div className="p-2 rounded border border-green-500/15 bg-green-500/5">
                      <p className="text-green-600 dark:text-green-400 font-medium text-[11px] mb-1">🔺 深证上涨：适度放宽</p>
                      <div className="space-y-0.5 text-[11px]">
                        <p>• 三涨场景 → 可达30-40%</p>
                        <p>• 双涨场景 → 上限提升5%</p>
                        <p>• 个股回调 → 低吸好时机</p>
                        <p>• 翻红信号 → 仓位可提升一级</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 p-1.5 rounded border border-orange-500/10 bg-orange-500/5">
                    <p className="text-orange-600 dark:text-orange-400 font-medium text-[10px]">为什么选深证成指？覆盖深市中小盘和成长股，比上证50灵敏，比创业板指稳定，跌破关键支撑=市场整体走弱。</p>
                  </div>
                </div>
              </div>

              {/* ── 七、仓位速查表 ── */}
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Scale className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">七、仓位速查表</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-amber-500/10">
                        <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">深证</th>
                        <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">板块</th>
                        <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">个股</th>
                        <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">建议仓位</th>
                        <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">做T方向</th>
                        <th className="text-left py-1.5 px-2 text-amber-600 dark:text-amber-400 font-semibold">说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/30 bg-red-500/10">
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-bold">≤1/4</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">反T(先卖再买)/空仓</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-600 dark:text-red-400 font-medium">三跌！最危险</span></td>
                      </tr>
                      <tr className="border-b border-border/30 bg-red-500/5">
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-orange-500 font-bold">≤1/3</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">反T(先卖再买)冲高卖</span></td>
                        <td className="py-1.5 px-2">逆势走强，大环境差</td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2 font-medium">15-20%</td>
                        <td className="py-1.5 px-2"><span className="text-yellow-600 font-medium">轻仓正T</span></td>
                        <td className="py-1.5 px-2">大盘拖累，板块独木难支</td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2 font-medium">20-30%</td>
                        <td className="py-1.5 px-2"><span className="text-yellow-600 font-medium">反T(先卖再买)冲高卖</span></td>
                        <td className="py-1.5 px-2">逆势板块，大盘压制</td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-orange-500 font-bold">≤1/3</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-600 font-medium">正T低吸</span></td>
                        <td className="py-1.5 px-2">大盘好但板块差</td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2 font-medium">25-30%</td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">反T(先卖再买)冲高卖</span></td>
                        <td className="py-1.5 px-2">大盘支撑，个股逆板块</td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-500 font-medium">↓ 跌</span></td>
                        <td className="py-1.5 px-2 font-medium">25-30%</td>
                        <td className="py-1.5 px-2"><span className="text-green-600 font-medium">正T低吸</span></td>
                        <td className="py-1.5 px-2">大盘+板块支撑</td>
                      </tr>
                      <tr className="border-b border-border/30 bg-green-500/8">
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2"><span className="text-red-500 font-medium">↑ 涨</span></td>
                        <td className="py-1.5 px-2 font-bold text-green-600">30-40%</td>
                        <td className="py-1.5 px-2"><span className="text-green-600 font-medium">正T/反T(先卖再买)均可</span></td>
                        <td className="py-1.5 px-2"><span className="text-green-600 dark:text-green-400 font-medium">三涨！最安全</span></td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td>
                        <td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td>
                        <td className="py-1.5 px-2"><span className="text-gray-400">— 盘</span></td>
                        <td className="py-1.5 px-2 font-medium">15-25%</td>
                        <td className="py-1.5 px-2"><span className="text-gray-400 font-medium">观望</span></td>
                        <td className="py-1.5 px-2">方向不明，轻仓试探</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 八、禁忌规矩 ── */}
              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">八、禁忌规矩（绝对不可违反）</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">1</span>
                    <div>
                      <span className="text-foreground font-medium">深证成指暴跌（跌幅 &gt; 2%）→ 空仓，不参与任何做T</span>
                      <p>系统性风险下技术分析失效，80%以上个股跟跌。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">2</span>
                    <div>
                      <span className="text-foreground font-medium">做T必须当天完成买卖，严禁隔夜</span>
                      <p>做T是日内波动差价，隔夜=投机。大盘弱势时尤其不能隔夜。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">3</span>
                    <div>
                      <span className="text-foreground font-medium">单只股票仓位不超过总资金的40%</span>
                      <p>无论信号多强，单一标的风险过于集中。大盘下跌时降至25%以下。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">4</span>
                    <div>
                      <span className="text-foreground font-medium">ST股、退市风险股不参与</span>
                      <p>基本面风险无法通过技术分析化解。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">5</span>
                    <div>
                      <span className="text-foreground font-medium">亏损后加仓翻本 → 绝对禁止</span>
                      <p>做T亏损后越买越多是最大的坑。亏损说明判断有误，应减仓而非加仓。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 shrink-0 mt-0.5">6</span>
                    <div>
                      <span className="text-foreground font-medium">跌停板股票不参与做T</span>
                      <p>跌停=流动性枯竭，无法卖出完成做T闭环。涨停同理，买入后可能无法卖出。</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 九、动态调节规矩 ── */}
              <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">九、动态调节规矩（根据盘面实时调整）</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
                  <div className="grid grid-cols-1 gap-1.5">
                    <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                      <span className="text-red-500 text-xs shrink-0">🔻</span>
                      <div>
                        <span className="text-foreground font-medium">深证连续3天下跌 → 仓位上限减半</span>
                        <p>市场信心崩塌，即使有个股信号也极度谨慎。原1/3→1/6，原30%→15%。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-green-500/10 bg-green-500/5">
                      <span className="text-green-500 text-xs shrink-0">🔺</span>
                      <div>
                        <span className="text-foreground font-medium">深证翻红（跌→涨）→ 加仓信号</span>
                        <p>大盘由弱转强，保守仓位→正常仓位。1/4→1/3，20%→30%。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-red-500/10 bg-red-500/5">
                      <span className="text-red-500 text-xs shrink-0">⛔</span>
                      <div>
                        <span className="text-foreground font-medium">板块暴跌 + 大盘下跌 → 清仓观望</span>
                        <p>行业级利空+系统性风险，个股上涨只是暂时抗跌。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                      <span className="text-amber-500 text-xs shrink-0">📉</span>
                      <div>
                        <span className="text-foreground font-medium">放量下跌 → 仓位降一级</span>
                        <p>抛压沉重时，所有仓位建议下调一个等级。如原30%→20%。</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-1.5 rounded border border-amber-500/10">
                      <span className="text-amber-500 text-xs shrink-0">🔄</span>
                      <div>
                        <span className="text-foreground font-medium">连续2次做T亏损 → 当天停止交易</span>
                        <p>市场节奏与判断不一致，停下来观察。大盘下跌时1次亏损即停。</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 十、实战案例 ── */}
              <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Info className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">十、实战案例</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                  <div className="p-2 rounded-md border border-red-500/10 bg-red-500/5">
                    <p className="text-red-600 dark:text-red-400 font-medium mb-1">场景1（三跌）：深证跌1.8% + 半导体跌1.5% + 个股跌2.3%</p>
                    <div className="space-y-0.5">
                      <p>→ <span className="text-red-500 font-bold">一级·≤1/4仓</span>，策略：<span className="text-red-500 font-medium">反T(先卖再买)冲高卖</span>，1万资金最多用2500</p>
                      <p>• 买入2.5万，跌3%亏750元（总0.75%）→ 可控</p>
                      <p>• 满仓1万，跌3%亏300元（总3%）→ 不可接受</p>
                      <p>• 若个股冲高翻红，反T(先卖再买)卖出后不买回</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-md border border-green-500/10 bg-green-500/5">
                    <p className="text-green-600 dark:text-green-400 font-medium mb-1">场景2（三涨）：深证涨1.2% + 半导体涨0.8% + 个股涨1.5%</p>
                    <div className="space-y-0.5">
                      <p>→ <span className="text-green-500 font-bold">五级·30-40%仓</span>，策略：<span className="text-green-500 font-medium">正T/反T(先卖再买)均可</span>，1万资金可用3000-4000</p>
                      <p>• 正T：回调时买入3万，反弹1.5%赚450元</p>
                      <p>• 反T(先卖再买)：冲高卖出3万，回落买回赚差价</p>
                      <p>• 但大盘突然翻绿 → 立即降仓至1/3以下</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-md border border-yellow-500/10 bg-yellow-500/5">
                    <p className="text-yellow-600 dark:text-yellow-400 font-medium mb-1">场景3（双跌+大盘涨）：深证涨0.8% + 半导体跌1.5% + 个股跌2.3%</p>
                    <div className="space-y-0.5">
                      <p>→ <span className="text-orange-500 font-bold">二级·≤1/3仓</span>，策略：<span className="text-green-600 font-medium">正T低吸</span></p>
                      <p>• 大盘有支撑但板块弱，仓位≤3.3万</p>
                      <p>• 等个股止跌企稳后买入，冲高即卖</p>
                      <p>• 若板块转涨 → 可提升至25-30%</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-md border border-emerald-500/10 bg-emerald-500/5">
                    <p className="text-emerald-600 dark:text-emerald-400 font-medium mb-1">场景4（大盘弱+板块个股强）：深证跌0.5% + 半导体涨1.2% + 个股涨2.3%</p>
                    <div className="space-y-0.5">
                      <p>→ <span className="text-yellow-500 font-bold">三级·20-30%仓</span>，策略：<span className="text-red-500 font-medium">反T(先卖再买)冲高卖</span></p>
                      <p>• 板块和个股逆大盘走强，有独立行情</p>
                      <p>• 但大盘压制下需控仓，冲高先卖后买回</p>
                      <p>• 若大盘转涨 → 提升至30-40%；板块转跌 → 降至1/4</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        </>
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
