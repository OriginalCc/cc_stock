"use client";

import { useState, useEffect, useCallback, useRef, startTransition } from "react";
import { isAShare } from "@/lib/ashare-api";
import { getCachedData, setCacheData, cachedFetch, fetchWithSWR } from "@/lib/client-cache";

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
const QUOTE_CACHE_TTL = 1000; // 1s for quote data
const TIMELINE_CACHE_TTL = 1000; // 1s for timeline data
const HISTORY_CACHE_TTL = 30_000; // 30s for K-line history

// ── Auto-refresh interval ──
const TIMELINE_REFRESH_INTERVAL = 5000; // 5s — less CPU overhead, still responsive

// ── Helper: Try to read cached timeline+quote data for a symbol ──
function tryGetCachedTimelineQuote(sym: string): { items: TimelineItem[]; prevClose: number; quote?: StockQuote } | null {
  try {
    // Read from the same cache key that fetchTimelineWithQuote uses
    const cached = getCachedData<{ items: TimelineItem[]; prevClose: number; quote?: StockQuote }>(`timeline+quote:${sym}`);
    if (cached && cached.items && cached.items.length > 0) return cached;
  } catch {}
  return null;
}

// ── Hook ──────────────────────────────────────────────

export function useStockData() {
  // Read from localStorage during initialization to avoid hydration race
  const [symbol, setSymbol] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_SYMBOL;
    try {
      const saved = localStorage.getItem(LAST_STOCK_KEY);
      if (saved && /^[0-9]{6}$/.test(saved)) return saved;
    } catch {}
    return DEFAULT_SYMBOL;
  });

  // Pre-populate from client cache on mount for instant display
  const initialSymbolRef = useRef(symbol);
  const [quote, setQuote] = useState<StockQuote | null>(() => {
    if (typeof window === 'undefined') return null;
    const cached = tryGetCachedTimelineQuote(initialSymbolRef.current);
    return cached?.quote || null;
  });

  const [history, setHistory] = useState<KLineItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>(() => {
    if (typeof window === 'undefined') return [];
    const cached = tryGetCachedTimelineQuote(initialSymbolRef.current);
    return cached?.items || [];
  });

  const [timelinePrevClose, setTimelinePrevClose] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const cached = tryGetCachedTimelineQuote(initialSymbolRef.current);
    return cached?.prevClose || 0;
  });

  const [interval, setInterval_] = useState<TimeInterval>("1d");
  const [chartMode, setChartMode] = useState<ChartMode>(() => {
    if (typeof window === 'undefined') return DEFAULT_CHART_MODE;
    try {
      const saved = localStorage.getItem(LAST_CHART_MODE_KEY);
      if (saved === "kline" || saved === "5d-timeline") return saved as ChartMode;
    } catch {}
    return DEFAULT_CHART_MODE;
  });
  const [loading, setLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(() => {
    // If we have cached timeline data, don't show loading skeleton
    if (typeof window === 'undefined') return true;
    const cached = tryGetCachedTimelineQuote(initialSymbolRef.current);
    return !cached || cached.items.length === 0;
  });
  const [error, setError] = useState<string | null>(null);
  const [latestSignal, setLatestSignal] = useState<{
    type: "buy" | "sell" | "hold";
    strength: "strong" | "medium" | "weak";
    reason: string;
  } | null>(null);

  // Track initial fetch to prevent double-fetch
  const initialFetchDone = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestIdRef = useRef(0);

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

  // ── Fetch timeline + quote using SWR for instant cache display ──
  const lastTimelineFingerprint = useRef("");
  const timelineLengthRef = useRef(timeline.length);
  timelineLengthRef.current = timeline.length;
  const fetchTimelineWithQuote = useCallback(async (sym: string, isRefresh = false) => {
    if (!checkAShare(sym)) return;
    // Only show loading skeleton on initial fetch when we have no cached data
    if (!isRefresh && timelineLengthRef.current === 0) setTimelineLoading(true);
    try {
      // Use SWR pattern: return cached data instantly, revalidate in background
      const result = await fetchWithSWR<{
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
        TIMELINE_CACHE_TTL,
        {
          // On background revalidation, update state with fresh data
          onRevalidate: (freshData) => {
            if (!freshData.error) {
              const items = freshData.items || [];
              const lastItem = items[items.length - 1];
              const fp = `${items.length}:${lastItem?.time}:${lastItem?.price}:${lastItem?.volume}:${freshData.prevClose}:${freshData.quote?.price}`;
              if (fp !== lastTimelineFingerprint.current) {
                lastTimelineFingerprint.current = fp;
                startTransition(() => {
                  setTimeline(items);
                  setTimelinePrevClose(freshData.prevClose || 0);
                  if (freshData.quote) {
                    setQuote(freshData.quote);
                  }
                });
              }
            }
          }
        }
      );

      const data = result.data;
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
      if (!isRefresh) setTimelineLoading(false);
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

  // ── Search stocks (with client-side caching + AbortController) ──
  const searchAbortRef = useRef<AbortController | null>(null);
  const SEARCH_CACHE_TTL = 30_000; // 30s cache for search results (same query won't re-fetch)

  const searchStocks = useCallback(async (query: string): Promise<StockSearchResult[]> => {
    if (!query.trim()) return [];
    try {
      // Cancel any in-flight search request
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;

      const result = await cachedFetch<StockSearchResult[]>(
        `search:${query.trim()}`,
        async () => {
          const res = await fetch(
            `/api/stock/ashare-search?q=${encodeURIComponent(query)}`,
            { signal: controller.signal }
          );
          if (!res.ok) throw new Error("Search failed");
          const data = await res.json();
          return data.results || [];
        },
        SEARCH_CACHE_TTL
      );
      return result;
    } catch (err: any) {
      // Silently ignore abort errors (user typed more characters)
      if (err?.name === "AbortError") return [];
      console.error("Search error:", err);
    }
    return [];
  }, []);

  // ── Select a stock ──
  const selectStock = useCallback(
    (sym: string) => {
      setSymbol(sym);
      requestIdRef.current++;
      const currentRequestId = requestIdRef.current;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try { localStorage.setItem(LAST_STOCK_KEY, sym); } catch {}
      // Clear stale data immediately for snappier UI
      setTimeline([]);
      setQuote(null);
      setHistory([]);
      lastTimelineFingerprint.current = ""; // Reset fingerprint for new stock
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
        fetchTimelineWithQuote(symbol);
        // Skip fetchHistory for 5d-timeline — the FiveDayTimelinePanel fetches its own 5min kline data
        if (mode !== "5d-timeline") {
          fetchHistory(symbol, "1d");
        }
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
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    const currentMode = chartMode;
    if (checkAShare(symbol) && currentMode !== "kline") {
      // Combined timeline+quote fetch saves one network roundtrip on initial load
      // If we already have cached data from preload, the SWR pattern will return it instantly
      fetchTimelineWithQuote(symbol);
      // Skip fetchHistory for 5d-timeline — the panel fetches its own 5min kline data
      if (currentMode !== "5d-timeline") {
        fetchHistory(symbol, interval);
      }
    } else {
      fetchQuote(symbol);
      fetchHistory(symbol, interval);
    }
  }, []); // Empty deps - only run once on mount

  // ── Auto-refresh: 1.5s interval for timeline/quote during trading hours ──
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
        // Refresh timeline + quote together (single request, isRefresh=true to skip loading state)
        // SWR pattern: returns cached data instantly, revalidates in background
        fetchTimelineWithQuote(symbol, true);
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
