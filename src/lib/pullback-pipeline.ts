// ── Shared data pipeline for 涨停回踩 screener + 盘前研判 ──
// Extracted from /api/stock/limit-up-pullback/route.ts so the pre-market
// snapshot engine reuses the exact same data sources (Sina calendar/kline,
// EM ZT pool, EM quotes) without duplicating request logic.
import { getAShareKLine } from "@/lib/ashare-api";
import { emRawJson } from "@/lib/em-raw-client";
import type { KLineDay } from "@/lib/pullback-metrics";

export type { KLineDay };

export interface PoolCandidate {
  code: string;
  name: string;
  poolDate: string; // "YYYY-MM-DD" — the (most recent) sealed limit-up day
}

export interface ChinaNow {
  date: string;      // "YYYY-MM-DD" 中国时区
  hour: number;
  minute: number;
  afterClose: boolean; // 是否已过 15:05（当日K线视为完成）
}

/** 中国时区当前时间（date/hour/minute），afterClose = 15:05 之后 */
export function getChinaNow(): ChinaNow {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = parseInt(get("hour"), 10) || 0;
  const minute = parseInt(get("minute"), 10) || 0;
  return {
    date,
    hour,
    minute,
    afterClose: hour > 15 || (hour === 15 && minute >= 5),
  };
}

/**
 * 由交易日历推定研判基准日（T-1 口径）：
 *  - 盘中（当天K线尚未完成）：剔除今天的形成中K线 → 基准 = 上一交易日
 *  - 盘前（无当天K线）：基准 = 日历最后一根
 *  - 收盘后（>=15:05）：保留今天 → 基准 = 今天（为次日盘前准备）
 * 返回 calBars = 剔除形成中K线后的日历条，basisDate = 其最后一根。
 */
export function computeBasisDate(tradeDates: string[]): { basisDate: string | null; calBars: string[] } {
  const { date: todayCN, afterClose } = getChinaNow();
  const calBars = [...tradeDates];
  if (!afterClose && calBars.length > 0 && calBars[calBars.length - 1] === todayCN) {
    calBars.pop();
  }
  return { basisDate: calBars.length ? calBars[calBars.length - 1] : null, calBars };
}

/** 剔除个股K线里的当日形成中K线（与 computeBasisDate 同一规则） */
export function stripFormingBar(kline: KLineDay[]): KLineDay[] {
  const { date: todayCN, afterClose } = getChinaNow();
  if (!afterClose && kline.length > 0 && kline[kline.length - 1].date === todayCN) {
    return kline.slice(0, -1);
  }
  return kline;
}

// ── Helper: trading calendar via Sina index daily kline ──
// Direct URL (NOT getAShareKLine) because toSinaSymbol maps "sh000001" to
// sz000001 (平安银行) — the Shanghai index needs the sh prefix preserved.
// Sina returns only trading days, so the bars ARE the trading calendar.
export async function fetchTradeDates(): Promise<string[]> {
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

// Module-level calendar cache (TTL 10 min) — the pre-market GET needs the
// calendar on every request only to check snapshot freshness.
let tradeDatesCache: { dates: string[]; ts: number } | null = null;

export async function getTradeDatesCached(ttlMs = 10 * 60 * 1000): Promise<string[]> {
  if (tradeDatesCache && Date.now() - tradeDatesCache.ts < ttlMs) return tradeDatesCache.dates;
  const dates = await fetchTradeDates();
  if (dates.length >= 2) tradeDatesCache = { dates, ts: Date.now() };
  return dates;
}

// ── Helper: EM 涨停股池 (sealed limit-up pool) for one date ──
// push2ex serves the pool of stocks that SEALED a limit-up on the given date.
// This replaces the old blind 5000-stock scan: candidates drop from ~5000 to
// a few hundred, cutting both scan time and upstream request volume ~20x.
export async function fetchZTPool(dateCompact: string): Promise<{ code: string; name: string }[]> {
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
export function withChangePct(days: KLineDay[]): KLineDay[] {
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
export async function fetchDailyKline(symbol: string, datalen: number = 15): Promise<KLineDay[]> {
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
// f14=名称 f20=总市值(元) f100=所属行业板块. f9 is PE(动态), NOT 量比 — do not use it here.
export async function fetchRealtimeQuotes(symbols: string[]): Promise<Map<string, { price: number; changePct: number; turnover: number; marketCap: number; volumeRatio: number; sector: string }>> {
  const result = new Map<string, { price: number; changePct: number; turnover: number; marketCap: number; volumeRatio: number; sector: string }>();
  if (symbols.length === 0) return result;

  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    const secIds = batch.map(code => `${code.startsWith("6") ? "1" : "0"}.${code}`);
    const url = `http://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f8,f10,f12,f14,f20,f100&secids=${secIds.join(",")}`;
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
        // f10 = 量比; f20 = 总市值(元) → 亿; f100 = 所属行业板块
        volumeRatio: parseFloat(item.f10) || 0,
        marketCap: (parseFloat(item.f20) || 0) / 1e8,
        sector: String(item.f100 || ""),
      });
    }
  }
  return result;
}
