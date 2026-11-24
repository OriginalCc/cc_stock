/**
 * Server-only EastMoney timeline (分时) fetcher.
 *
 * Uses the shared raw node:http client (src/lib/em-raw-client.ts) because:
 * 1. Next.js patches global fetch in dev; inside the dev server many requests to
 *    the push2/push2his family fail with "other side closed".
 * 2. The EM backends respond with the full body and then RST the connection;
 *    undici discards the already-received body. The raw client tolerates that.
 * 3. DNS round-robins across several backends, some of which drop connections
 *    outright. The raw client resolves A records itself and tries multiple IPs.
 *
 * Rate limiting: the trends endpoint family blocks per IP in bursts when polled
 * too hard (~50 req/min triggered multi-minute reset windows). Keep per-symbol
 * server TTLs high (8s timeline / 15s sector) and never poll this directly.
 */

import {
  toSinaSymbol,
  getAShareQuote,
  getTencentMinuteData,
  getSinaTimelineFallback,
  type AShareTimelineItem,
} from "@/lib/ashare-api";
import { emRawFetch } from "@/lib/em-raw-client";

// ── EastMoney 1-minute timeline (primary source) ──

const EM_HOSTS = ["push2.eastmoney.com", "push2delay.eastmoney.com"];
const EM_SCHEME = "http"; // https also works; plain http is what the sector panel already uses

function toTimelineSecid(symbol: string): string {
  const sina = toSinaSymbol(symbol);
  const code = sina.replace(/^(sh|sz)/, "");
  return sina.startsWith("sh") ? `1.${code}` : `0.${code}`;
}

/**
 * Fetch the 1-minute 分时 trend via EM trends2/get using the raw client.
 * Trend lines: "2026-11-04 09:30,open,price,high,low,volume(手),amount(元),avgPrice"
 */
export async function getEastMoneyTimeline(
  symbol: string
): Promise<{ items: AShareTimelineItem[]; prevClose: number }> {
  const secid = toTimelineSecid(symbol);
  const query = `/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0`;

  let trendsData: any = null;
  for (const host of EM_HOSTS) {
    const url = `${EM_SCHEME}://${host}${query}`;
    // 3 attempts per host: failures are mostly instant connection resets, cheap to retry
    for (let attempt = 0; attempt < 3 && !trendsData; attempt++) {
      try {
        const { status, body } = await emRawFetch(url, 8000);
        if (status !== 200) {
          console.error(`EM timeline ${host} HTTP ${status}`);
          break; // definitive status — don't retry same host
        }
        const data = JSON.parse(body);
        if (data?.data?.trends?.length > 0) trendsData = data.data;
      } catch (e: any) {
        if (attempt === 2) console.error(`EM timeline ${host} attempt failed:`, e?.message || e);
      }
    }
    if (trendsData) break;
  }

  if (!trendsData) return { items: [], prevClose: 0 };

  const emPrevClose = parseFloat(trendsData.preClose ?? trendsData.prePrice ?? 0) || 0;
  const trends: string[] = trendsData.trends;
  const items: AShareTimelineItem[] = [];

  for (const entry of trends) {
    if (typeof entry !== "string") continue;
    const parts = entry.split(",");
    if (parts.length < 8) continue;

    const timeStr = parts[0]; // "2026-11-04 09:30"
    const price = parseFloat(parts[2]);
    const volume = parseInt(parts[5]) || 0;
    const avgPriceRaw = parseFloat(parts[7]);

    if (isNaN(price) || price <= 0) continue;

    const timePart = timeStr.includes(" ") ? timeStr.split(" ")[1] : timeStr;
    const time = timePart.substring(0, 5); // "HH:MM"

    // v5.8: 低价股/ETF（价格<5元）保留3位小数，避免分时线变平线
    const priceDecimals = price < 5 ? 3 : 2;
    const avgIsFinite = Number.isFinite(avgPriceRaw) && avgPriceRaw > 0;
    const avgPrice = avgIsFinite ? avgPriceRaw : price;

    items.push({
      time,
      price: Number(price.toFixed(priceDecimals)),
      avgPrice: Number(avgPrice.toFixed(avgPrice < 5 ? 3 : 2)),
      volume,
      changePercent: emPrevClose > 0 ? Number((((price - emPrevClose) / emPrevClose) * 100).toFixed(2)) : 0,
    });
  }

  ensureLunchContinuity(items);

  return { items, prevClose: emPrevClose };
}

/**
 * Handle lunch break transition: keep a 13:00 entry for line continuity.
 */
function ensureLunchContinuity(items: AShareTimelineItem[]): void {
  const has1300 = items.some(item => item.time === "13:00");
  if (has1300 || items.length === 0) return;

  const lastMorningItem = [...items].reverse().find(item => {
    const hour = parseInt(item.time.split(":")[0]);
    return hour <= 11;
  });
  if (!lastMorningItem) return;

  const insertIdx = items.findIndex(item => {
    const hour = parseInt(item.time.split(":")[0]);
    return hour >= 13;
  });
  const new1300: AShareTimelineItem = {
    time: "13:00",
    price: lastMorningItem.price,
    avgPrice: lastMorningItem.avgPrice,
    volume: 0,
    changePercent: lastMorningItem.changePercent,
  };
  if (insertIdx >= 0) {
    items.splice(insertIdx, 0, new1300);
  } else {
    items.push(new1300);
  }
}

// ── Last-good timeline cache (degradation guard) ──

const LAST_GOOD_TIMELINE_TTL = 15 * 60 * 1000; // 15 min — covers outage bursts and the lunch break
const lastGoodTimeline = new Map<string, { items: AShareTimelineItem[]; prevClose: number; timestamp: number }>();

/** True when most adjacent slots are 1 minute apart (i.e. NOT the degraded 5-min fallback). */
function isOneMinuteGrade(items: AShareTimelineItem[]): boolean {
  if (items.length < 5) return false;
  let oneMin = 0;
  let intervals = 0;
  for (let i = 1; i < items.length; i++) {
    const [h1, m1] = items[i - 1].time.split(":").map(Number);
    const [h2, m2] = items[i].time.split(":").map(Number);
    const delta = h2 * 60 + m2 - (h1 * 60 + m1);
    if (delta > 0) { intervals++; if (delta === 1) oneMin++; }
  }
  return intervals > 0 && oneMin >= intervals * 0.6;
}

function rememberLastGoodTimeline(symbol: string, result: { items: AShareTimelineItem[]; prevClose: number }): void {
  if (result.items.length > 0 && isOneMinuteGrade(result.items)) {
    lastGoodTimeline.set(symbol, { items: result.items, prevClose: result.prevClose, timestamp: Date.now() });
  }
}

// ── Public pipeline ──

/**
 * Get intraday timeline data for 分时图 (server-only).
 * Primary: EastMoney trends2/get (1-minute data with real VWAP; tencent WAF-blocked since 2026-11)
 * Fallback 1: Tencent minute API (real 1-minute data, may be WAF-blocked)
 * Fallback 2: last good 1-minute timeline (degradation guard, ≤15 min old)
 * Fallback 3: Sina 5-min K-line (degraded granularity, last resort)
 */
export async function getAShareTimeline(
  symbol: string,
  prevCloseFromQuote?: number
): Promise<{ items: AShareTimelineItem[]; prevClose: number }> {
  const sinaSymbol = toSinaSymbol(symbol);

  const quotePromise = prevCloseFromQuote
    ? Promise.resolve({ prevClose: prevCloseFromQuote } as any)
    : getAShareQuote(symbol);

  // ── Primary: EastMoney trends2/get (raw client — bypasses Next's patched fetch) ──
  try {
    const [quote, emResult] = await Promise.all([
      quotePromise.catch(() => null),
      getEastMoneyTimeline(symbol),
    ]);
    const prevClose = quote?.prevClose || emResult.prevClose || prevCloseFromQuote || 0;
    if (emResult.items.length > 0) {
      if (prevClose > 0 && emResult.items.some(item => item.changePercent === 0)) {
        for (const item of emResult.items) {
          item.changePercent = Number((((item.price - prevClose) / prevClose) * 100).toFixed(2));
        }
      }
      const result = { items: emResult.items, prevClose };
      rememberLastGoodTimeline(symbol, result);
      return result;
    }
  } catch (error) {
    console.error("EastMoney timeline fetch error:", error);
  }

  // ── Fallback 1: Tencent minute API ──
  try {
    const [quote, tencentResult] = await Promise.all([
      quotePromise,
      getTencentMinuteData(sinaSymbol, prevCloseFromQuote || 0, symbol),
    ]);
    const prevClose = quote?.prevClose || tencentResult.prevClose || 0;
    if (tencentResult.items.length > 0) {
      if (prevClose > 0 && tencentResult.items.some(item => item.changePercent === 0)) {
        for (const item of tencentResult.items) {
          item.changePercent = Number((((item.price - prevClose) / prevClose) * 100).toFixed(2));
        }
      }
      const result = { items: tencentResult.items, prevClose };
      rememberLastGoodTimeline(symbol, result);
      return result;
    }
  } catch (error) {
    console.error("Tencent minute data fetch error:", error);
  }

  // ── Fallback 2: last good 1-minute timeline ──
  const lastGood = lastGoodTimeline.get(symbol);
  if (lastGood && Date.now() - lastGood.timestamp < LAST_GOOD_TIMELINE_TTL) {
    return { items: lastGood.items.map(item => ({ ...item })), prevClose: lastGood.prevClose };
  }

  // ── Fallback 3: Sina 5-min K-line ──
  try {
    const quote = await quotePromise;
    const prevClose = quote?.prevClose || 0;
    const sinaResult = await getSinaTimelineFallback(sinaSymbol, prevClose);
    if (sinaResult.items.length > 0) {
      return sinaResult;
    }
    return { items: [], prevClose };
  } catch (error) {
    console.error("Sina timeline fallback error:", error);
    return { items: [], prevClose: 0 };
  }
}
