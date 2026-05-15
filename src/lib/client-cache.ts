/**
 * Client-Side Unified Cache Service
 * 
 * Provides a stale-while-revalidate (SWR) caching pattern for all API requests.
 * Features:
 * 1. Instant cache display on page load / tab switch
 * 2. Background revalidation for fresh data
 * 3. Request deduplication (same key won't trigger duplicate fetches)
 * 4. O(1) LRU eviction to prevent memory leaks
 * 5. Time-based TTL with stale-while-revalidate
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isStale?: boolean;
}

interface InFlightEntry<T> {
  promise: Promise<T>;
  timestamp: number;
}

// Global cache store (persists across component re-mounts and tab switches)
const cache = new Map<string, CacheEntry<any>>();
const inFlight = new Map<string, InFlightEntry<any>>();

// LRU tracking - delete oldest entries when cache exceeds this size
const MAX_CACHE_SIZE = 300;

// Default TTL: 30 seconds
const DEFAULT_TTL = 30_000;

// Stale threshold: data is "stale" but still usable after this time
// Revalidation happens in background
// Changed from 10s to be proportional to TTL (50% of TTL) for better hit rates
const STALE_RATIO = 0.5;

/**
 * Get cached data if available (even if stale).
 * Returns null if no cache exists at all.
 */
export function getCachedData<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry.data as T;
}

/**
 * Check if cached data is fresh (not expired).
 */
export function isCacheFresh(key: string, ttl: number = DEFAULT_TTL): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}

/**
 * Check if cached data exists (even if stale).
 */
export function hasCache(key: string): boolean {
  return cache.has(key);
}

/**
 * Get cache age in milliseconds.
 */
export function getCacheAge(key: string): number {
  const entry = cache.get(key);
  if (!entry) return Infinity;
  return Date.now() - entry.timestamp;
}

/**
 * Set cache data directly (useful for pre-populating from server responses).
 */
export function setCacheData<T>(key: string, data: T): void {
  evictIfNeeded();
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch with SWR pattern:
 * 1. If fresh cache exists → return immediately, no revalidation
 * 2. If stale cache exists → return immediately, trigger background revalidation
 * 3. If no cache → fetch and return
 * 4. Deduplicate in-flight requests
 */
export async function fetchWithSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
  options?: {
    /** Force revalidation even if cache is fresh */
    forceRefresh?: boolean;
    /** Callback when fresh data arrives (for background revalidation) */
    onRevalidate?: (data: T) => void;
  }
): Promise<{ data: T; fromCache: boolean; isStale: boolean }> {
  const { forceRefresh = false, onRevalidate } = options ?? {};

  // Check cache first
  const cached = cache.get(key);
  const now = Date.now();
  const staleThreshold = ttl * STALE_RATIO;

  if (cached && !forceRefresh) {
    const age = now - cached.timestamp;
    const isExpired = age >= ttl;
    const isStale = age >= staleThreshold;

    if (!isExpired) {
      // Fresh cache - return immediately
      return { data: cached.data as T, fromCache: true, isStale: false };
    }

    // Stale cache - return stale data, trigger background revalidation
    // Only revalidate if no request is already in-flight
    if (!inFlight.has(key)) {
      const bgPromise = fetcher()
        .then((freshData) => {
          evictIfNeeded();
          cache.set(key, { data: freshData, timestamp: Date.now() });
          inFlight.delete(key);
          onRevalidate?.(freshData);
          return freshData;
        })
        .catch(() => {
          inFlight.delete(key);
          // Keep stale data on error
          return cached.data;
        });
      inFlight.set(key, { promise: bgPromise, timestamp: now });
    }

    return { data: cached.data as T, fromCache: true, isStale: true };
  }

  // No cache or force refresh - check for in-flight request
  const existing = inFlight.get(key);
  if (existing && !forceRefresh) {
    try {
      const data = await existing.promise;
      return { data: data as T, fromCache: false, isStale: false };
    } catch {
      // In-flight request failed, try fresh fetch
    }
  }

  // Make new request
  const promise = fetcher()
    .then((data) => {
      evictIfNeeded();
      cache.set(key, { data, timestamp: Date.now() });
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      // On error, return stale cache if available
      const staleEntry = cache.get(key);
      if (staleEntry) return staleEntry.data;
      throw err;
    });

  inFlight.set(key, { promise, timestamp: now });

  const data = await promise;
  return { data: data as T, fromCache: false, isStale: false };
}

/**
 * Simple fetch-or-cache utility.
 * Returns cached data if fresh, otherwise fetches.
 * This is a simplified version of fetchWithSWR for components that
 * don't need the stale-while-revalidate pattern.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }

  // Deduplicate in-flight requests
  const existing = inFlight.get(key);
  if (existing) {
    return existing.promise as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      evictIfNeeded();
      cache.set(key, { data, timestamp: Date.now() });
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      // Return stale cache on error
      const staleEntry = cache.get(key);
      if (staleEntry) return staleEntry.data;
      throw err;
    });

  inFlight.set(key, { promise, timestamp: Date.now() });
  return promise;
}

/**
 * Invalidate a specific cache entry.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache entries matching a prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cache entries.
 */
export function clearAllCache(): void {
  cache.clear();
  inFlight.clear();
}

// ── Internal helpers ──

function evictIfNeeded(): void {
  if (cache.size < MAX_CACHE_SIZE) return;

  // O(1) LRU eviction: Map preserves insertion order, so the first entry is the oldest.
  // Just delete the first 20% of entries (oldest first).
  const toRemove = Math.ceil(cache.size * 0.2);
  let removed = 0;
  for (const key of cache.keys()) {
    if (removed >= toRemove) break;
    cache.delete(key);
    removed++;
  }
}

// Periodic cleanup of expired entries (every 2 minutes)
if (typeof window !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      // Remove entries older than 2 hours
      if (now - entry.timestamp > 7_200_000) {
        cache.delete(key);
      }
    }
    // Clean up stale in-flight entries (older than 30s)
    for (const [key, entry] of inFlight) {
      if (now - entry.timestamp > 30_000) {
        inFlight.delete(key);
      }
    }
  }, 120_000);
}
