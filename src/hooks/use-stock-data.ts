"use client";

import { useState, useEffect, useCallback, useRef, startTransition } from "react";
import { isAShare } from "@/lib/ashare-api";
import { getCachedData, setCacheData, cachedFetch } from "@/lib/client-cache";

// ── Types ──────────────────────────────────────────────

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  peRatio: number;
  week52High: number;
  week52Low: number;
  avgVolume: number;
  turnover?: number;
  bidPrice?: number;
  askPrice?: number;
  isAShare?: boolean;
}

export interface KLineItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  dif: number | null;
  dea: number | null;
  macd: number | null;
  k: number | null;
  d: number | null;
  j: number | null;
  signal?: {
    type: "buy" | "sell" | "hold";
    strength: "strong" | "medium" | "weak";
    reason: string;
  };
}

export interface TimelineItem {
  time: string;
  price: number;
  avgPrice: number;
  volume: number;
  changePercent: number;
}

export type TimeInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk";
export type ChartMode = "5d-timeline" | "timeline" | "kline";

// ── Default values (always consistent between server and client) ──
// To avoid hydration mismatch, always use defaults on first render,
// then update from localStorage in useEffect.

const LAST_STOCK_KEY = "lastSelectedStock";
const LAST_CHART_MODE_KEY = "lastChartMode";
const DEFAULT_SYMBOL = "600519";
const DEFAULT_CHART_MODE: ChartMode = "timeline";

// ── Cache TTL constants ──
const QUOTE_CACHE_TTL = 2000; // 2s for quote data (matches refresh interval)
const TIMELINE_CACHE_TTL = 2000; // 2s for timeline data (matches refresh interval)
const HISTORY_CACHE_TTL = 30_000; // 30s for K-line history

// ── Auto-refresh interval ──
const TIMELINE_REFRESH_INTERVAL = 3000; // 3s for timeline/quote auto-refresh during trading hours

// ── Hook ──────────────────────────────────────────────

export function useStockData() {
  // Use consistent defaults between server and client to avoid hydration mismatch
  // Then update from localStorage in useEffect after mount
  const [symbol, setSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [history, setHistory] = useState<KLineItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelinePrevClose, setTimelinePrevClose] = useState<number>(0);
  const [interval, setInterval_] = useState<TimeInterval>("1d");
  const [chartMode, setChartMode] = useState<ChartMode>(DEFAULT_CHART_MODE);
  const [loading, setLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestSignal, setLatestSignal] = useState<{
    type: "buy" | "sell" | "hold";
    strength: "strong" | "medium" | "weak";
    reason: string;
  } | null>(null);

  // Read from localStorage after mount to avoid hydration mismatch
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const savedSymbol = localStorage.getItem(LAST_STOCK_KEY);
      if (savedSymbol && /^[0-9]{6}$/.test(savedSymbol) && savedSymbol !== DEFAULT_SYMBOL) {
        queueMicrotask(() => setSymbol(savedSymbol));
      }
      const savedMode = localStorage.getItem(LAST_CHART_MODE_KEY);
      if (savedMode === "kline" || savedMode === "5d-timeline") {
        queueMicrotask(() => setChartMode(savedMode as ChartMode));
      }
    } catch {}
  }, []);

  // Track initial fetch to prevent double-fetch
  const initialFetchDone = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAShare = useCallback((sym: string) => isAShare(sym), []);

  // ── Fetch quote ──
  const fetchQuote = useCallback(async (sym: string) => {
    try {
      const isA = checkAShare(sym);
      const url = isA
        ? `/api/stock/ashare-quote?symbol=${encodeURIComponent(sym)}`
        : `/api/stock/quote?ticker=${encodeURIComponent(sym)}`;
      const data = await cachedFetch<StockQuote>(
        `quote:${sym}`,
        async () => {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error("fetch failed");
          const d = await res.json();
          if (d.error) throw new Error(d.error);
          return d;
        },
        QUOTE_CACHE_TTL
      );
      startTransition(() => setQuote(data));
    } catch (err) {
      // Silently ignore timeout errors for quote
    }
  }, [checkAShare]);

  // ── Fetch timeline + quote in a single request (optimized for initial page load) ──
  // Ref to track last data fingerprint for skip-if-unchanged optimization
  const lastTimelineFingerprint = useRef("");
  const fetchTimelineWithQuote = useCallback(async (sym: string) => {
    if (!checkAShare(sym)) return;
    setTimelineLoading(true);
    try {
      const data = await cachedFetch<{
        items: TimelineItem[];
        prevClose: number;
        quote?: StockQuote;
        error?: string;
      }>(
        `timeline+quote:${sym}`,
        async () => {
          const res = await fetch(
            `/api/stock/ashare-timeline?symbol=${encodeURIComponent(sym)}&includeQuote=true`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!res.ok) throw new Error("fetch failed");
          return res.json();
        },
        TIMELINE_CACHE_TTL
      );
      if (!data.error) {
        // Skip state update if data hasn't actually changed (price & length fingerprint)
        const items = data.items || [];
        const lastItem = items[items.length - 1];
        const fp = `${items.length}:${lastItem?.time}:${lastItem?.price}:${lastItem?.volume}:${data.prevClose}:${data.quote?.price}`;
        if (fp === lastTimelineFingerprint.current) {
          return; // No actual change, skip re-render cascade
        }
        lastTimelineFingerprint.current = fp;
        startTransition(() => {
          setTimeline(items);
          setTimelinePrevClose(data.prevClose || 0);
          if (data.quote) {
            setQuote(data.quote);
          }
        });
      }
    } catch (err) {
      console.error("Timeline+Quote fetch error:", err);
    } finally {
      setTimelineLoading(false);
    }
  }, [checkAShare]);

  // ── Fetch history with MACD ──
  const fetchHistory = useCallback(async (sym: string, intv: TimeInterval) => {
    setLoading(true);
    setError(null);
    try {
      const isA = checkAShare(sym);
      const url = isA
        ? `/api/stock/ashare-history?symbol=${encodeURIComponent(sym)}&interval=${intv}&limit=300`
        : `/api/stock/history?symbol=${encodeURIComponent(sym)}&interval=${intv}&limit=300`;
      const data = await cachedFetch<{
        data: KLineItem[];
        latestSignal?: { type: "buy" | "sell" | "hold"; strength: "strong" | "medium" | "weak"; reason: string } | null;
        error?: string;
      }>(
        `history:${sym}:${intv}`,
        async () => {
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error("fetch failed");
          return res.json();
        },
        HISTORY_CACHE_TTL
      );
      if (data.error) {
        setError(data.error);
        setHistory([]);
      } else {
        startTransition(() => {
          setHistory(data.data || []);
          setLatestSignal(data.latestSignal || null);
        });
      }
    } catch (err: any) {
      setError(err.message || "网络错误");
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [checkAShare]);

  // ── Fetch timeline data (A-share only) — without quote, for refresh scenarios ──
  const fetchTimeline = useCallback(async (sym: string) => {
    if (!checkAShare(sym)) return;
    try {
      const data = await cachedFetch<{
        items: TimelineItem[];
        prevClose: number;
        error?: string;
      }>(
        `timeline:${sym}`,
        async () => {
          const res = await fetch(
            `/api/stock/ashare-timeline?symbol=${encodeURIComponent(sym)}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!res.ok) throw new Error("fetch failed");
          return res.json();
        },
        TIMELINE_CACHE_TTL
      );
      if (!data.error) {
        startTransition(() => {
          setTimeline(data.items || []);
          setTimelinePrevClose(data.prevClose || 0);
        });
      }
    } catch (err) {
      console.error("Timeline fetch error:", err);
    }
  }, [checkAShare]);

  // ── Search stocks ──
  const searchStocks = useCallback(async (query: string): Promise<StockSearchResult[]> => {
    if (!query.trim()) return [];
    try {
      const res = await fetch(`/api/stock/ashare-search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        return data.results || [];
      }
    } catch (err) {
      console.error("Search error:", err);
    }
    return [];
  }, []);

  // ── Select a stock ──
  const selectStock = useCallback(
    (sym: string) => {
      setSymbol(sym);
      // Abort previous requests
      if (abortRef.current) abortRef.current.abort();
      // Persist last selected stock to localStorage
      try { localStorage.setItem(LAST_STOCK_KEY, sym); } catch {}
      // Use combined timeline+quote fetch for faster loading when in timeline mode
      if (checkAShare(sym) && chartMode !== "kline") {
        fetchTimelineWithQuote(sym);
      } else {
        fetchQuote(sym);
      }
      fetchHistory(sym, interval);
    },
    [fetchQuote, fetchHistory, fetchTimelineWithQuote, interval, checkAShare, chartMode]
  );

  // ── Change interval ──
  const changeInterval = useCallback(
    (intv: TimeInterval) => {
      setInterval_(intv);
      fetchHistory(symbol, intv);
    },
    [fetchHistory, symbol]
  );

  // ── Change chart mode ──
  const changeChartMode = useCallback(
    (mode: ChartMode) => {
      setChartMode(mode);
      try { localStorage.setItem(LAST_CHART_MODE_KEY, mode); } catch {}
      if ((mode === "timeline" || mode === "5d-timeline") && checkAShare(symbol)) {
        // Use combined fetch for faster mode switching
        fetchTimelineWithQuote(symbol);
        fetchHistory(symbol, "1d");
        setInterval_("1d");
      } else if (mode === "kline") {
        const klineInterval: TimeInterval = "1d";
        setInterval_(klineInterval);
        fetchHistory(symbol, klineInterval);
      }
    },
    [fetchTimelineWithQuote, fetchHistory, symbol, checkAShare]
  );

  // ── Initial load: fetch immediately on mount (no mounted gate) ──
  // The symbol and chartMode are already initialized from localStorage
  // via the function initializer, so we can start fetching right away.
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    const currentMode = chartMode;
    if (checkAShare(symbol) && currentMode !== "kline") {
      // Combined timeline+quote fetch saves one network roundtrip on initial load
      fetchTimelineWithQuote(symbol);
      fetchHistory(symbol, interval);
    } else {
      fetchQuote(symbol);
      fetchHistory(symbol, interval);
    }
  }, []); // Empty deps - only run once on mount

  // ── Auto-refresh: 1s interval for timeline/quote during trading hours ──
  useEffect(() => {
    // Only auto-refresh when in timeline mode for A-share stocks
    if (chartMode === "kline") return;
    if (!checkAShare(symbol)) return;

    const isTradingHours = () => {
      const now = new Date();
      const chinaOffset = 8 * 60;
      const chinaTime = new Date(now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000);
      const h = chinaTime.getHours();
      const m = chinaTime.getMinutes();
      const timeNum = h * 100 + m;
      const day = chinaTime.getDay();
      // Weekend check
      if (day === 0 || day === 6) return false;
      // Trading hours: 9:25 - 15:05
      return timeNum >= 925 && timeNum <= 1505;
    };

    const tick = () => {
      if (document.hidden) return; // Don't refresh when tab is not visible
      if (!isTradingHours()) return; // Only refresh during trading hours

      const currentMode = chartMode;
      if (currentMode === "timeline" || currentMode === "5d-timeline") {
        // Refresh timeline + quote together (single request)
        fetchTimelineWithQuote(symbol);
      } else {
        fetchQuote(symbol);
      }
    };

    // Start auto-refresh timer
    refreshTimerRef.current = setInterval(tick, TIMELINE_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [symbol, chartMode, checkAShare, fetchTimelineWithQuote, fetchQuote]);

  return {
    symbol,
    quote,
    history,
    timeline,
    timelinePrevClose,
    interval,
    chartMode,
    loading,
    timelineLoading,
    error,
    latestSignal,
    selectStock,
    changeInterval,
    changeChartMode,
    searchStocks,
    fetchQuote,
    fetchHistory,
    fetchTimeline,
    fetchTimelineWithQuote,
    isAShare: checkAShare(symbol),
  };
}
