/**
 * Shared utilities for all screener components (4 screeners)
 *
 * Contains:
 * 1. Watchlist/Favorites System (localStorage + Database dual persistence)
 * 2. Auto-Refresh System (trading hours detection + React hook)
 * 3. Screener Stats Utility (score distribution, formatMarketCap, formatAmount)
 * 4. Mini Timeline Fetcher (for preview charts)
 */

import { useEffect, useRef, useCallback } from "react";
import { cachedFetch } from "@/lib/client-cache";

// ═══════════════════════════════════════════════════════════
// 1. Watchlist / Favorites System (localStorage + Database dual persistence)
// ═══════════════════════════════════════════════════════════

export const SCREENER_WATCHLIST_KEY = "screener-watchlist";

/** Custom event name dispatched when the watchlist changes */
export const WATCHLIST_CHANGED_EVENT = "screener-watchlist-changed";

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: number;   // Unix timestamp (ms)
  source: string;    // Which screener added this, e.g. "early-screen", "intraday", "stock-screener", "limit-up"
  price?: number;
  changePercent?: number;
}

// ── In-memory cache for fast sync access ──
let _watchlistCache: WatchlistItem[] | null = null;

/**
 * Load watchlist from database (primary) with localStorage fallback.
 * Returns empty array on SSR or if storage is unavailable.
 */
export async function loadWatchlistFromDB(): Promise<WatchlistItem[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/stock/watchlist");
    if (res.ok) {
      const data = await res.json();
      const items: WatchlistItem[] = data.items ?? [];
      _watchlistCache = items;
      // Also sync to localStorage as backup
      try {
        localStorage.setItem(SCREENER_WATCHLIST_KEY, JSON.stringify(items));
      } catch {}
      return items;
    }
  } catch {
    // Fallback to localStorage
  }
  return loadWatchlistFromLS();
}

/**
 * Load watchlist from localStorage only (synchronous, internal).
 */
function loadWatchlistFromLS(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCREENER_WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WatchlistItem[];
  } catch {
    return [];
  }
}

/**
 * Load watchlist from cache/localStorage (synchronous).
 * Use loadWatchlistFromDB() for accurate data from server.
 */
export function loadWatchlist(): WatchlistItem[] {
  if (_watchlistCache) return _watchlistCache;
  return loadWatchlistFromLS();
}

/**
 * Save watchlist to localStorage + dispatch event (immediate),
 * and async sync to database.
 */
export function saveWatchlist(items: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  _watchlistCache = items;
  try {
    localStorage.setItem(SCREENER_WATCHLIST_KEY, JSON.stringify(items));
    // Dispatch custom event so other components/tabs can react
    window.dispatchEvent(
      new CustomEvent(WATCHLIST_CHANGED_EVENT, { detail: { items } })
    );
  } catch {
    // localStorage might be full or unavailable
  }
}

/**
 * Add a stock to the watchlist. If it already exists, update its price/changePercent.
 * Syncs to both localStorage and database.
 * Returns the updated list.
 */
export function addToWatchlist(
  symbol: string,
  name: string,
  source: string,
  price?: number,
  changePercent?: number,
): WatchlistItem[] {
  const items = loadWatchlist();
  const existingIdx = items.findIndex((i) => i.symbol === symbol);

  if (existingIdx >= 0) {
    // Update existing entry with latest data
    items[existingIdx] = {
      ...items[existingIdx],
      name,                      // name might change for same symbol
      source,
      price: price ?? items[existingIdx].price,
      changePercent: changePercent ?? items[existingIdx].changePercent,
    };
  } else {
    items.unshift({
      symbol,
      name,
      addedAt: Date.now(),
      source,
      price,
      changePercent,
    });
  }

  saveWatchlist(items);

  // Async sync to database (non-blocking)
  syncAddToDB(symbol, name, source, price, changePercent);

  return items;
}

/**
 * Remove a stock from the watchlist by symbol.
 * Syncs to both localStorage and database.
 * Returns the updated list.
 */
export function removeFromWatchlist(symbol: string): WatchlistItem[] {
  const items = loadWatchlist().filter((i) => i.symbol !== symbol);
  saveWatchlist(items);

  // Async sync to database (non-blocking)
  syncRemoveFromDB(symbol);

  return items;
}

/**
 * Check if a symbol is in the watchlist.
 */
export function isInWatchlist(symbol: string): boolean {
  return loadWatchlist().some((i) => i.symbol === symbol);
}

// ── Database sync helpers (non-blocking) ──

async function syncAddToDB(
  symbol: string,
  name: string,
  source: string,
  price?: number,
  changePercent?: number,
): Promise<void> {
  try {
    await fetch("/api/stock/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, name, source, price, changePercent }),
    });
  } catch {
    // Silently fail - localStorage is the fallback
  }
}

async function syncRemoveFromDB(symbol: string): Promise<void> {
  try {
    await fetch("/api/stock/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
  } catch {
    // Silently fail - localStorage is the fallback
  }
}

/**
 * React hook: Initialize watchlist from database on mount.
 * Should be called once in each screener component to ensure
 * favorites persist across page reloads.
 */
export function useWatchlistInit(): void {
  useEffect(() => {
    loadWatchlistFromDB().then((items) => {
      _watchlistCache = items;
      window.dispatchEvent(
        new CustomEvent(WATCHLIST_CHANGED_EVENT, { detail: { items } })
      );
    });
  }, []);
}

// ═══════════════════════════════════════════════════════════
// 2. Auto-Refresh System
// ═══════════════════════════════════════════════════════════

/** Refresh every 60 seconds during trading hours */
export const TRADING_REFRESH_INTERVAL = 60_000; // 1 minute

/**
 * Check if current time (China timezone, UTC+8) is during A-share trading hours.
 * Trading sessions: 9:30-11:30, 13:00-15:00 on weekdays.
 */
export function isTradingHours(): boolean {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(
    now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000,
  );
  const h = chinaTime.getHours();
  const m = chinaTime.getMinutes();
  const dayOfWeek = chinaTime.getDay();

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const totalMinutes = h * 60 + m;

  // Morning session: 9:30 - 11:30 (570 - 690)
  if (totalMinutes >= 570 && totalMinutes <= 690) return true;

  // Afternoon session: 13:00 - 15:00 (780 - 900)
  if (totalMinutes >= 780 && totalMinutes <= 900) return true;

  return false;
}

/**
 * Get the current trading phase info.
 * Returns the phase name, minutes since market open, and whether currently in trading hours.
 */
export function getTradingPhaseInfo(): {
  phase: string;
  minutesSinceOpen: number;
  isTradingHours: boolean;
} {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(
    now.getTime() + (chinaOffset + now.getTimezoneOffset()) * 60000,
  );
  const h = chinaTime.getHours();
  const m = chinaTime.getMinutes();
  const dayOfWeek = chinaTime.getDay();

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { phase: "非交易时间", minutesSinceOpen: 0, isTradingHours: false };
  }

  const totalMinutes = h * 60 + m;

  // Before market (before 9:30)
  if (totalMinutes < 570) {
    return { phase: "非交易时间", minutesSinceOpen: 0, isTradingHours: false };
  }

  // Morning session: 9:30 - 11:30
  if (totalMinutes >= 570 && totalMinutes <= 690) {
    const mins = totalMinutes - 570 + 1;
    if (mins <= 15) return { phase: "开盘15分钟", minutesSinceOpen: mins, isTradingHours: true };
    if (mins <= 30) return { phase: "开盘30分钟", minutesSinceOpen: mins, isTradingHours: true };
    if (mins <= 60) return { phase: "开盘1小时", minutesSinceOpen: mins, isTradingHours: true };
    return { phase: "早盘", minutesSinceOpen: mins, isTradingHours: true };
  }

  // Lunch break: 11:31 - 12:59
  if (totalMinutes > 690 && totalMinutes < 780) {
    return { phase: "午休", minutesSinceOpen: 121, isTradingHours: false };
  }

  // Afternoon session: 13:00 - 15:00
  if (totalMinutes >= 780 && totalMinutes <= 900) {
    const mins = 121 + (totalMinutes - 780) + 1;
    if (totalMinutes >= 870) {
      // 14:30 - 15:00 is the "尾盘" (late session)
      return { phase: "尾盘", minutesSinceOpen: mins, isTradingHours: true };
    }
    return { phase: "午后盘中", minutesSinceOpen: mins, isTradingHours: true };
  }

  // After market close
  return { phase: "收盘", minutesSinceOpen: 242, isTradingHours: false };
}

/**
 * React hook: auto-refresh by calling `callback` on a timer during trading hours.
 *
 * - When `enabled` is true AND it's trading hours, the callback fires every
 *   `TRADING_REFRESH_INTERVAL` ms.
 * - When not in trading hours (or `enabled` is false), the interval is cleared.
 * - Re-evaluates trading-hour status every 30 seconds so it can start/stop
 *   automatically when the market opens/closes.
 *
 * The callback is called immediately when the hook first activates during
 * trading hours (no initial delay).
 */
export function useAutoRefresh(
  callback: () => void,
  enabled: boolean,
): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const refreshCallback = useCallback(() => {
    callbackRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Fire immediately if we're in trading hours
    if (isTradingHours()) {
      refreshCallback();
    }

    // Main refresh interval (1 minute during trading hours)
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    // Check interval: re-evaluate trading status every 30 seconds
    const checkTimer = setInterval(() => {
      if (isTradingHours()) {
        if (!refreshTimer) {
          // Just entered trading hours: fire immediately
          refreshCallback();
          refreshTimer = setInterval(refreshCallback, TRADING_REFRESH_INTERVAL);
        }
      } else {
        // Not trading hours: clear the refresh timer
        if (refreshTimer) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
      }
    }, 30_000); // Check every 30 seconds

    // Start the refresh timer if already in trading hours
    if (isTradingHours()) {
      refreshTimer = setInterval(refreshCallback, TRADING_REFRESH_INTERVAL);
    }

    return () => {
      clearInterval(checkTimer);
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [enabled, refreshCallback]);
}

// ═══════════════════════════════════════════════════════════
// 3. Screener Stats Utility
// ═══════════════════════════════════════════════════════════

export interface ScoreDistribution {
  range: string;
  count: number;
  percent: number;
}

export interface ScreenerStats {
  avg: number;
  median: number;
  top25: number;
  distribution: ScoreDistribution[];
}

/**
 * Compute aggregate statistics for an array of screener scores.
 * Used to display score distribution across all screened stocks.
 *
 * Distribution ranges:
 *   0-10, 10-20, 20-30, 30-40, 40-50, 50-60, 60-70, 70-80, 80-90, 90-100
 */
export function computeScreenerStats(scores: number[]): ScreenerStats {
  if (!scores || scores.length === 0) {
    return { avg: 0, median: 0, top25: 0, distribution: [] };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;

  // Average
  const sum = sorted.reduce((s, v) => s + v, 0);
  const avg = Number((sum / n).toFixed(1));

  // Median
  const median =
    n % 2 === 0
      ? Number(((sorted[n / 2 - 1] + sorted[n / 2]) / 2).toFixed(1))
      : Number(sorted[Math.floor(n / 2)].toFixed(1));

  // Top 25th percentile (P75)
  const p75Idx = Math.ceil(n * 0.75) - 1;
  const top25 = Number(sorted[Math.min(p75Idx, n - 1)].toFixed(1));

  // Distribution in 10-point buckets
  const buckets: { range: string; count: number }[] = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const count = sorted.filter((v) => v >= lo && v < hi).length;
    buckets.push({ range: `${lo}-${hi}`, count });
  }
  // Include 100 in the last bucket
  const lastBucketCount = sorted.filter((v) => v >= 90 && v <= 100).length;
  buckets[buckets.length - 1] = { range: "90-100", count: lastBucketCount };

  const distribution: ScoreDistribution[] = buckets.map((b) => ({
    range: b.range,
    count: b.count,
    percent: n > 0 ? Number(((b.count / n) * 100).toFixed(1)) : 0,
  }));

  return { avg, median, top25, distribution };
}

/**
 * Format market cap value for display.
 * Input is typically in 元 (yuan) from EastMoney API.
 * Handles: 万亿, 亿, 万
 */
export function formatMarketCap(val: number): string {
  if (!val) return "--";
  if (val >= 1e12) return (val / 1e12).toFixed(2) + "万亿";
  if (val >= 1e8) return (val / 1e8).toFixed(2) + "亿";
  if (val >= 1e4) return (val / 1e4).toFixed(2) + "万";
  return val.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format amount value for display (成交额、净流入 etc.)
 * Input is typically in 元 (yuan).
 * Handles: 亿, 万
 */
export function formatAmount(val: number): string {
  if (!val) return "--";
  if (val >= 1e8) return (val / 1e8).toFixed(2) + "亿";
  if (val >= 1e4) return (val / 1e4).toFixed(2) + "万";
  return val.toLocaleString();
}

// ═══════════════════════════════════════════════════════════
// 4. Mini Timeline Fetcher (for preview charts)
// ═══════════════════════════════════════════════════════════

export interface MiniTimelineItem {
  time: string;
  price: number;
  avgPrice: number;
  volume: number;
  changePercent: number;
}

export interface MiniTimelineResult {
  items: MiniTimelineItem[];
  prevClose: number;
}

/**
 * Fetch a small intraday timeline dataset for a stock, suitable for
 * rendering a mini preview / sparkline chart in screener rows.
 *
 * Uses the Tencent minute API (via server-side API route) to get 1-minute
 * data. Downsamples to at most ~30 points for lightweight rendering.
 */
export async function fetchMiniTimeline(
  symbol: string,
): Promise<MiniTimelineResult> {
  return cachedFetch<MiniTimelineResult>(
    `mini-timeline:${symbol}`,
    async () => {
      try {
        const res = await fetch(
          `/api/stock/ashare-timeline?symbol=${encodeURIComponent(symbol)}`,
        );

        if (!res.ok) return { items: [], prevClose: 0 };

        const data = await res.json();
        const rawItems: { time: string; price: number; avgPrice: number; volume: number; changePercent: number }[] =
          data?.items ?? [];
        const prevClose: number = data?.prevClose ?? 0;

        if (rawItems.length === 0) return { items: [], prevClose };

        // Downsample: pick every Nth point so we have at most ~30 points
        const maxPoints = 30;
        const step = rawItems.length <= maxPoints ? 1 : Math.ceil(rawItems.length / maxPoints);

        const items: MiniTimelineItem[] = [];
        for (let i = 0; i < rawItems.length; i += step) {
          const item = rawItems[i];
          items.push({
            time: item.time,
            price: Number((item.price ?? 0).toFixed(2)),
            avgPrice: Number((item.avgPrice ?? item.price ?? 0).toFixed(2)),
            volume: item.volume ?? 0,
            changePercent: Number(
              ((item.changePercent ?? (prevClose > 0 ? (((item.price ?? 0) - prevClose) / prevClose) * 100 : 0)) ?? 0).toFixed(2),
            ),
          });
        }

        // Always include the last data point for accuracy
        const lastRaw = rawItems[rawItems.length - 1];
        if (items.length > 0 && items[items.length - 1].time !== lastRaw.time) {
          items.push({
            time: lastRaw.time,
            price: Number((lastRaw.price ?? 0).toFixed(2)),
            avgPrice: Number((lastRaw.avgPrice ?? lastRaw.price ?? 0).toFixed(2)),
            volume: lastRaw.volume ?? 0,
            changePercent: Number(
              ((lastRaw.changePercent ?? (prevClose > 0 ? (((lastRaw.price ?? 0) - prevClose) / prevClose) * 100 : 0)) ?? 0).toFixed(2),
            ),
          });
        }

        return { items, prevClose };
      } catch (err) {
        console.error("fetchMiniTimeline error:", err);
        return { items: [], prevClose: 0 };
      }
    },
    60_000, // 1 min cache
  );
}

// ═══════════════════════════════════════════════════════════
// 5. Screener Auto-Save to History
// ═══════════════════════════════════════════════════════════

/** Auto-save interval: save every 30 minutes during trading hours */
const AUTO_SAVE_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Save screener results to the database for historical verification.
 * Called automatically by each screener component at regular intervals.
 *
 * @param stocks - Array of stock results from the screener
 * @param screenerType - Type of screener: "stock" | "intraday" | "early" | "low_open" | "limit_up"
 * @param sectorName - Name of the sector or strategy used
 * @param filters - Filter parameters used for this screening
 */
export async function saveScreenerResults(
  stocks: Array<{ symbol: string; name: string; price?: number; changePercent?: number; compositeScore?: number; evaluation?: string; pulseScore?: number; volumeSurgeScore?: number; reliabilityScore?: number; [key: string]: any }>,
  screenerType: string,
  sectorName: string,
  filters: Record<string, any> = {},
): Promise<void> {
  if (!stocks || stocks.length === 0) return;

  const now = new Date();
  const chinaTime = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  const recordDate = chinaTime.toISOString().split("T")[0];
  const h = chinaTime.getHours();
  const m = chinaTime.getMinutes();
  const recordTime = m >= 30 ? `${String(h).padStart(2, "0")}:30` : `${String(h).padStart(2, "0")}:00`;

  // Also save to localStorage for manual save button in ScreenerHistoryPanel
  try {
    localStorage.setItem("screener-last-result", JSON.stringify({
      stocks,
      screenerType,
      sector: sectorName,
      filters,
    }));
  } catch {}

  // Save to database
  const stocksToSave = stocks.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price ?? 0,
    changePercent: s.changePercent ?? 0,
    compositeScore: s.compositeScore,
    evaluation: s.evaluation,
    pulseScore: s.pulseScore,
    volumeSurgeScore: s.volumeSurgeScore,
    reliabilityScore: s.reliabilityScore,
  }));

  try {
    await fetch("/api/stock/screener-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        records: [{
          recordDate,
          recordTime,
          screenerType,
          sectorName,
          stockCount: stocksToSave.length,
          stocksJson: JSON.stringify(stocksToSave),
          filtersJson: JSON.stringify(filters),
        }],
      }),
    });
  } catch (e) {
    console.error("Auto-save screener results error:", e);
  }
}

/**
 * React hook: auto-save screener results at regular intervals during trading hours.
 * Each screener component should call this with its current results.
 *
 * @param stocks - Current screener results
 * @param screenerType - Type of screener
 * @param sectorName - Sector or strategy name
 * @param filters - Filters used
 * @param enabled - Whether auto-save is enabled (typically true when screener has results)
 */
export function useAutoSaveScreener(
  stocks: Array<{ symbol: string; name: string; price?: number; changePercent?: number; compositeScore?: number; evaluation?: string; pulseScore?: number; volumeSurgeScore?: number; reliabilityScore?: number; [key: string]: any }> | undefined,
  screenerType: string,
  sectorName: string,
  filters: Record<string, any> = {},
  enabled: boolean = true,
): void {
  const lastSaveRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !stocks || stocks.length === 0) return;

    const checkAndSave = () => {
      if (!isTradingHours()) return;
      const now = Date.now();
      if (now - lastSaveRef.current < AUTO_SAVE_INTERVAL) return;
      lastSaveRef.current = now;
      saveScreenerResults(stocks, screenerType, sectorName, filters);
    };

    // Initial save with a short delay (don't block initial render)
    const initialTimer = setTimeout(() => {
      if (stocks && stocks.length > 0) {
        const now = Date.now();
        if (now - lastSaveRef.current >= AUTO_SAVE_INTERVAL) {
          lastSaveRef.current = now;
          saveScreenerResults(stocks, screenerType, sectorName, filters);
        }
      }
    }, 5000);

    // Check every 60 seconds
    const checkTimer = setInterval(checkAndSave, 60_000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(checkTimer);
    };
  }, [stocks, screenerType, sectorName, enabled]);
}
