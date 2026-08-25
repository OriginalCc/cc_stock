import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Server-side Cache ───────────────────────────────────
const cache = new Map<string, { data: PullbackResult; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min cache

function getTodayKey(): string {
  const now = new Date();
  const china = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  return `${china.getFullYear()}-${String(china.getMonth() + 1).padStart(2, "0")}-${String(china.getDate()).padStart(2, "0")}`;
}

// ── Types ──────────────────────────────────────────────

interface PullbackResult {
  success: boolean;
  date: string;
  stocks: PullbackStock[];
  summary: {
    totalScanned: number;
    totalPullback: number;
  };
  timestamp: string;
  cached?: boolean;
  error?: string;
}

interface PullbackStock {
  symbol: string;
  name: string;
  // 涨停日信息
  limitUpDate: string;      // 涨停日期
  limitUpClose: number;     // 涨停日收盘价
  preLimitUpClose: number;  // 涨停前一交易日收盘价（起涨点）
  limitUpPct: number;       // 涨停日涨幅
  // 当前信息
  currentPrice: number;     // 当前价
  currentChangePct: number; // 当前涨跌幅
  // 回踩分析
  pullbackPct: number;      // 从涨停价回落的幅度(%)
  approachPct: number;      // 接近起涨点的程度(0%=还在涨停价, 100%=完全回到起涨点)
  daysSinceLimitUp: number; // 距涨停日过去几个交易日
  maxPullbackPct: number;   // 涨停后最大回撤幅度(%)
  maxPullbackDate: string;  // 最大回撤日期
  // K线摘要
  klineSummary: KLineDay[];
  // 基本面
  turnover: number;         // 换手率
  marketCap: number;        // 总市值(亿)
  volumeRatio: number;      // 量比
}

interface KLineDay {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number;
}

interface RawStock {
  code: string;
  name: string;
  price: number;
  changePct: number;
  prevClose: number;
}

// ── Helper: Fetch all A-share stocks from EastMoney ────
// Note: f2/f3/f4 are real-time quote fields. Outside trading hours these return "-"
// (parsed as NaN → 0). We request f18 (previous close) as a fallback so price-based
// candidate filtering still works outside trading hours. The K-line analysis below
// independently determines limit-up + pullback status from sina daily K-line data.
async function fetchAllStocks(): Promise<RawStock[]> {
  const allStocks: RawStock[] = [];
  // push2delay caps each page at 100 items regardless of pz param, so use 100
  const pageSize = 100;
  const fields = "f2,f3,f4,f12,f14,f18";

  // Parse a single page response and append stocks to allStocks
  const appendFromJson = (json: any) => {
    const diff = json?.data?.diff;
    if (!Array.isArray(diff)) return;
    for (const item of diff) {
      const code = String(item.f12 || "");
      if (!code) continue;
      // f2 = current price (real-time, "-" outside trading hours)
      // f18 = previous close (always available, this is the YESTERDAY CLOSE price)
      // f4 = change amount (元, NOT previous close!) - do NOT use as prevClose fallback
      // f3 = change percentage
      const price = parseFloat(item.f2) || 0;
      const prevClose = parseFloat(item.f18) || 0;
      allStocks.push({
        code,
        name: String(item.f14 || ""),
        price,
        changePct: parseFloat(item.f3) || 0,
        prevClose,
      });
    }
  };

  try {
    // First page to get total count
    const firstUrl = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=${fields}`;
    const firstRes = await fetch(firstUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "Referer": "https://quote.eastmoney.com/" },
      cache: "no-store" as RequestCache,
    });
    if (!firstRes.ok) return [];
    const firstJson = await firstRes.json();
    const total = firstJson?.data?.total || 0;
    appendFromJson(firstJson);

    // Fetch remaining pages in small batches to avoid push2delay rate-limiting.
    // push2delay aggressively drops concurrent requests, so we use CONCURRENCY=3
    // and a short delay between batches. Each page is retried once on failure.
    const totalPages = Math.ceil(total / pageSize);
    const CONCURRENCY = 3;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const fetchPage = async (page: number): Promise<void> => {
      const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=${fields}`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: { "Referer": "https://quote.eastmoney.com/" },
            cache: "no-store" as RequestCache,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const diff = json?.data?.diff;
          if (!Array.isArray(diff) || diff.length === 0) throw new Error("empty diff");
          appendFromJson(json);
          return; // success
        } catch {
          // retry once after a short delay
          if (attempt === 0) await sleep(200);
        }
      }
    };

    for (let startPage = 2; startPage <= totalPages; startPage += CONCURRENCY) {
      const batch: Promise<void>[] = [];
      const endPage = Math.min(startPage + CONCURRENCY - 1, totalPages);
      for (let page = startPage; page <= endPage; page++) {
        batch.push(fetchPage(page));
      }
      await Promise.allSettled(batch);
      // Small delay between batches to avoid rate-limiting
      if (endPage < totalPages) await sleep(150);
    }
  } catch {
    // ignore
  }

  // Filter by prevClose (works outside trading hours via f18 fallback) to remove penny stocks.
  // Keep all valid 6-digit codes; changePct filter is skipped because it's 0 outside trading hours.
  // Deduplicate by code (push2delay pagination can return overlapping entries at page boundaries).
  const seen = new Set<string>();
  const filtered = allStocks.filter(s => {
    if (!/^\d{6}$/.test(s.code) || s.prevClose < 2) return false;
    if (seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  });
  return filtered;
}

// ── Helper: Fetch daily K-line via EastMoney push2his ──
// Uses push2his.eastmoney.com (more reliable than sina which gets IP-banned easily).
// secid format: 1.{code} for Shanghai (6xx/688), 0.{code} for Shenzhen (0xx/30x/8xx).
// beg is set to ~30 calendar days ago to ensure >=15 trading days coverage.
async function fetchDailyKline(symbol: string, datalen: number = 15): Promise<KLineDay[]> {
  try {
    const secid = symbol.startsWith("6") ? `1.${symbol}` : `0.${symbol}`;
    // Compute beg date ~35 calendar days ago to cover ~15 trading days
    const now = new Date();
    const begDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
    const beg = `${begDate.getFullYear()}${String(begDate.getMonth() + 1).padStart(2, "0")}${String(begDate.getDate()).padStart(2, "0")}`;

    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=0&beg=${beg}&end=20500101&fields1=f1&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
    const res = await fetch(url, {
      headers: { "Referer": "https://quote.eastmoney.com/" },
      cache: "no-store" as RequestCache,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const klines: string[] = json?.data?.klines;
    if (!Array.isArray(klines) || klines.length === 0) return [];

    // Each kline entry: "date,open,close,high,low,volume,amount,amplitude,changePct,changeAmt,turnover"
    const parsed: KLineDay[] = klines.map((line: string) => {
      const parts = line.split(",");
      return {
        date: parts[0] || "",
        open: parseFloat(parts[1]) || 0,
        close: parseFloat(parts[2]) || 0,
        high: parseFloat(parts[3]) || 0,
        low: parseFloat(parts[4]) || 0,
        changePct: parseFloat(parts[8]) || 0, // f59 = change percent
      };
    }).filter((d: KLineDay) => d.close > 0);

    // Return last `datalen` entries (or all if fewer)
    return parsed.slice(-datalen);
  } catch {
    return [];
  }
}

// ── Helper: Fetch real-time quote for multiple stocks ──
async function fetchRealtimeQuotes(symbols: string[]): Promise<Map<string, { price: number; changePct: number; turnover: number; marketCap: number; volumeRatio: number }>> {
  const result = new Map<string, { price: number; changePct: number; turnover: number; marketCap: number; volumeRatio: number }>();
  if (symbols.length === 0) return result;

  try {
    const secIds = symbols.map(s => {
      const code = s.replace(/\.(SS|SZ)$/i, "");
      const prefix = code.startsWith("6") ? "1" : "0";
      return `${prefix}.${code}`;
    });

    for (let i = 0; i < secIds.length; i += 50) {
      const batch = secIds.slice(i, i + 50);
      const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f8,f9,f10,f12,f14&secids=${batch.join(",")}`;
      const res = await fetch(url, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(8000),
        headers: { "Referer": "https://quote.eastmoney.com/" },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const diff = json?.data?.diff;
      if (!Array.isArray(diff)) continue;

      for (const item of diff) {
        const code = String(item.f12 || "");
        if (!code) continue;
        result.set(code, {
          price: parseFloat(item.f2) || 0,
          changePct: parseFloat(item.f3) || 0,
          turnover: parseFloat(item.f8) || 0,
          marketCap: parseFloat(item.f10) || 0,
          volumeRatio: parseFloat(item.f9) || 0,
        });
      }
    }
  } catch {
    // ignore
  }
  return result;
}

// ── Main handler ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheKey = `pullback-${getTodayKey()}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cached.data, cached: true });
  }
  // If forceRefresh, invalidate the stale cache entry so a fresh result gets stored
  if (forceRefresh) {
    cache.delete(cacheKey);
  }

  try {
    // Step 1: Fetch all A-share stocks
    const allStocks = await fetchAllStocks();
    if (allStocks.length === 0) {
      const emptyResult: PullbackResult = {
        success: true,
        date: getTodayKey(),
        stocks: [],
        summary: { totalScanned: 0, totalPullback: 0 },
        timestamp: new Date().toISOString(),
      };
      cache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
      return NextResponse.json(emptyResult);
    }

    // Step 2: Filter candidates.
    // Only filter by name (ST) here. Price/changePct filtering is skipped because real-time
    // quote fields are "-" outside trading hours (parsed as 0). The K-line analysis below
    // independently determines whether a stock had a limit-up + pullback, so we don't need
    // real-time quotes at this stage. Real-time enrichment happens in Step 4.
    const candidates = allStocks.filter(s => {
      // Exclude ST stocks (names containing ST)
      if (s.name.includes("ST") || s.name.includes("*ST")) return false;
      // Must be a proper stock code (6 digits) - already enforced in fetchAllStocks but keep as safety
      if (!/^\d{6}$/.test(s.code)) return false;
      return true;
    });

    // Step 3: For candidates, fetch K-line data to find limit-up days in past 2 weeks
    // Process in batches to avoid overwhelming the API.
    // NOTE: Outside trading hours changePct is 0 for all stocks, so the candidate list
    // is much larger (~5000 vs a few hundred during trading hours). We use a higher
    // batch size and a total time budget to keep response time reasonable.
    const pullbackStocks: PullbackStock[] = [];
    const BATCH_SIZE = 25; // higher concurrency to speed up off-hours scanning
    const TOTAL_BUDGET_MS = 55_000; // ~55s budget; return what we have if exceeded
    const startTime = Date.now();

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > TOTAL_BUDGET_MS) break;
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const klineResults = await Promise.allSettled(
        batch.map(s => fetchDailyKline(s.code, 15))
      );

      for (let j = 0; j < batch.length; j++) {
        const stock = batch[j];
        const klineResult = klineResults[j];

        if (klineResult.status !== "fulfilled") continue;
        const kline = klineResult.value;
        if (kline.length < 5) continue;

        // Already sorted by date ascending from Sina API

        // Find limit-up days in the past 2 weeks (last 10 K-line days)
        // Limit-up criteria: close >= prevClose * (1 + threshold)
        const recentKline = kline.slice(-10);
        let bestLimitUpIdx = -1;
        let bestLimitUpPct = 0;

        for (let k = 1; k < recentKline.length; k++) {
          const prevClose = recentKline[k - 1].close;
          const curClose = recentKline[k].close;
          const pct = ((curClose - prevClose) / prevClose) * 100;

          // Determine limit-up threshold based on board type
          const code = stock.code;
          let threshold = 9.5; // main board: 10%, with tolerance
          if (code.startsWith("688") || code.startsWith("30")) threshold = 19.5; // STAR/ChiNext: 20%
          if (code.startsWith("8")) threshold = 29.5; // BSE: 30%

          if (pct >= threshold) {
            // Found a limit-up day — pick the most recent one
            if (k > bestLimitUpIdx) {
              bestLimitUpIdx = k;
              bestLimitUpPct = pct;
            }
          }
        }

        if (bestLimitUpIdx < 1) continue; // No limit-up found

        // Calculate the absolute index in full kline
        const targetIdx = kline.length - recentKline.length + bestLimitUpIdx;
        if (targetIdx < 1) continue;

        const limitUpDay = kline[targetIdx];
        const preLimitUpDay = kline[targetIdx - 1];
        const limitUpClose = limitUpDay.close;
        const preLimitUpClose = preLimitUpDay.close;

        // Current price (latest K-line day)
        const latestDay = kline[kline.length - 1];
        const currentPrice = latestDay.close;

        // Must have declined from limit-up close
        if (currentPrice >= limitUpClose) continue;

        // Calculate pullback metrics
        const pullbackPct = ((limitUpClose - currentPrice) / limitUpClose) * 100;
        const totalRise = limitUpClose - preLimitUpClose;
        const currentDrop = limitUpClose - currentPrice;
        const approachPct = totalRise > 0 ? Math.min((currentDrop / totalRise) * 100, 100) : 0;

        // Only include stocks that have pulled back at least 30% toward pre-limit-up price
        if (approachPct < 30) continue;

        // Calculate days since limit-up
        const daysSinceLimitUp = kline.length - 1 - targetIdx;
        if (daysSinceLimitUp < 1) continue;

        // Calculate max pullback since limit-up
        let maxPullbackPct = 0;
        let maxPullbackDate = "";
        for (let k = targetIdx + 1; k < kline.length; k++) {
          const pb = ((limitUpClose - kline[k].close) / limitUpClose) * 100;
          if (pb > maxPullbackPct) {
            maxPullbackPct = pb;
            maxPullbackDate = kline[k].date;
          }
        }

        // Build K-line summary (from 2 days before limit-up to now)
        const summaryStart = Math.max(0, targetIdx - 2);
        const klineSummary = kline.slice(summaryStart).map(d => ({
          date: d.date,
          open: d.open,
          close: d.close,
          high: d.high,
          low: d.low,
          changePct: d.changePct,
        }));

        pullbackStocks.push({
          symbol: stock.code,
          name: stock.name,
          limitUpDate: limitUpDay.date,
          limitUpClose,
          preLimitUpClose,
          limitUpPct: bestLimitUpPct,
          currentPrice,
          currentChangePct: latestDay.changePct,
          pullbackPct,
          approachPct,
          daysSinceLimitUp,
          maxPullbackPct,
          maxPullbackDate,
          klineSummary,
          turnover: 0,
          marketCap: 0,
          volumeRatio: 0,
        });
      }
    }

    // Step 4: Fetch real-time quotes for enriched data
    if (pullbackStocks.length > 0) {
      const quotes = await fetchRealtimeQuotes(pullbackStocks.map(s => s.symbol));
      for (const stock of pullbackStocks) {
        const q = quotes.get(stock.symbol);
        if (q) {
          stock.currentPrice = q.price || stock.currentPrice;
          stock.currentChangePct = q.changePct || stock.currentChangePct;
          stock.turnover = q.turnover;
          stock.marketCap = q.marketCap;
          stock.volumeRatio = q.volumeRatio;
          // Recalculate with real-time price
          const totalRise = stock.limitUpClose - stock.preLimitUpClose;
          const currentDrop = stock.limitUpClose - stock.currentPrice;
          stock.approachPct = totalRise > 0 ? Math.min((currentDrop / totalRise) * 100, 100) : 0;
          stock.pullbackPct = ((stock.limitUpClose - stock.currentPrice) / stock.limitUpClose) * 100;
        }
      }
    }

    // Step 5: Sort by approachPct descending (most pullback first)
    pullbackStocks.sort((a, b) => b.approachPct - a.approachPct);

    const result: PullbackResult = {
      success: true,
      date: getTodayKey(),
      stocks: pullbackStocks,
      summary: {
        totalScanned: candidates.length,
        totalPullback: pullbackStocks.length,
      },
      timestamp: new Date().toISOString(),
    };

    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Limit-up pullback analysis error:", error);
    return NextResponse.json({
      success: false,
      date: getTodayKey(),
      stocks: [],
      summary: { totalScanned: 0, totalPullback: 0 },
      timestamp: new Date().toISOString(),
      error: error.message || "涨停回踩分析失败",
    } as PullbackResult);
  }
}
