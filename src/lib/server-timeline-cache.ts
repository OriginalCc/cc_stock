/**
 * Server-side timeline cache shared across all screener routes.
 * Prevents redundant per-stock HTTP calls to Tencent API.
 */

interface TimelineCacheEntry {
  data: { time: string; price: number; volume: number; avgPrice?: number }[];
  timestamp: number;
}

const cache = new Map<string, TimelineCacheEntry>();
const CACHE_TTL = 60_000; // 1 minute - timeline data updates frequently during trading

export function getCachedTimeline(symbol: string): { time: string; price: number; volume: number; avgPrice?: number }[] | null {
  const entry = cache.get(symbol);
  if (!entry) return null;
  if (Date.now() - entry.timestamp >= CACHE_TTL) {
    cache.delete(symbol);
    return null;
  }
  return entry.data;
}

export function setCachedTimeline(symbol: string, data: { time: string; price: number; volume: number; avgPrice?: number }[]): void {
  cache.set(symbol, { data, timestamp: Date.now() });
}

/** Get cache stats for debugging */
export function getTimelineCacheStats(): { size: number; hitRate: number } {
  return { size: cache.size, hitRate: 0 };
}
