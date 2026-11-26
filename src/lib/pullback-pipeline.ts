// ── Shared data pipeline for 涨停回踩 screener + 盘前研判 ──
// Extracted from /api/stock/limit-up-pullback/route.ts so the pre-market
// snapshot engine reuses the exact same data sources (Sina calendar/kline,
// EM ZT pool, EM quotes) without duplicating request logic.
import { getAShareKLine } from "@/lib/ashare-api";
import { emRawJson, emRawFetch } from "@/lib/em-raw-client";
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
export async function fetchZTPool(dateCompact: string): Promise<{ code: string; name: string; sector?: string }[]> {
  const url = `http://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=1000&sort=fbt%3Aasc&date=${dateCompact}`;
  const json = await emRawJson(url, 2, 8000);
  const pool = json?.data?.pool;
  if (!Array.isArray(pool)) return [];

  const out: { code: string; name: string; sector?: string }[] = [];
  for (const item of pool) {
    const code = String(item?.c || "");
    const name = String(item?.n || "");
    if (!/^\d{6}$/.test(code)) continue;
    // BSE (北交所 43/83/87/92) and B-shares were never in the old scan universe
    if (code.startsWith("8") || code.startsWith("4") || code.startsWith("9")) continue;
    if (name.includes("ST")) continue;
    // Task 46: hybk = 行业板块（东财行业口径，与 f100 同族）——盘前研判的板块共振因子无需额外请求
    const sector = String(item?.hybk || "").trim();
    out.push({ code, name, sector: sector || undefined });
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
  // Task 40: 保留成交量（缩量回踩/放量出逃判定的数据基础），KLineDay.volume
  const sina = await getAShareKLine(symbol, 240, datalen);
  if (sina.length > 0) {
    return withChangePct(sina.map(d => ({
      date: d.date,
      open: d.open,
      close: d.close,
      high: d.high,
      low: d.low,
      volume: d.volume,
      changePct: 0,
    })));
  }

  // 2) EM push2his fallback (raw client: multi-IP + tolerate premature close)
  // Task 40: 回看窗口 35→60 自然日（配合主流程取 40 个交易日：涨停前 MA20/趋势需要）
  try {
    const secid = symbol.startsWith("6") ? `1.${symbol}` : `0.${symbol}`;
    const now = new Date();
    const begDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const beg = `${begDate.getFullYear()}${String(begDate.getMonth() + 1).padStart(2, "0")}${String(begDate.getDate()).padStart(2, "0")}`;
    const query = `/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=0&beg=${beg}&end=20500101&fields1=f1&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
    const json = await emRawJson(
      [`http://push2his.eastmoney.com${query}`, `https://push2his.eastmoney.com${query}`],
      1,
      8000
    );
    const klines: string[] = json?.data?.klines;
    if (!Array.isArray(klines) || klines.length === 0) return [];

    // f51=日期 f52=开 f53=收 f54=高 f55=低 f56=成交量(手) f57=成交额 ...
    const parsed: KLineDay[] = klines.map((line: string) => {
      const parts = line.split(",");
      return {
        date: parts[0] || "",
        open: parseFloat(parts[1]) || 0,
        close: parseFloat(parts[2]) || 0,
        high: parseFloat(parts[3]) || 0,
        low: parseFloat(parts[4]) || 0,
        volume: parseFloat(parts[5]) || 0,
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

  // 多域名变体：push2delay（延时行情、限流宽松）优先，push2 兜底；http/https 各一份。
  // DNS 轮询的后端有的会直接断连，emRawJson 会对每个变体各试 attemptsPerUrl 次。
  const QUOTE_URL_VARIANTS = (secIds: string) => [
    `http://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f8,f10,f12,f14,f20,f100&secids=${secIds}`,
    `https://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f8,f10,f12,f14,f20,f100&secids=${secIds}`,
    `http://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f8,f10,f12,f14,f20,f100&secids=${secIds}`,
    `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f8,f10,f12,f14,f20,f100&secids=${secIds}`,
  ];

  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    const secIds = batch.map(code => `${code.startsWith("6") ? "1" : "0"}.${code}`).join(",");
    // 批间退避：本调用紧跟在 K 线批量抓取之后，EM push2 族按突发限流。
    // 首批前也退避 400ms——限流窗口内立即请求易被 RST，导致整批失败（板块/换手/市值/量比全空）。
    await new Promise(r => setTimeout(r, i === 0 ? 400 : 250));
    const json = await emRawJson(QUOTE_URL_VARIANTS(secIds), 2, 8000);
    let diff = json?.data?.diff;
    // 整批失败（限流/断连）→ 退避 1.2s 后对同批做一次重试
    if (!Array.isArray(diff)) {
      await new Promise(r => setTimeout(r, 1200));
      const retry = await emRawJson(QUOTE_URL_VARIANTS(secIds), 1, 8000);
      diff = retry?.data?.diff;
      if (!Array.isArray(diff)) continue;
    }

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
        // fltt=2 下缺失字段返回字符串 "-"，需归一化为空串避免前端显示脏值
        sector: item.f100 && item.f100 !== "-" ? String(item.f100) : "",
      });
    }
  }
  return result;
}

// ── 概念板块：个股所属概念（slist）+ 概念全集（clist m:90+t:3） ──

export interface StockBoard {
  code: string;   // BK 代码
  name: string;   // 板块名称
  changePct: number; // 板块当日涨跌幅%（用于挑选最活跃概念）
}

// 风格/资金/指数成分类"伪概念"（EM 把它们也归在 t:3 概念族里，需剔除）
// （hot-concepts 路由也复用此正则剔除风格板块）
export const STYLE_TAG_RE = /昨日|涨停|连板|多板|触板|首板|振幅|次新|重仓|减仓|增仓|持股|融资|融券|股通|MSCI|标普|富时|证金|汇金|QFII|社保|券商|保险|信托|基金|破净|市盈|市净|成长股|微盘|大盘股|中盘股|小盘股|百元股|低价股|高价股|高送转|分拆|举牌|回购|转债|白马|蓝筹|题材股|热股|人气|龙虎榜|大宗交易|高质押|转融券|连续上涨|连续下跌|连续亏损|连续盈利|新高|新低|预盈|预亏|茅指数|宁组合|AH股|AB股|GDR|ST/;
// 模块级缓存：概念板块全集 BK 代码（1 小时，避免每次选股都翻 3 页全量列表）
let conceptBoardCodesCache: { codes: Set<string>; ts: number } | null = null;

// EM push2 系按突发限流：连续快速请求会被 RST。带退避间隔的 JSON 抓取（复用多 IP 原始客户端）
async function fetchJsonWithBackoff(urlVariants: string[], maxAttempts = 3): Promise<any | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const url = urlVariants[i % urlVariants.length];
    try {
      const { status, body } = await emRawFetch(url, 6000);
      if (status === 200) return JSON.parse(body);
    } catch {
      // RST/提前断连 → 退避后重试
    }
    await new Promise(r => setTimeout(r, 250 + i * 200));
  }
  return null;
}

/** 分页抓取东财板块列表的 BK 代码（fs=m:90+t:N；N=2 行业/3 概念；带退避重试+截止时间） */
async function fetchBoardCodesPaged(fsFamily: string, maxPages: number, deadlineMs = 10_000): Promise<Set<string>> {
  const codes = new Set<string>();
  let total = 0;
  const t0 = Date.now();
  const pageUrls = (pn: number) => [
    `http://push2delay.eastmoney.com/api/qt/clist/get?pn=${pn}&pz=200&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${fsFamily}&fields=f12,f14`,
    `https://push2delay.eastmoney.com/api/qt/clist/get?pn=${pn}&pz=200&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${fsFamily}&fields=f12,f14`,
  ];
  for (let pn = 1; pn <= maxPages; pn++) {
    if (Date.now() - t0 > deadlineMs) break; // 被限流时尽快退出，降级后续模式
    const json = await fetchJsonWithBackoff(pageUrls(pn));
    const diff = json?.data?.diff;
    if (!Array.isArray(diff) || diff.length === 0) break;
    for (const it of diff) {
      const c = String(it.f12 || "");
      if (/^BK\d+/.test(c)) codes.add(c);
    }
    total = Number(json?.data?.total) || total;
    if (total > 0 && codes.size >= total) break;
  }
  return codes;
}

/** 概念板块全集（t:3，554 个，缓存 1h）—— 用于把 slist 返回的板块精确归类为"概念" */
export async function getConceptBoardCodes(): Promise<Set<string>> {
  if (conceptBoardCodesCache && Date.now() - conceptBoardCodesCache.ts < 3600_000) {
    return conceptBoardCodesCache.codes;
  }
  const codes = await fetchBoardCodesPaged("m:90+t:3", 6, 12_000);
  if (codes.size > 0) conceptBoardCodesCache = { codes, ts: Date.now() };
  return codes;
}

// 行业板块全集（t:2，仅 86 个，响应体小、抗限流）—— 降级模式下精确排除行业
let industryBoardCodesCache: { codes: Set<string>; ts: number } | null = null;

/** 行业板块全集（t:2，缓存 1h；仅用于排除，抓取失败时空集） */
export async function getIndustryBoardCodes(): Promise<Set<string>> {
  if (industryBoardCodesCache && Date.now() - industryBoardCodesCache.ts < 3600_000) {
    return industryBoardCodesCache.codes;
  }
  const codes = await fetchBoardCodesPaged("m:90+t:2", 2, 8_000);
  if (codes.size > 0) industryBoardCodesCache = { codes, ts: Date.now() };
  return codes;
}

/** 个股所属全部板块（行业+概念+地区+风格，slist 单股接口，20 个以内） */
export async function fetchStockBoards(symbol: string): Promise<StockBoard[]> {
  const secid = symbol.startsWith("6") ? `1.${symbol}` : `0.${symbol}`;
  const url = `http://push2.eastmoney.com/api/qt/slist/get?spt=3&fltt=2&invt=2&fields=f12,f14,f3&secid=${secid}&pn=1&po=1&np=1&ut=b2884a393a59ad64002292a3e90d46a5&fs=b:BK0000~`;
  const json = await emRawJson(url, 2, 8000);
  const diff = json?.data?.diff;
  if (!Array.isArray(diff)) return [];
  return diff
    .map((it: any) => ({
      code: String(it.f12 || ""),
      name: String(it.f14 || ""),
      changePct: parseFloat(it.f3) || 0,
    }))
    .filter((b: StockBoard) => /^BK\d+/.test(b.code));
}

// 模块级概念结果缓存：盘中板块归属不变，30 分钟内复用，避免每次选股重复发 255 个 slist 请求
const conceptResultCache = new Map<string, { names: string[]; ts: number }>();
const CONCEPT_RESULT_TTL = 30 * 60 * 1000;

/** 带缓存的概念解析（slist + pickTopConcepts；空结果不缓存，下次重试） */
export async function resolveStockConcepts(
  symbol: string,
  conceptCodes: Set<string> | null,
  sector: string | undefined,
  industryCodes: Set<string> | null
): Promise<string[]> {
  const hit = conceptResultCache.get(symbol);
  if (hit && Date.now() - hit.ts < CONCEPT_RESULT_TTL) return hit.names;
  const boards = await fetchStockBoards(symbol);
  if (boards.length === 0) return []; // 数据源不可用不缓存，下次请求重试
  const names = pickTopConcepts(boards, conceptCodes, sector, industryCodes, 3);
  if (names.length > 0) conceptResultCache.set(symbol, { names, ts: Date.now() });
  return names;
}

/** 单值版概念解析（取最贴切概念第一名，兼容旧调用方） */
export async function resolveStockConcept(
  symbol: string,
  conceptCodes: Set<string> | null,
  sector: string | undefined,
  industryCodes: Set<string> | null
): Promise<string> {
  return (await resolveStockConcepts(symbol, conceptCodes, sector, industryCodes))[0] ?? "";
}

/**
 * 挑"最贴切概念"列表：剔除风格/资金标签后按今日板块涨幅降序取前 n 个（默认 3）
 * （涨停回踩语境下，今日仍在涨的概念板块大概率就是该股的题材驱动；同名去重靠 slist 原序稳定排序）。
 * - 精确模式：conceptCodes（t:3 概念族全集）可用 → 只认集合内板块
 * - 降级模式：全集失败但 industryCodes（t:2 行业全集，体小抗限流）可用 → 排除行业+地区后取概念
 * - 兜底模式：两者都失败 → 名称启发式（行业链排在 slist 最前，跳过 sector 及之前；再剔地区/风格）
 * 无可用候选返回 []。
 */
export function pickTopConcepts(
  boards: StockBoard[],
  conceptCodes: Set<string> | null,
  sector: string | undefined,
  industryCodes?: Set<string> | null,
  n = 3
): string[] {
  let pool: StockBoard[];
  if (conceptCodes && conceptCodes.size > 0) {
    pool = boards.filter(b => conceptCodes.has(b.code));
  } else if (industryCodes && industryCodes.size > 0) {
    pool = boards.filter(b =>
      !industryCodes.has(b.code) &&
      !b.name.endsWith("板块") &&
      !/^[ABHN]股$/.test(b.name)
    );
  } else {
    const sectorIdx = boards.findIndex(b => sector && b.name === sector);
    const industryCut = sectorIdx >= 0 ? sectorIdx + 1 : 2;
    const sectorBase = (sector || "").replace(/[ⅠⅡⅢⅣⅠ-Ⅳ]/g, "").trim();
    pool = boards.filter((b, idx) =>
      idx >= industryCut &&
      !b.name.endsWith("板块") &&
      !/^[ABHN]股$/.test(b.name) &&
      !(sectorBase && (b.name.startsWith(sectorBase) || sectorBase.startsWith(b.name)))
    );
  }
  pool = pool.filter(b => !STYLE_TAG_RE.test(b.name));
  if (pool.length === 0) return [];
  // 稳定排序（同分保持 slist 原序，与旧单值版「严格大于才替换」的语义一致）
  const sorted = [...pool].sort((a, b) => b.changePct - a.changePct);
  return sorted.slice(0, n).map(b => b.name);
}
