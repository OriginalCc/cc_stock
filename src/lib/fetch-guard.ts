/**
 * Fetch Guard - Prevents duplicate external API calls and adds reliable timeout
 * 
 * Problem: Node.js fetch with AbortSignal.timeout may not properly abort
 * in Next.js production builds, causing server hangs.
 * 
 * Solution: Request deduplication + in-memory cache + short TTL
 */

// In-flight request tracking (prevents duplicate concurrent requests)
const inFlight = new Map<string, Promise<any>>();

// Cache for completed requests  
const cache = new Map<string, { data: any; timestamp: number }>();

// Default cache TTL: 10 seconds
const DEFAULT_TTL = 10000;

// Maximum cache entries to prevent memory leaks
const MAX_CACHE_SIZE = 200;

// Periodic cleanup interval (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  // Remove expired entries
  for (const [key, entry] of cache) {
    // Remove entries older than 5 minutes (they're definitely stale by then)
    if (now - entry.timestamp > 300000) {
      cache.delete(key);
    }
  }
}, 300000);

/**
 * Fetch with deduplication, caching, and reliable timeout
 * If a request for the same key is already in-flight, returns the same promise
 * If cached data exists and is fresh, returns it immediately
 * Otherwise, makes a new request with AbortSignal.timeout
 */
export function fetchGuarded<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  // Check cache first
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return Promise.resolve(cached.data as T);
  }

  // Check if request is already in-flight
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  // Create new request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s hard timeout

  const promise = fetcher(controller.signal)
    .then((data) => {
      clearTimeout(timeoutId);
      // Evict oldest entries if cache is full (O(1) - Map preserves insertion order)
      if (cache.size >= MAX_CACHE_SIZE) {
        const toRemove = Math.ceil(MAX_CACHE_SIZE * 0.2);
        let removed = 0;
        for (const k of cache.keys()) {
          if (removed >= toRemove) break;
          cache.delete(k);
          removed++;
        }
      }
      cache.set(key, { data, timestamp: Date.now() });
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      inFlight.delete(key);
      // On error, return cached data if available (even if stale)
      const stale = cache.get(key);
      if (stale) return stale.data as T;
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Clear all caches (useful for testing)
 */
export function clearFetchCache() {
  inFlight.clear();
  cache.clear();
}
