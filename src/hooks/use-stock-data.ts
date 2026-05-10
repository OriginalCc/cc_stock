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

// ── Synchronous localStorage read (avoids hydration mismatch) ──
// Read once at module level so the initial useState matches server render

const LAST_STOCK_KEY = "lastSelectedStock";
const LAST_CHART_MODE_KEY = "lastChartMode";

function readInitialSymbol(): string {
  if (typeof window === "undefined") return "600519";
  try {
    const saved = localStorage.getItem(LAST_STOCK_KEY);
    if (saved && /^[0-9]{6}$/.test(saved)) return saved;
  } catch {}
  return "600519";
}

function readInitialChartMode(): ChartMode {
  if (typeof window === "undefined") return "timeline";
  try {
    const saved = localStorage.getItem(LAST_CHART_MODE_KEY);
    if (saved === "kline" || saved === "timeline" || saved === "5d-timeline") return saved;
  } catch {}
  return "timeline";
}

// ── Cache TTL constants ──
const QUOTE_CACHE_TTL = 15_000; // 15s for quote data
const TIMELINE_CACHE_TTL = 15_000; // 15s for timeline data
const HISTORY_CACHE_TTL = 30_000; // 30s for K-line history

// ── Hook ──────────────────────────────────────────────

export function useStockData() {
  // Initialize from localStorage synchronously to avoid mount delay
  // Use function initializer so it only reads once per mount
  const [symbol, setSymbol] = useState<string>(readInitialSymbol);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [history, setHistory] = useState<KLineItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelinePrevClose, setTimelinePrevClose] = useState<number>(0);
  const [interval, setInterval_] = useState<TimeInterval>("1d");
  const [chartMode, setChartMode] = useState<ChartMode>(readInitialChartMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestSignal, setLatestSignal] = useState<{
    type: "buy" | "sell" | "hold";
    strength: "strong" | "medium" | "weak";
    reason: string;
  } | null>(null);

  // Track initial fetch to prevent double-fetch
  const initialFetchDone = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

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
  const fetchTimelineWithQuote = useCallback(async (sym: string) => {
    if (!checkAShare(sym)) return;
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
        startTransition(() => {
          setTimeline(data.items || []);
          setTimelinePrevClose(data.prevClose || 0);
          if (data.quote) {
            setQuote(data.quote);
          }
        });
      }
    } catch (err) {
      console.error("Timeline+Quote fetch error:", err);
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

  return {
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
    fetchQuote,
    fetchHistory,
    fetchTimeline,
    fetchTimelineWithQuote,
    isAShare: checkAShare(symbol),
  };
}
