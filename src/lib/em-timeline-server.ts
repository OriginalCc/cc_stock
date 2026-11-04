/**
 * Server-only EastMoney timeline (分时) fetcher.
 *
 * WHY RAW node:http INSTEAD OF GLOBAL fetch:
 * 1. Next.js patches global fetch in dev; inside the dev server every request to
 *    the push2/push2his family failed with "other side closed", while the same
 *    request from a standalone node process succeeds most of the time.
 * 2. The EastMoney backends respond with the full body and then RST the
 *    connection (aggressive keep-alive killing + rate limiting). undici treats
 *    that premature close as fatal and DISCARDS the already-received body;
 *    curl tolerates it. Our raw client accumulates the body and accepts it when
 *    it parses as JSON, even if the socket ends abnormally.
 * 3. DNS round-robins across several backends, some of which drop connections
 *    outright. We resolve A records ourselves and try multiple IPs.
 *
 * Rate limiting: the trends endpoint family blocks per IP in bursts when polled
 * too hard (~50 req/min triggered multi-minute reset windows). Keep per-symbol
 * server TTLs high (8s timeline / 15s sector) and never poll this directly.
 */

import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import {
  toSinaSymbol,
  getAShareQuote,
  getTencentMinuteData,
  getSinaTimelineFallback,
  type AShareTimelineItem,
} from "@/lib/ashare-api";

// ── Raw HTTP(S) client that tolerates premature connection close ──

interface RawFetchResult {
  status: number;
  body: string;
}

function dnsResolve4(hostname: string): Promise<string[]> {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, ips) => resolve(err || !Array.isArray(ips) ? [] : ips));
  });
}

/** Single attempt against one host/IP. Rejects when nothing usable arrived. */
function rawHttpFetchOnce(url: string, host: string, timeoutMs: number): Promise<RawFetchResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === "https:";
    const mod = isHttps ? https : http;
    const port = u.port ? Number(u.port) : isHttps ? 443 : 80;

    let settled = false;
    const ok = (status: number, body: string) => {
      if (!settled) { settled = true; resolve({ status, body }); }
    };
    const fail = (e: Error) => {
      if (!settled) { settled = true; reject(e); }
    };

    let body = "";
    let statusCode = 0;

    const req = mod.request(
      {
        host,
        port,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          Host: u.host,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "*/*",
          Connection: "close",
        },
        timeout: timeoutMs,
      },
      (res) => {
        statusCode = res.statusCode ?? 0;
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => { body += chunk; });
        res.on("end", () => ok(statusCode, body));
        // Premature close mid-body: the eastmoney backends do this routinely
        // (full body + immediate RST). Accept whatever JSON we accumulated.
        res.on("close", () => {
          if (!settled) {
            if (body.trim().startsWith("{")) ok(statusCode, body);
            else fail(new Error(`connection closed early (status ${statusCode}, ${body.length} bytes)`));
          }
        });
        res.on("error", (e) => {
          if (!settled) {
            if (body.trim().startsWith("{")) ok(statusCode, body);
            else fail(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => fail(e instanceof Error ? e : new Error(String(e))));
    req.end();
  });
}

/** Try the hostname plus every resolved A record until one yields a body. */
async function rawHttpFetch(url: string, timeoutMs = 8000): Promise<RawFetchResult> {
  const u = new URL(url);
  const candidates = [u.hostname];
  for (const ip of await dnsResolve4(u.hostname)) {
    if (!candidates.includes(ip)) candidates.push(ip);
  }
  let lastErr: Error = new Error("no endpoints resolved");
  for (const host of candidates) {
    try {
      return await rawHttpFetchOnce(url, host, timeoutMs);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}

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
        const { status, body } = await rawHttpFetch(url, 8000);
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
