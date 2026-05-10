"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isAShare } from "@/lib/ashare-api";

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
export type ChartMode = "timeline" | "kline";

// ── Hook ──────────────────────────────────────────────

const LAST_STOCK_KEY = "lastSelectedStock";

const LAST_CHART_MODE_KEY = "lastChartMode";

export function useStockData() {
  // Initialize with default value to avoid hydration mismatch
  // localStorage is read in useEffect after mount
  const [symbol, setSymbol] = useState<string>("600519");
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [history, setHistory] = useState<KLineItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelinePrevClose, setTimelinePrevClose] = useState<number>(0);
  const [interval, setInterval_] = useState<TimeInterval>("1d");
  const [chartMode, setChartMode] = useState<ChartMode>("timeline");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestSignal, setLatestSignal] = useState<{
    type: "buy" | "sell" | "hold";
    strength: "strong" | "medium" | "weak";
    reason: string;
  } | null>(null);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const quoteTimerRef = useRef<NodeJS.Timeout | null>(null);

  const checkAShare = useCallback((sym: string) => isAShare(sym), []);

  // Fetch quote
  const fetchQuote = useCallback(async (sym: string) => {
    try {
      const isA = checkAShare(sym);
      const url = isA
        ? `/api/stock/ashare-quote?symbol=${encodeURIComponent(sym)}`
        : `/api/stock/quote?ticker=${encodeURIComponent(sym)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (!data.error) {
          setQuote(data);
        }
      }
    } catch (err) {
      // Silently ignore timeout errors for quote
    }
  }, [checkAShare]);

  // Fetch history with MACD
  const fetchHistory = useCallback(async (sym: string, intv: TimeInterval) => {
    setLoading(true);
    setError(null);
    try {
      const isA = checkAShare(sym);
      const url = isA
        ? `/api/stock/ashare-history?symbol=${encodeURIComponent(sym)}&interval=${intv}&limit=300`
        : `/api/stock/history?symbol=${encodeURIComponent(sym)}&interval=${intv}&limit=300`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setHistory([]);
        } else {
          setHistory(data.data || []);
          setLatestSignal(data.latestSignal || null);
        }
      } else {
        setError("获取历史数据失败");
        setHistory([]);
      }
    } catch (err: any) {
      setError(err.message || "网络错误");
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [checkAShare]);

  // Fetch timeline data (A-share only)
  const fetchTimeline = useCallback(async (sym: string) => {
    if (!checkAShare(sym)) return;
    try {
      const res = await fetch(`/api/stock/ashare-timeline?symbol=${encodeURIComponent(sym)}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (!data.error) {
          setTimeline(data.items || []);
          setTimelinePrevClose(data.prevClose || 0);
        }
      }
    } catch (err) {
      console.error("Timeline fetch error:", err);
    }
  }, [checkAShare]);

  // Search stocks
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

  // Select a stock
  const selectStock = useCallback(
    (sym: string) => {
      setSymbol(sym);
      // Persist last selected stock to localStorage
      try { localStorage.setItem(LAST_STOCK_KEY, sym); } catch {}
      fetchQuote(sym);
      // Only fetch timeline in timeline mode — skip in kline mode for faster switching
      if (checkAShare(sym) && chartMode === "timeline") {
        fetchTimeline(sym);
      }
      fetchHistory(sym, interval);
    },
    [fetchQuote, fetchHistory, fetchTimeline, interval, checkAShare, chartMode]
  );

  // Change interval
  const changeInterval = useCallback(
    (intv: TimeInterval) => {
      setInterval_(intv);
      fetchHistory(symbol, intv);
    },
    [fetchHistory, symbol]
  );

  // Change chart mode
  const changeChartMode = useCallback(
    (mode: ChartMode) => {
      setChartMode(mode);
      try { localStorage.setItem(LAST_CHART_MODE_KEY, mode); } catch {}
      if (mode === "timeline" && checkAShare(symbol)) {
        fetchTimeline(symbol);
        // Also fetch daily history for prev day MA reference lines
        fetchHistory(symbol, "1d");
        setInterval_("1d");
      } else if (mode === "kline") {
        // Default to daily K-line when switching to kline mode
        const klineInterval: TimeInterval = "1d";
        setInterval_(klineInterval);
        fetchHistory(symbol, klineInterval);
      }
    },
    [fetchTimeline, fetchHistory, symbol, checkAShare]
  );

  // Read saved stock and chart mode from localStorage after mount (avoids hydration mismatch)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_STOCK_KEY);
      if (saved && /^[0-9]{6}$/.test(saved) && saved !== symbol) {
        queueMicrotask(() => setSymbol(saved));
      }
    } catch {}
    try {
      const savedMode = localStorage.getItem(LAST_CHART_MODE_KEY);
      if (savedMode === "kline" || savedMode === "timeline") {
        queueMicrotask(() => setChartMode(savedMode));
      }
    } catch {}
    queueMicrotask(() => setMounted(true));
  }, []);

  // Initial load (only after mount to use correct symbol from localStorage)
  useEffect(() => {
    if (!mounted) return;
    // Only fetch timeline if in timeline mode — skip in kline mode for faster load
    const currentMode = chartMode;
    const fetches: Promise<any>[] = [
      fetchQuote(symbol),
      fetchHistory(symbol, interval),
    ];
    if (checkAShare(symbol) && currentMode === "timeline") {
      fetches.push(fetchTimeline(symbol));
    }
    Promise.allSettled(fetches);
  }, [mounted]);

  // Auto-refresh disabled - only refresh on user action or mount
  // External APIs can be unreliable and may block the server
  useEffect(() => {
    // No auto-refresh intervals
    return () => {};
  }, [symbol, interval, fetchQuote, fetchHistory, fetchTimeline, checkAShare]);

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
    isAShare: checkAShare(symbol),
  };
}
