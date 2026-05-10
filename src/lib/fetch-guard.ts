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
