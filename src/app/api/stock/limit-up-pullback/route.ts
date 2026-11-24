import { NextRequest, NextResponse } from "next/server";
import { getAShareKLine } from "@/lib/ashare-api";
import { emRawJson } from "@/lib/em-raw-client";

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

interface KLineDay {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number;
}

interface PoolCandidate {
  code: string;
  name: string;
  poolDate: string; // "YYYY-MM-DD" — the (most recent) sealed limit-up day
}

// ── Helper: trading calendar via Sina index daily kline ──
// Direct URL (NOT getAShareKLine) because toSinaSymbol maps "sh000001" to
// sz000001 (平安银行) — the Shanghai index needs the sh prefix preserved.
// Sina returns only trading days, so the bars ARE the trading calendar.
async function fetchTradeDates(): Promise<string[]> {
  try {
    const url = "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh000001&scale=240&ma=no&datalen=12";
    const res = await fetch(url, {
      headers: { "Referer": "https://finance.sina.com.cn" },
      cache: "no-store" as RequestCache,
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!text || text === "null") return [];
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr.map((d: any) => String(d?.day || "")).filter(Boolean).slice(-11);
  } catch {
    return [];
  }
}

// ── Helper: EM 涨停股池 (sealed limit-up pool) for one date ──
// push2ex serves the pool of stocks that SEALED a limit-up on the given date.
// This replaces the old blind 5000-stock scan: candidates drop from ~5000 to
// a few hundred, cutting both scan time and upstream request volume ~20x.
async function fetchZTPool(dateCompact: string): Promise<{ code: string; name: string }[]> {
  const url = `http://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=1000&sort=fbt%3Aasc&date=${dateCompact}`;
  const json = await emRawJson(url, 2, 8000);
  const pool = json?.data?.pool;
  if (!Array.isArray(pool)) return [];

  const out: { code: string; name: string }[] = [];
  for (const item of pool) {
    const code = String(item?.c || "");
    const name = String(item?.n || "");
    if (!/^\d{6}$/.test(code)) continue;
    // BSE (北交所 43/83/87/92) and B-shares were never in the old scan universe
    if (code.startsWith("8") || code.startsWith("4") || code.startsWith("9")) continue;
    if (name.includes("ST")) continue;
    out.push({ code, name });
  }
  return out;
}

// ── Helper: compute per-day changePct from closes (sina kline lacks it) ──
function withChangePct(days: KLineDay[]): KLineDay[] {
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1].close;
    days[i].changePct = prev > 0 ? ((days[i].close - prev) / prev) * 100 : 0;
  }
  if (days.length > 0) days[0].changePct = 0;
  return days;
}

// ── Helper: daily K-line, Sina primary + EM push2his fallback ──
// Sina CN_MarketData works inside the dev server with plain fetch and is a
// different infrastructure from EM (diversified failure domains). EM push2his
// (currently in a bad window / RST-happy) stays as fallback via the raw client.
async function fetchDailyKline(symbol: string, datalen: number = 15): Promise<KLineDay[]> {
  // 1) Sina daily kline (unadjusted — same basis as EM fqt=0)
  const sina = await getAShareKLine(symbol, 240, datalen);
  if (sina.length > 0) {
    return withChangePct(sina.map(d => ({
      date: d.date,
      open: d.open,
      close: d.close,
      high: d.high,
      low: d.low,
      changePct: 0,
    })));
  }

  // 2) EM push2his fallback (raw client: multi-IP + tolerate premature close)
  try {
    const secid = symbol.startsWith("6") ? `1.${symbol}` : `0.${symbol}`;
    const now = new Date();
    const begDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
    const beg = `${begDate.getFullYear()}${String(begDate.getMonth() + 1).padStart(2, "0")}${String(begDate.getDate()).padStart(2, "0")}`;
    const query = `/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=0&beg=${beg}&end=20500101&fields1=f1&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
    const json = await emRawJson(
      [`http://push2his.eastmoney.com${query}`, `https://push2his.eastmoney.com${query}`],
      1,
      8000
    );
    const klines: string[] = json?.data?.klines;
    if (!Array.isArray(klines) || klines.length === 0) return [];

    const parsed: KLineDay[] = klines.map((line: string) => {
      const parts = line.split(",");
      return {
        date: parts[0] || "",
        open: parseFloat(parts[1]) || 0,
        close: parseFloat(parts[2]) || 0,
        high: parseFloat(parts[3]) || 0,
        low: parseFloat(parts[4]) || 0,
        changePct: parseFloat(parts[8]) || 0,
      };
    }).filter((d: KLineDay) => d.close > 0);

    return parsed.slice(-datalen);
  } catch {
    return [];
  }
}

// ── Helper: real-time quote enrichment via EM ulist (raw client) ──
// Field map (EM standard): f2=最新价 f3=涨跌幅 f8=换手率 f10=量比 f12=代码
// f14=名称 f20=总市值(元). f9 is PE(动态), NOT 量比 — do not use it here.
async function fetchRealtimeQuotes(symbols: string[]): Promise<Map<string, { price: number; changePct: number; turnover: number; marketCap: number; volumeRatio: number }>> {
  const result = new Map<string, { price: number; changePct: number; turnover: number; marketCap: number; volumeRatio: number }>();
  if (symbols.length === 0) return result;

  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    const secIds = batch.map(code => `${code.startsWith("6") ? "1" : "0"}.${code}`);
    const url = `http://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f8,f10,f12,f14,f20&secids=${secIds.join(",")}`;
    const json = await emRawJson(url, 3, 8000);
    const diff = json?.data?.diff;
    if (!Array.isArray(diff)) continue;

    for (const item of diff) {
      const code = String(item.f12 || "");
      if (!code) continue;
      result.set(code, {
        price: parseFloat(item.f2) || 0,
        changePct: parseFloat(item.f3) || 0,
        turnover: parseFloat(item.f8) || 0,
        // f10 = 量比; f20 = 总市值(元) → 亿
        volumeRatio: parseFloat(item.f10) || 0,
        marketCap: (parseFloat(item.f20) || 0) / 1e8,
      });
    }
  }
  return result;
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
