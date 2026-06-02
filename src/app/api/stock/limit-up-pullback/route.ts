import { NextRequest, NextResponse } from "next/server";
import { toSinaSymbol } from "@/lib/ashare-api";

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
async function fetchAllStocks(): Promise<RawStock[]> {
  const allStocks: RawStock[] = [];
  const pageSize = 500;
  let page = 1;

  try {
    // First page to get total count
    const firstUrl = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f4,f12,f14`;
    const firstRes = await fetch(firstUrl, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000),
      headers: { "Referer": "https://quote.eastmoney.com/" },
    });
    if (!firstRes.ok) return [];
    const firstJson = await firstRes.json();
    const total = firstJson?.data?.total || 0;
    const firstDiff = firstJson?.data?.diff;
    if (Array.isArray(firstDiff)) {
      for (const item of firstDiff) {
        const code = String(item.f12 || "");
        if (!code) continue;
        allStocks.push({
          code,
          name: String(item.f14 || ""),
          price: parseFloat(item.f2) || 0,
          changePct: parseFloat(item.f3) || 0,
          prevClose: parseFloat(item.f4) || 0,
        });
      }
    }

    // Fetch remaining pages in parallel
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages > 1) {
      const pagePromises = [];
      for (page = 2; page <= totalPages; page++) {
        const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f4,f12,f14`;
        pagePromises.push(
          fetch(url, {
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(10000),
            headers: { "Referer": "https://quote.eastmoney.com/" },
          })
            .then(r => r.json())
            .then(json => {
              const diff = json?.data?.diff;
              if (Array.isArray(diff)) {
                for (const item of diff) {
                  const code = String(item.f12 || "");
                  if (!code) continue;
                  allStocks.push({
                    code,
                    name: String(item.f14 || ""),
                    price: parseFloat(item.f2) || 0,
                    changePct: parseFloat(item.f3) || 0,
                    prevClose: parseFloat(item.f4) || 0,
                  });
                }
              }
            })
            .catch(() => {})
        );
      }
      await Promise.allSettled(pagePromises);
    }
  } catch {
    // ignore
  }

  return allStocks.filter(s => s.price > 0);
}

// ── Helper: Fetch daily K-line via Sina ────────────────
async function fetchDailyKline(symbol: string, datalen: number = 15): Promise<KLineDay[]> {
  try {
    const sinaSymbol = toSinaSymbol(symbol);
    const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sinaSymbol}&scale=240&ma=no&datalen=${datalen}`;
    const res = await fetch(url, {
      headers: { "Referer": "https://finance.sina.com.cn" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(6000),
    });
    const text = await res.text();
    if (!text || text === "null") return [];
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];

    // Parse K-line and compute daily change % using close vs previous close
    const parsed = data.map((item: any) => ({
      date: item.day || item.date || "",
      open: parseFloat(item.open) || 0,
      close: parseFloat(item.close) || 0,
      high: parseFloat(item.high) || 0,
      low: parseFloat(item.low) || 0,
      changePct: 0, // will be calculated below
    })).filter((d: KLineDay) => d.close > 0);

    // Calculate daily change pct: (close - prevClose) / prevClose
    for (let i = 0; i < parsed.length; i++) {
      if (i === 0) {
        parsed[i].changePct = 0;
      } else {
        const prevClose = parsed[i - 1].close;
        parsed[i].changePct = prevClose > 0 ? ((parsed[i].close - prevClose) / prevClose) * 100 : 0;
      }
    }

    return parsed;
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
  const cacheKey = `pullback-${getTodayKey()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cached.data, cached: true });
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

    // Step 2: Filter candidates - stocks currently negative or small positive (potential pullback)
    // We look at stocks with current change <= +3% (they've been declining from a recent high)
    // and price > 2 (filter out very cheap stocks)
    const candidates = allStocks.filter(s => {
      // Must have valid price
      if (s.price < 2) return false;
      // Current change should be small or negative (suggests pullback from a high)
      if (s.changePct > 5) return false; // still surging, not pulling back
      // Exclude ST stocks (names containing ST)
      if (s.name.includes("ST") || s.name.includes("*ST")) return false;
      // Must be a proper stock code (6 digits)
      if (!/^\d{6}$/.test(s.code)) return false;
      return true;
    });

    // Step 3: For candidates, fetch K-line data to find limit-up days in past 2 weeks
    // Process in batches to avoid overwhelming the API
    const pullbackStocks: PullbackStock[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
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
