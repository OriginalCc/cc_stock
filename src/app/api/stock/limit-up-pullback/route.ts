import { NextRequest, NextResponse } from "next/server";
import {
  fetchTradeDates,
  fetchZTPool,
  fetchDailyKline,
  fetchRealtimeQuotes,
  type KLineDay,
  type PoolCandidate,
} from "@/lib/pullback-pipeline";

export const dynamic = "force-dynamic";

// ── Server-side Cache ───────────────────────────────────
// Per-entry TTL: full results live 10 min; empty/failed results only 60 s so a
// transient data-source outage never sticks as "no data" for 10 minutes.
const cache = new Map<string, { data: PullbackResult; timestamp: number; ttl: number }>();
const CACHE_TTL_FULL = 10 * 60 * 1000;
const CACHE_TTL_EMPTY = 60 * 1000;

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

// ── Main handler ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheKey = `pullback-${getTodayKey()}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < cached.ttl) {
    return NextResponse.json({ ...cached.data, cached: true });
  }
  // If forceRefresh, invalidate the stale cache entry so a fresh result gets stored
  if (forceRefresh) {
    cache.delete(cacheKey);
  }

  const storeAndReturn = (data: PullbackResult) => {
    cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl: data.success && data.stocks.length > 0 ? CACHE_TTL_FULL : CACHE_TTL_EMPTY,
    });
    return NextResponse.json(data);
  };

  const failResult = (error: string): PullbackResult => ({
    success: false,
    date: getTodayKey(),
    stocks: [],
    summary: { totalScanned: 0, totalPullback: 0 },
    timestamp: new Date().toISOString(),
    error,
  });

  try {
    // Step 1: trading calendar (last 11 trading days from Sina index kline)
    const tradeDates = await fetchTradeDates();
    if (tradeDates.length < 2) {
      return storeAndReturn(failResult("交易日历获取失败（新浪接口不可用），请稍后刷新重试"));
    }

    // Step 2: 涨停股池 per day, most recent first, excluding today.
    // A stock whose most-recent seal was TODAY can never satisfy
    // daysSinceLimitUp >= 1, so its pool is not queried.
    const poolDates = tradeDates.slice(0, -1).slice(-10);
    const candidates = new Map<string, PoolCandidate>(); // insertion order: most recent seal first
    const POOL_CONCURRENCY = 3;
    let poolDaysOk = 0;

    for (let i = 0; i < poolDates.length; i += POOL_CONCURRENCY) {
      const batch = poolDates.slice(i, i + POOL_CONCURRENCY).reverse();
      const results = await Promise.allSettled(batch.map(d => fetchZTPool(d.replaceAll("-", ""))));
      for (let j = 0; j < batch.length; j++) {
        const r = results[j];
        if (r.status !== "fulfilled") continue;
        poolDaysOk++;
        for (const c of r.value) {
          if (!candidates.has(c.code)) candidates.set(c.code, { ...c, poolDate: batch[j] });
        }
      }
    }

    if (poolDaysOk === 0) {
      return storeAndReturn(failResult("涨停股池数据源暂时不可用（东财接口拦截），请稍后刷新重试"));
    }

    // Step 3: per-candidate K-line analysis (Sina primary, EM fallback).
    // K-line fetch failures are tracked so a total outage is reported as an
    // error instead of silently returning "0 results".
    const candList = Array.from(candidates.values());
    const pullbackStocks: PullbackStock[] = [];
    let klineOk = 0;
    let klineFailed = 0;
    const BATCH_SIZE = 30;
    const TOTAL_BUDGET_MS = 45_000;
    const startTime = Date.now();

    for (let i = 0; i < candList.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > TOTAL_BUDGET_MS) break;
      const batch = candList.slice(i, i + BATCH_SIZE);
      const klineResults = await Promise.allSettled(
        batch.map(s => fetchDailyKline(s.code, 15))
      );

      for (let j = 0; j < batch.length; j++) {
        const stock = batch[j];
        const klineResult = klineResults[j];

        if (klineResult.status !== "fulfilled" || klineResult.value.length < 5) {
          klineFailed++;
          continue;
        }
        const kline = klineResult.value;
        klineOk++;

        // Locate the sealed limit-up day (by date) in the kline
        const targetIdx = kline.findIndex(d => d.date === stock.poolDate);
        if (targetIdx < 1) continue;

        // Sanity-check the limit-up itself from closes (board-aware threshold)
        const prevClose = kline[targetIdx - 1].close;
        const limitUpDay = kline[targetIdx];
        const pct = prevClose > 0 ? ((limitUpDay.close - prevClose) / prevClose) * 100 : 0;
        const code = stock.code;
        let threshold = 9.5; // main board: 10%, with tolerance
        if (code.startsWith("688") || code.startsWith("30")) threshold = 19.5; // STAR/ChiNext: 20%
        if (pct < threshold) continue;

        const limitUpClose = limitUpDay.close;
        const preLimitUpClose = prevClose;

        // Penny-stock exclusion (same spirit as the old f18 pre-filter)
        if (preLimitUpClose < 2) continue;

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
          limitUpPct: pct,
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

    // All K-lines failed while candidates existed → data-source outage, not "no results"
    if (klineOk === 0 && klineFailed > 0) {
      return storeAndReturn(failResult("K线数据源暂时不可用（新浪+东财均失败），请稍后刷新重试"));
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
          stock.sector = q.sector || stock.sector || "";
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
        totalScanned: candList.length,
        totalPullback: pullbackStocks.length,
      },
      timestamp: new Date().toISOString(),
    };

    return storeAndReturn(result);
  } catch (error: any) {
    console.error("Limit-up pullback analysis error:", error);
    return storeAndReturn(failResult(error?.message || "涨停回踩分析失败"));
  }
}
