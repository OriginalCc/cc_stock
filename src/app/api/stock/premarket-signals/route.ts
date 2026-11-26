import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fetchZTPool,
  fetchDailyKline,
  getTradeDatesCached,
  computeBasisDate,
  stripFormingBar,
  type KLineDay,
} from "@/lib/pullback-pipeline";
import {
  calcPremarketSignal,
  buildSectorStats,
  type PullbackStock,
  type SignalType,
} from "@/lib/pullback-metrics";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────

interface SignalEntry {
  type: SignalType;
  score: number;
  reasons: string[];
  grade?: "A" | "B" | "C"; // Task 42 机会分级（胜率优先）
}

interface PremarketPayload {
  signals: Record<string, SignalEntry>;
  stats: Record<SignalType, number>;
}

interface PremarketResponse {
  success: boolean;
  basisDate: string;
  computedAt: string;
  stockCount: number;
  signals: Record<string, SignalEntry>;
  stats: Record<SignalType, number>;
  recomputed?: boolean; // 本次请求是否触发重算
  stale?: boolean;      // 返回的是过期旧快照（计算失败时的降级）
  error?: string;
}

// 防止并发重复计算（多个页面同时打开/定时任务+用户访问撞车）
let inflight: Promise<{
  basisDate: string;
  computedAt: string;
  stockCount: number;
  payload: PremarketPayload;
}> | null = null;

// ── Core: compute the pre-market snapshot ──────────────
// 与 /api/stock/limit-up-pullback 同源数据管道，但强制 T-1 口径：
//   1. 交易日历剔除当日形成中K线 → basisDate（基准交易日）
//   2. 涨停池只取基准日之前的日期（基准日封板的股票还没有回踩可言）
//   3. 个股K线剔除当日形成中K线 → 一切指标按 T-1 收盘价计算
//   4. 判定用 calcPremarketSignal（不含任何当日盘中数据）
async function computeSnapshot() {
  const tradeDates = await getTradeDatesCached();
  if (tradeDates.length < 2) {
    throw new Error("交易日历获取失败（新浪接口不可用），无法确定 T-1 基准日");
  }

  const { basisDate, calBars } = computeBasisDate(tradeDates);
  if (!basisDate) {
    throw new Error("无法确定 T-1 研判基准日");
  }

  // 涨停池：基准日之前的 10 个交易日（与盘中口径一致：最新封板日无回踩样本）
  const poolDates = calBars.slice(0, -1).slice(-10);
  const candidates = new Map<string, { code: string; name: string; poolDate: string }>();
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
    throw new Error("涨停股池数据源暂时不可用（东财接口拦截），无法生成盘前研判");
  }

  // 逐股 K 线分析（T-1 口径）→ 先收集样本，再统一评分（Task 46: 板块共振需要全集统计）
  const candList = Array.from(candidates.values());
  const signals: Record<string, SignalEntry> = {};
  const stats: Record<SignalType, number> = { opportunity: 0, watch: 0, risk: 0 };
  const psList: PullbackStock[] = [];
  let klineOk = 0;
  let klineFailed = 0;
  const BATCH_SIZE = 25;
  const TOTAL_BUDGET_MS = 50_000;
  const startTime = Date.now();

  for (let i = 0; i < candList.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > TOTAL_BUDGET_MS) break;
    const batch = candList.slice(i, i + BATCH_SIZE);
    // Task 40: 40 个交易日（原 15）——涨停前 MA20/趋势结构 + 回踩段量能需要更长窗口
    const klineResults = await Promise.allSettled(
      batch.map(s => fetchDailyKline(s.code, 40))
    );

    for (let j = 0; j < batch.length; j++) {
      const stock = batch[j];
      const klineResult = klineResults[j];

      if (klineResult.status !== "fulfilled" || klineResult.value.length < 5) {
        klineFailed++;
        continue;
      }
      // 关键：剔除当日形成中K线 → 严格 T-1 收盘口径
      const kline = stripFormingBar(klineResult.value);
      if (kline.length < 5) {
        klineFailed++;
        continue;
      }
      klineOk++;

      const targetIdx = kline.findIndex(d => d.date === stock.poolDate);
      if (targetIdx < 1) continue;

      // 用 T-1 收盘价复核涨停真实性（与盘中口径同一阈值逻辑）
      const prevClose = kline[targetIdx - 1].close;
      const limitUpDay = kline[targetIdx];
      const pct = prevClose > 0 ? ((limitUpDay.close - prevClose) / prevClose) * 100 : 0;
      const code = stock.code;
      const threshold = code.startsWith("688") || code.startsWith("30") ? 19.5 : 9.5;
      if (pct < threshold) continue;

      const limitUpClose = limitUpDay.close;
      const preLimitUpClose = prevClose;
      if (preLimitUpClose < 2) continue; // 剔除仙股

      const t1Day = kline[kline.length - 1]; // T-1 收盘
      const currentPrice = t1Day.close;
      if (currentPrice >= limitUpClose) continue; // 尚未回落，无回踩

      const pullbackPct = ((limitUpClose - currentPrice) / limitUpClose) * 100;
      const totalRise = limitUpClose - preLimitUpClose;
      const currentDrop = limitUpClose - currentPrice;
      const approachPct = totalRise > 0 ? Math.min((currentDrop / totalRise) * 100, 100) : 0;
      if (approachPct < 30) continue; // 与盘中口径一致：至少回踩 30%

      const daysSinceLimitUp = kline.length - 1 - targetIdx;
      if (daysSinceLimitUp < 1) continue;

      let maxPullbackPct = 0;
      let maxPullbackDate = "";
      for (let k = targetIdx + 1; k < kline.length; k++) {
        const pb = ((limitUpClose - kline[k].close) / limitUpClose) * 100;
        if (pb > maxPullbackPct) {
          maxPullbackPct = pb;
          maxPullbackDate = kline[k].date;
        }
      }

      const summaryStart = Math.max(0, targetIdx - 2);
      const klineSummary: KLineDay[] = kline.slice(summaryStart).map(d => ({
        date: d.date,
        open: d.open,
        close: d.close,
        high: d.high,
        low: d.low,
        volume: d.volume,
        changePct: d.changePct,
      }));

      // Task 40: 涨停前均线结构（与主管道同口径）：多头排列=2，MA10>MA20=1，其他=0
      const before = kline.slice(0, targetIdx).map(d => d.close);
      let preTrend: number | undefined;
      if (before.length >= 20) {
        const ma = (n: number) => before.slice(-n).reduce((a, b) => a + b, 0) / n;
        const ma5 = ma(5), ma10 = ma(10), ma20 = ma(20);
        preTrend = ma5 > ma10 && ma10 > ma20 ? 2 : ma10 > ma20 ? 1 : 0;
      }

      const ps: PullbackStock = {
        symbol: code,
        name: stock.name,
        limitUpDate: limitUpDay.date,
        limitUpClose,
        preLimitUpClose,
        limitUpPct: pct,
        currentPrice,
        currentChangePct: t1Day.changePct,
        pullbackPct,
        approachPct,
        daysSinceLimitUp,
        maxPullbackPct,
        maxPullbackDate,
        klineSummary,
        preTrend,
        // Task 46: 涨停池自带行业板块（hybk），供板块共振因子使用
        sector: stock.sector,
        turnover: 0,
        marketCap: 0,
        volumeRatio: 0,
      };

      psList.push(ps);
    }
  }

  // Task 46: 板块统计（两遍式）——psList 均为 T-1 视角（kline 已剔除当日形成中K线，
  // currentChangePct 即 T-1 涨跌幅），直接用盘中模式构建即为盘前口径
  const sectorStats = buildSectorStats(psList);
  for (const ps of psList) {
    const sig = calcPremarketSignal(ps, basisDate, sectorStats);
    signals[ps.symbol] = { type: sig.type, score: sig.score, reasons: sig.reasons, grade: sig.grade };
    stats[sig.type]++;
  }

  if (klineOk === 0 && klineFailed > 0) {
    throw new Error("K线数据源暂时不可用（新浪+东财均失败），无法生成盘前研判");
  }
  if (Object.keys(signals).length === 0) {
    throw new Error("盘前研判候选样本为空（涨停池/K线均无有效数据）");
  }

  return { basisDate, payload: { signals, stats } as PremarketPayload, stockCount: Object.keys(signals).length };
}

// ── Run compute with inflight guard + DB upsert ────────
async function runCompute() {
  if (inflight) return inflight;
  inflight = (async () => {
    const { basisDate, payload, stockCount } = await computeSnapshot();
    const row = await db.premarketSignalSnapshot.upsert({
      where: { basisDate },
      update: { computedAt: new Date(), payload: JSON.stringify(payload), stockCount },
      create: { basisDate, computedAt: new Date(), payload: JSON.stringify(payload), stockCount },
    });
    return { basisDate, computedAt: row.computedAt.toISOString(), stockCount, payload };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

function rowToResponse(
  row: { basisDate: string; computedAt: Date; stockCount: number; payload: string },
  extra: Partial<PremarketResponse> = {}
): PremarketResponse {
  try {
    const parsed = JSON.parse(row.payload) as PremarketPayload;
    return {
      success: true,
      basisDate: row.basisDate,
      computedAt: row.computedAt.toISOString(),
      stockCount: row.stockCount,
      signals: parsed.signals || {},
      stats: parsed.stats || { opportunity: 0, watch: 0, risk: 0 },
      ...extra,
    };
  } catch {
    return {
      success: false,
      basisDate: "",
      computedAt: "",
      stockCount: 0,
      signals: {},
      stats: { opportunity: 0, watch: 0, risk: 0 },
      error: "快照数据损坏",
      ...extra,
    };
  }
}

// ── GET: smart read-or-compute ─────────────────────────
// 快照新鲜度判定：basisDate === 当前 T-1 基准日即视为新鲜。
// 盘前/盘中全天 basisDate 不变，因此一天只算一次、盘中结果不漂移；
// 收盘后（>=15:05）基准日滚到当日，下次访问自动为次日盘前重算。
export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("refresh") === "1";

  if (!force) {
    try {
      const latest = await db.premarketSignalSnapshot.findFirst({
        orderBy: { basisDate: "desc" },
      });
      if (latest) {
        const tradeDates = await getTradeDatesCached().catch(() => [] as string[]);
        const { basisDate: expected } = computeBasisDate(tradeDates);
        // 日历不可用时（expected=null）直接信任最新快照
        if (!expected || latest.basisDate === expected) {
          return NextResponse.json(rowToResponse(latest, { recomputed: false }));
        }
        // 基准日已过期 → 重算；重算失败则返回旧快照并标记 stale
        try {
          const data = await runCompute();
          return NextResponse.json({ success: true, ...data, signals: data.payload.signals, stats: data.payload.stats, recomputed: true });
        } catch {
          return NextResponse.json(rowToResponse(latest, { stale: true, recomputed: false, error: "盘前研判重算失败，返回上一交易日快照" }));
        }
      }
    } catch {
      // DB 读失败 → 落入下方直接计算
    }
  }

  try {
    const data = await runCompute();
    return NextResponse.json({ success: true, ...data, signals: data.payload.signals, stats: data.payload.stats, recomputed: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "盘前研判计算失败";
    // 兜底：只要有任何历史快照就返回（标记 stale），前端可降级本地计算
    const latest = await db.premarketSignalSnapshot.findFirst({ orderBy: { basisDate: "desc" } }).catch(() => null);
    if (latest) {
      return NextResponse.json(rowToResponse(latest, { stale: true, error: msg }));
    }
    return NextResponse.json({ success: false, basisDate: "", computedAt: "", stockCount: 0, signals: {}, stats: { opportunity: 0, watch: 0, risk: 0 }, error: msg });
  }
}

// ── POST: force recompute & upsert（定时任务/手动重算入口） ──
export async function POST() {
  try {
    const data = await runCompute();
    return NextResponse.json({ success: true, ...data, signals: data.payload.signals, stats: data.payload.stats, recomputed: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "盘前研判计算失败";
    return NextResponse.json({ success: false, basisDate: "", computedAt: "", stockCount: 0, signals: {}, stats: { opportunity: 0, watch: 0, risk: 0 }, error: msg });
  }
}
