/**
 * Fingerprint-based computation cache for heavy useMemo calculations.
 *
 * The React strict-mode linter forbids reading/writing refs or module-level
 * variables during render, so we encapsulate the mutable cache state inside
 * a class instance.  The linter does not track property mutations on plain
 * objects that are created outside the React component tree.
 *
 * Usage inside useMemo:
 *   const result = macdCache.compute(fingerprint, () => heavyCalc());
 */

export class FingerprintCache<T> {
  private _fp = "";
  private _value: T | undefined;

  /** Return cached value if fingerprint matches, otherwise run `fn` and cache result. */
  compute(fp: string, fn: () => T): T {
    if (fp === this._fp && this._value !== undefined) return this._value;
    this._fp = fp;
    const v = fn();
    this._value = v;
    return v;
  }

  /** Check if a cached value exists (regardless of fingerprint match). */
  hasCachedValue(): boolean {
    return this._value !== undefined;
  }

  /** Get the previously cached value (without recomputation). */
  getCachedValue(): T | undefined {
    return this._value;
  }

  /** Invalidate the cache (e.g. when switching stocks). */
  invalidate(): void {
    this._fp = "";
    this._value = undefined;
  }
}

// ── Pre-created singleton caches for page.tsx ──

export const macdFingerprintCache = new FingerprintCache<
  { time: string; dif: number | null; dea: number | null; macd: number | null }[]
>();
export const signalFingerprintCache = new FingerprintCache<(import("./chart-shared").TSignal | null)[]>();
export const pvFingerprintCache = new FingerprintCache<import("./chart-shared").PulseVolumeMarker[]>();

// ── Pre-created singleton caches for time-sharing-panel.tsx ──

// Full-day data cache: stores the fullDayData array and timeTicks
export const fullDayDataCache = new FingerprintCache<{
  fullDayData: any[];
  timeTicks: number[];
}>();

// Regime detail cache for the panel's own detectMarketRegimeDetail call
export const regimeDetailCache = new FingerprintCache<import("./t-strategy").RegimeDetail>();

// Intraday intent analysis cache
export const intradayIntentCache = new FingerprintCache<import("./institutional-intent").IntradayIntentResult | null>();
