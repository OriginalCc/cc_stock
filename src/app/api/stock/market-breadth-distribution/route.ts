import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/stock/market-breadth-distribution
 * Fetch ALL A-share stocks from East Money and bucket them by change percentage ranges
 * to create a distribution histogram.
 */

// ── Response Types ──

interface DistributionBucket {
  label: string;
  count: number;
  color: string;
  min?: number;
  max?: number;
}

export interface DistributionResponse {
  buckets: DistributionBucket[];
  total: number;
  median: number;
  avgChange: number;
  limitUpSealed: number;
  limitUpBroken: number;
  limitDownSealed: number;
  limitDownBroken: number;
  timestamp: number;
}

// ── Bucket Definitions ──

interface BucketDef {
  label: string;
  min?: number;
  max?: number;
  color: string;
}

const BUCKET_DEFS: BucketDef[] = [
  { label: "涨停", min: 9.9, color: "#b91c1c" },
  { label: "+7~10%", min: 7, max: 9.9, color: "#dc2626" },
  { label: "+5~7%", min: 5, max: 7, color: "#ef4444" },
  { label: "+3~5%", min: 3, max: 5, color: "#f87171" },
  { label: "+1~3%", min: 1, max: 3, color: "#f09090" },
  { label: "0~+1%", min: 0, max: 1, color: "#e0a0a0" },
  { label: "-1~0", min: -1, max: 0, color: "#7eb89a" },
  { label: "-3~-1", min: -3, max: -1, color: "#5aaa80" },
  { label: "-5~-3", min: -5, max: -3, color: "#3d9d6c" },
  { label: "-7~-5", min: -7, max: -5, color: "#2d8a5e" },
  { label: "-10~-7", min: -9.9, max: -7, color: "#059669" },
  { label: "跌停", max: -9.9, color: "#047857" },
];

// ── Cache ──

let cached: { data: DistributionResponse; ts: number } | null = null;
const CACHE_TTL = 30_000;

// ── Helpers ──

function isChiNext(code: string): boolean {
  return code.startsWith("300") || code.startsWith("301");
}

function isSTAR(code: string): boolean {
  return code.startsWith("688") || code.startsWith("689");
}

function is20PctLimitStock(code: string): boolean {
  return isChiNext(code) || isSTAR(code);
}

function getLimitThreshold(code: string): { up: number; down: number } {
  if (is20PctLimitStock(code)) {
    return { up: 19.9, down: -19.9 };
  }
  return { up: 9.9, down: -9.9 };
}

function classifyStock(changePct: number, code: string): number {
  // Returns the bucket index for a stock based on its change %
  // For ChiNext (300/301) and STAR (688/689), the limit is 20% instead of 10%
  const threshold = getLimitThreshold(code);

  // 涨停: at or above the limit threshold
  if (changePct >= threshold.up) return 0;
  // 跌停: at or below the negative limit threshold
  if (changePct <= threshold.down) return 11;

  // For 20%-limit stocks that are between 9.9% and 19.9% (or -19.9% and -9.9%),
  // they need to fall into the correct intermediate bucket based on actual change %
  // The standard bucket ranges work for values -9.9% to +9.9%
  // But for 20% stocks, values like 12%, 15%, 18% are between +9.9 and +19.9
  // We need to handle these by mapping them into appropriate buckets

  // For stocks with change > 9.9% but not at 20% limit: they are in the +7~10% bucket (index 1)
  // This handles 10%-limit stocks that are at 7-9.9% and 20%-limit stocks that are at 10-19.9%
  if (changePct >= 9.9 && changePct < 19.9) return 1;
  // Similarly for negative side
  if (changePct > -19.9 && changePct <= -9.9) return 10;

  // Standard bucket classification for -9.9% to +9.9%
  for (let i = 1; i < BUCKET_DEFS.length - 1; i++) {
    const def = BUCKET_DEFS[i];
    const minOk = def.min === undefined || changePct >= def.min;
    const maxOk = def.max === undefined || changePct < def.max;
    if (minOk && maxOk) return i;
  }

  // Fallback — should not reach here
  return 5;
}

function medianValue(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[Math.floor(n / 2)];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function getTodayDateStr(): string {
  const now = new Date();
  const utcNow = now.getTime();
  const chinaOffset = 8 * 60 * 60 * 1000;
  const d = new Date(utcNow + chinaOffset);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ── Main Fetch Logic ──

interface StockItem {
  code: string;
  name: string;
  price: number;
  changePct: number;
  market: number;
}

const API_PAGE_SIZE = 100; // East Money clist API max per page
const BASE_URL = "https://push2delay.eastmoney.com/api/qt/clist/get";
const BASE_PARAMS = "po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f12,f14,f13";
const FETCH_HEADERS = {
  "Referer": "https://quote.eastmoney.com/",
  "User-Agent": "Mozilla/5.0",
};

function parseStockItems(diff: unknown[]): StockItem[] {
  const result: StockItem[] = [];
  for (const item of diff) {
    const changePct = (item as Record<string, unknown>).f3;
    const price = (item as Record<string, unknown>).f2;
    const code = (item as Record<string, unknown>).f12;
    const name = (item as Record<string, unknown>).f14;
    const market = (item as Record<string, unknown>).f13;
    if (changePct === "-" || price === "-" || !code) continue;
    result.push({
      code: String(code),
      name: String(name),
      price: Number(price),
      changePct: Number(changePct),
      market: Number(market),
    });
  }
  return result;
}

async function fetchAllStocks(): Promise<StockItem[]> {
  // Step 1: Fetch page 1 to get total count
  const url1 = `${BASE_URL}?pn=1&pz=${API_PAGE_SIZE}&${BASE_PARAMS}`;
  const res1 = await fetch(url1, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(10000),
    headers: FETCH_HEADERS,
  });
  if (!res1.ok) throw new Error(`East Money clist API returned ${res1.status}`);
  const json1 = await res1.json();
  const diff1 = json1?.data?.diff;
  if (!Array.isArray(diff1)) throw new Error("Invalid clist response format");

  const totalStocks: number = json1?.data?.total ?? 0;
  const allStocks = parseStockItems(diff1);

  if (totalStocks <= API_PAGE_SIZE) return allStocks;

  // Step 2: Calculate remaining pages and fetch them in parallel batches
  const totalPages = Math.ceil(totalStocks / API_PAGE_SIZE);
  const BATCH_SIZE = 10; // parallel requests per batch

  for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
    const pagePromises = [];

    for (let p = batchStart; p <= batchEnd; p++) {
      const url = `${BASE_URL}?pn=${p}&pz=${API_PAGE_SIZE}&${BASE_PARAMS}`;
      pagePromises.push(
        fetch(url, {
          next: { revalidate: 0 },
          signal: AbortSignal.timeout(10000),
          headers: FETCH_HEADERS,
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    }

    const results = await Promise.all(pagePromises);
    for (const json of results) {
      const diff = json?.data?.diff;
      if (Array.isArray(diff)) {
        allStocks.push(...parseStockItems(diff));
      }
    }
  }

  return allStocks;
}

async function fetchLimitUpPool(): Promise<number> {
  const todayStr = getTodayDateStr();
  try {
    const res = await fetch(
      `https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&date=${todayStr}`,
      {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(5000),
        headers: {
          "Referer": "https://data.eastmoney.com/",
          "User-Agent": "Mozilla/5.0",
        },
      }
    );
    if (!res.ok) return 0;
    const json = await res.json();
    return json?.data?.pool?.length ?? 0;
  } catch {
    return 0;
  }
}

async function fetchLimitDownPool(): Promise<number> {
  const todayStr = getTodayDateStr();
  try {
    const res = await fetch(
      `https://push2ex.eastmoney.com/getTopicDTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&date=${todayStr}`,
      {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(5000),
        headers: {
          "Referer": "https://data.eastmoney.com/",
          "User-Agent": "Mozilla/5.0",
        },
      }
    );
    if (!res.ok) return 0;
    const json = await res.json();
    return json?.data?.pool?.length ?? 0;
  } catch {
    return 0;
  }
}

async function fetchDistribution(): Promise<DistributionResponse> {
  // Fetch all stocks and limit pools in parallel
  const [stocks, limitUpSealed, limitDownSealed] = await Promise.all([
    fetchAllStocks(),
    fetchLimitUpPool(),
    fetchLimitDownPool(),
  ]);

  // Initialize buckets
  const buckets: DistributionBucket[] = BUCKET_DEFS.map((def) => ({
    label: def.label,
    count: 0,
    color: def.color,
    ...(def.min !== undefined && { min: def.min }),
    ...(def.max !== undefined && { max: def.max }),
  }));

  // Classify each stock into buckets
  const changePcts: number[] = [];
  let totalLimitUp = 0;
  let totalLimitDown = 0;

  for (const stock of stocks) {
    const changePct = stock.changePct;
    changePcts.push(changePct);

    const bucketIdx = classifyStock(changePct, stock.code);
    buckets[bucketIdx].count++;

    // Count total stocks at limit (for broken limit calculation)
    const threshold = getLimitThreshold(stock.code);
    if (changePct >= threshold.up) totalLimitUp++;
    if (changePct <= threshold.down) totalLimitDown++;
  }

  // Calculate statistics
  const total = stocks.length;
  const sorted = [...changePcts].sort((a, b) => a - b);
  const median = medianValue(sorted);
  const avgChange = changePcts.length > 0
    ? changePcts.reduce((sum, v) => sum + v, 0) / changePcts.length
    : 0;

  // Calculate broken limits
  const limitUpBroken = Math.max(0, totalLimitUp - limitUpSealed);
  const limitDownBroken = Math.max(0, totalLimitDown - limitDownSealed);

  return {
    buckets,
    total,
    median: Math.round(median * 100) / 100,
    avgChange: Math.round(avgChange * 100) / 100,
    limitUpSealed,
    limitUpBroken,
    limitDownSealed,
    limitDownBroken,
    timestamp: Date.now(),
  };
}

// ── Route Handler ──

export async function GET() {
  const needsFetch = !cached || Date.now() - cached.ts >= CACHE_TTL;

  if (needsFetch) {
    try {
      const data = await fetchDistribution();
      cached = { data, ts: Date.now() };
    } catch (err) {
      console.error("market-breadth-distribution error:", err);
      if (cached) {
        // Return stale cache on error
      } else {
        return NextResponse.json(
          { error: "Failed to fetch market breadth distribution" },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json(cached!.data);
}
