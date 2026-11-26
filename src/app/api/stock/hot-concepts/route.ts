import { NextRequest, NextResponse } from "next/server";
import { STYLE_TAG_RE } from "@/lib/pullback-pipeline";
import { emRawJson } from "@/lib/em-raw-client";
import fs from "node:fs";
import path from "node:path";

// ── 近 N 个交易日热点概念（每日涨幅前三） ──────────────────────────
// 数据源：东方财富概念板块（m:90+t:3）
//   · 板块清单 + 当日快照：clist 分页（每页上限 100 行，共约 550 个）
//   · 历史每日涨幅：板块日 K（secid=90.BKxxxx，klt=101，f59=当日涨跌幅）
//
// 限速应对（EM push2 系对突发连发按 IP 频控，表现为 rc:100 或直接 RST）：
//   · 所有 EM 请求走模块级限速队列（并发 3、最小间隔 200ms，em-raw-client 原生 http）
//   · 历史日 K 磁盘持久缓存（.cache/hot-concepts-history.json）：历史条目永不变化，
//     每板块每天只需刷新一次；首次冷启动由后台 warmup 渐进补全，接口先返回已
//     收录部分（meta.complete=false），前端自动轮询直至收敛。

// ── Types ──────────────────────────────────────────────

interface HotConceptItem {
  code: string;
  name: string;
  changePercent: number;   // 当日涨跌幅 %
  amountYi: number;        // 当日成交额（亿元）
  volRatio: number | null; // 当日量 / 前一日量（null=缺前一日数据）
  rank: number;            // 当日名次 1-3
}

interface HotConceptDay {
  date: string;    // YYYY-MM-DD
  weekday: string; // 周一…周日
  isToday: boolean;
  items: HotConceptItem[];
}

interface HotConceptFrequency {
  code: string;
  name: string;
  count: number;            // 上榜天数
  bestRank: number;         // 期内最好名次
  totalGain: number | null; // 5 日累计涨幅 %（东财 f109）
  days: string[];
}

interface HotConceptsResponse {
  success: boolean;
  updatedAt: string;
  days: string[];
  perDay: HotConceptDay[];
  frequency: HotConceptFrequency[];
  meta: {
    todayBoards: number;    // 今日快照覆盖的板块数（clist 过滤风格后）
    boardsKnown: number;    // 已有历史日 K 的板块数
    candidates: number;     // 候选板块数（今日涨幅/5日涨幅/主力净流入 各前 150 去重）
    complete: boolean;      // 候选与已收录板块是否全部就绪
    warmupRunning: boolean;
    daysBack: number;       // 实际覆盖交易日数
  };
  error?: string;
}

interface BoardBar { date: string; close: number; volume: number; amount: number; pct: number | null }

interface BoardEntry {
  name: string;
  bars: BoardBar[];       // 最近 8 个交易日（含盘中未收盘条目）
  fetchedOn: string;      // 抓取当天（北京时间日期）
  failCount: number;      // 当日连续失败次数（≥3 跳过，次日重置）
}

interface ListRow { code: string; name: string; pct: number | null; volume: number | null; amount: number | null; gain5d: number | null; mainNet: number | null }

// ── 模块级状态 ──────────────────────────────────────────

const historyCache = new Map<string, BoardEntry>();
let lastList: Map<string, ListRow> | null = null;
// 候选集按交易日冻结：盘中 f3 持续变动会导致候选集微变，warmup 将永远追着移动目标跑。
// 今日列排名由全量清单驱动不受候选集影响；历史日排名依赖 f109/f62 前 150（5 日累计强板块
// 必然入选），冻结当天集合足以覆盖近 5 日的每日前三，次日自动重算
let frozenCandidates: { date: string; codes: string[] } | null = null;
let diskLoaded = false;
let lastDiskSave = 0;
let respCache: { data: HotConceptsResponse; ts: number } | null = null;
const RESP_TTL = 60 * 1000;

const warmup = { running: false };

const DISK_PATH = path.join(process.cwd(), ".cache", "hot-concepts-history.json");

// ── 限速队列（并发 3、最小间隔 200ms） ────────────────────

const gate = { active: 0, lastStart: 0, queue: [] as Array<() => void> };
const GATE_CONC = 3;
const GATE_GAP = 200;

function gatePump() {
  while (gate.active < GATE_CONC && gate.queue.length > 0) {
    const job = gate.queue.shift()!;
    const wait = Math.max(0, gate.lastStart + GATE_GAP - Date.now());
    gate.active++;
    setTimeout(() => {
      gate.lastStart = Date.now();
      job();
    }, wait);
  }
}

function gateRun<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    gate.queue.push(() => {
      fn().then(
        v => { gate.active--; gatePump(); resolve(v); },
        e => { gate.active--; gatePump(); reject(e); },
      );
    });
    gatePump();
  });
}

// ── 工具 ───────────────────────────────────────────────

function beijingToday(): string {
  const now = new Date(Date.now() + (8 * 60 + new Date().getTimezoneOffset()) * 60000);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function weekdayOf(date: string): string {
  try {
    const d = new Date(`${date}T12:00:00+08:00`);
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()] || "";
  } catch {
    return "";
  }
}

function isWeekend(date: string): boolean {
  const w = weekdayOf(date);
  return w === "周六" || w === "周日";
}

// ── 磁盘持久缓存 ────────────────────────────────────────

function loadDiskCache() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    if (!fs.existsSync(DISK_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(DISK_PATH, "utf8"));
    const boards = raw?.boards as Record<string, { name: string; bars: [string, number, number, number, number | null][]; fetchedOn: string; failCount?: number }>;
    if (!boards) return;
    for (const [code, e] of Object.entries(boards)) {
      if (!Array.isArray(e.bars) || e.bars.length === 0) continue;
      historyCache.set(code, {
        name: String(e.name || ""),
        bars: e.bars.map(b => ({ date: b[0], close: b[1], volume: b[2], amount: b[3], pct: b[4] ?? null })),
        fetchedOn: String(e.fetchedOn || ""),
        failCount: e.failCount ?? 0,
      });
    }
  } catch (e) {
    console.error("hot-concepts: disk cache load failed", e);
  }
}

function saveDiskCache(force = false) {
  const now = Date.now();
  if (!force && now - lastDiskSave < 10_000) return;
  lastDiskSave = now;
  try {
    fs.mkdirSync(path.dirname(DISK_PATH), { recursive: true });
    const boards: Record<string, unknown> = {};
    for (const [code, e] of historyCache) {
      boards[code] = {
        name: e.name,
        fetchedOn: e.fetchedOn,
        failCount: e.failCount,
        bars: e.bars.map(b => [b.date, b.close, b.volume, b.amount, b.pct]),
      };
    }
    const tmp = `${DISK_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), boards }));
    fs.renameSync(tmp, DISK_PATH);
  } catch (e) {
    console.error("hot-concepts: disk cache save failed", e);
  }
}

// ── 板块清单 + 今日快照（clist 分页，走限速队列） ──────────

const LIST_FIELDS = "f12,f14,f3,f5,f6,f62,f109"; // 代码,名称,今日涨幅,今日量,今日额,主力净流入,5日涨幅

// 热点榜专用扩展过滤（在管线 STYLE_TAG_RE 之上叠加，不影响回踩选股行为）：
// EM t:3 概念族里还混有指数成分/风格/财报统计类板块（上证50_、大盘价值、2026三季报预增等），
// 以及名称异常退化为代码的坏数据（BK0706），热点榜均应剔除
const HOT_STYLE_EXTRA_RE = /上证50|上证180|上证380|沪深300|HS300|中证|央视50|深成|深证100|创业板综|创业成份|北证|B股|标准普尔|做市商|大盘[价成]|中盘[价成]|小盘[价成]|价值股|周期股|权重股|趋势股|红利股|行业龙头|外资背景|中字头|风格|预增|预减|扭亏|密集调研|增持计划|私募新进|股权集中|近期摘帽/;
const CODE_NAME_RE = /^BK\d{4,6}$/;

async function fetchConceptList(): Promise<Map<string, ListRow>> {
  const out = new Map<string, ListRow>();
  for (let pn = 1; pn <= 10; pn++) {
    const url = `http://push2delay.eastmoney.com/api/qt/clist/get?pn=${pn}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=${LIST_FIELDS}`;
    const json = await gateRun(() => emRawJson([url, url.replace("http://", "https://")], 2, 8000));
    const diff = json?.data?.diff;
    if (!Array.isArray(diff) || diff.length === 0) break;
    const total = Number(json?.data?.total) || 0;
    for (const it of diff) {
      const code = String(it.f12 ?? "");
      const name = String(it.f14 ?? "").trim();
      if (!/^BK\d+$/.test(code) || !name) continue;
      if (STYLE_TAG_RE.test(name) || HOT_STYLE_EXTRA_RE.test(name) || CODE_NAME_RE.test(name)) continue; // 风格/指数/财报统计类伪概念 + 坏数据剔除
      const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : parseFloat(String(v)) || null);
      out.set(code, {
        code, name,
        pct: num(it.f3), volume: num(it.f5), amount: num(it.f6),
        mainNet: num(it.f62), gain5d: num(it.f109),
      });
    }
    if (total > 0 && pn * 100 >= total) break;
  }
  return out;
}

// ── 板块日 K（走限速队列） ───────────────────────────────

async function fetchBoardKline(code: string): Promise<BoardBar[]> {
  const query = `/api/qt/stock/kline/get?secid=90.${code}&klt=101&fqt=1&lmt=8&end=20500101&fields1=f1&fields2=f51,f53,f56,f57,f59`;
  const json = await gateRun(() => emRawJson([`http://push2his.eastmoney.com${query}`, `https://push2his.eastmoney.com${query}`], 2, 8000));
  const klines: unknown = json?.data?.klines;
  if (!Array.isArray(klines)) return [];
  const bars: BoardBar[] = [];
  for (const row of klines as string[]) {
    const p = row.split(",");
    if (p.length < 5) continue;
    bars.push({
      date: p[0],
      close: parseFloat(p[1]) || 0,
      volume: parseFloat(p[2]) || 0,
      amount: parseFloat(p[3]) || 0,
      pct: isNaN(parseFloat(p[4])) ? null : parseFloat(p[4]),
    });
  }
  return bars;
}

// ── 候选集与补全需求 ────────────────────────────────────

function getCandidates(list: Map<string, ListRow>): string[] {
  const today = beijingToday();
  if (frozenCandidates && frozenCandidates.date === today && frozenCandidates.codes.length > 0) {
    return frozenCandidates.codes;
  }
  const top = (key: (r: ListRow) => number | null) =>
    [...list.values()]
      .map(r => ({ code: r.code, v: key(r) }))
      .filter(x => x.v != null)
      .sort((a, b) => (b.v as number) - (a.v as number))
      .slice(0, 150)
      .map(x => x.code);
  const set = new Set<string>();
  for (const c of [...top(r => r.pct), ...top(r => r.gain5d), ...top(r => r.mainNet)]) set.add(c);
  frozenCandidates = { date: today, codes: [...set] };
  return frozenCandidates.codes;
}

function collectFetchNeeds(todayStr: string): string[] {
  if (!lastList) return [];
  const candidates = getCandidates(lastList);
  const needs: string[] = [];
  // 1) 已收录但今天还没刷新的（历史推进一天）
  for (const [code, entry] of historyCache) {
    if (entry.fetchedOn !== todayStr && entry.failCount < 3) needs.push(code);
  }
  // 2) 候选中尚无历史的
  for (const code of candidates) {
    if (!historyCache.has(code) && !needs.includes(code)) needs.push(code);
  }
  return needs;
}

async function runWarmup() {
  if (warmup.running) return;
  warmup.running = true;
  try {
    // 循环直至无需求（期间新一天/新候选会被自然拾起）
    for (let round = 0; round < 20; round++) {
      const todayStr = beijingToday();
      const needs = collectFetchNeeds(todayStr);
      if (needs.length === 0) break;
      for (const code of needs) {
        const row = lastList?.get(code);
        try {
          const bars = await fetchBoardKline(code);
          const prev = historyCache.get(code);
          if (bars.length > 0) {
            historyCache.set(code, {
              name: row?.name || prev?.name || code,
              bars,
              fetchedOn: todayStr,
              failCount: 0,
            });
          } else {
            // 无数据（新股/异常）也记成功，避免反复重拉
            historyCache.set(code, {
              name: row?.name || prev?.name || code,
              bars: prev?.bars ?? [],
              fetchedOn: todayStr,
              failCount: 0,
            });
          }
        } catch {
          const prev = historyCache.get(code);
          if (prev) prev.failCount = (prev.failCount || 0) + 1;
          else historyCache.set(code, { name: row?.name || code, bars: [], fetchedOn: "", failCount: 1 });
        }
        saveDiskCache();
      }
      saveDiskCache(true);
    }
  } finally {
    warmup.running = false;
    saveDiskCache(true);
  }
}

function kickWarmup() {
  if (warmup.running) return;
  // 后台执行，不阻塞请求
  runWarmup().catch(() => { warmup.running = false; });
}

// ── 排名计算 ────────────────────────────────────────────

function buildResponse(list: Map<string, ListRow>, daysBackReq: number): HotConceptsResponse {
  const todayStr = beijingToday();
  const todayTrading = !isWeekend(todayStr) && list.size > 0;

  // 交易日窗口：缓存条目日期并集 ∪ 今日
  const dateSet = new Set<string>();
  for (const entry of historyCache.values()) {
    for (const b of entry.bars) dateSet.add(b.date);
  }
  if (todayTrading) dateSet.add(todayStr);
  const days = [...dateSet].sort().slice(-daysBackReq);

  // 预构建：每个板块「date → {bar, prevBar}」
  const perBoardByDate = new Map<string, Map<string, { bar: BoardBar; prev: BoardBar | null }>>();
  for (const [code, entry] of historyCache) {
    const clean = entry.bars.filter(b => b.date !== todayStr || !todayTrading); // 今日用快照伪条，剔除缓存中的盘中条
    for (let i = 0; i < clean.length; i++) {
      const d = clean[i].date;
      if (!days.includes(d)) continue;
      const m = perBoardByDate.get(code) ?? new Map<string, { bar: BoardBar; prev: BoardBar | null }>();
      m.set(d, { bar: clean[i], prev: i > 0 ? clean[i - 1] : null });
      perBoardByDate.set(code, m);
    }
  }

  const perDay: HotConceptDay[] = days.map(date => {
    const rows: HotConceptItem[] = [];
    const isToday = date === todayStr;
    for (const [code, row] of list) {
      let pct: number | null = null;
      let volume: number | null = null;
      let amount: number | null = null;
      let prevVol: number | null = null;
      if (isToday && todayTrading) {
        pct = row.pct; volume = row.volume; amount = row.amount;
        const m = perBoardByDate.get(code);
        if (m) {
          const lastDate = [...m.keys()].sort().pop();
          if (lastDate) prevVol = m.get(lastDate)!.bar.volume || null;
        }
      } else {
        const m = perBoardByDate.get(code);
        const e = m?.get(date);
        if (!e) continue;
        pct = e.bar.pct ?? (e.prev && e.prev.close > 0 && e.bar.close > 0 ? (e.bar.close / e.prev.close - 1) * 100 : null);
        volume = e.bar.volume; amount = e.bar.amount;
        prevVol = e.prev?.volume ?? null;
      }
      if (pct == null) continue;
      rows.push({
        code, name: row.name,
        changePercent: Math.round(pct * 100) / 100,
        amountYi: amount != null ? Math.round((amount / 1e8) * 10) / 10 : 0,
        volRatio: volume != null && prevVol != null && prevVol > 0
          ? Math.round((volume / prevVol) * 10) / 10
          : null,
        rank: 0,
      });
    }
    rows.sort((a, b) => b.changePercent - a.changePercent || b.amountYi - a.amountYi);
    return {
      date,
      weekday: weekdayOf(date),
      isToday,
      items: rows.slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 })),
    };
  });

  // 上榜频次（连续上榜 = 持续热点）
  const freqMap = new Map<string, { code: string; name: string; count: number; bestRank: number; days: string[] }>();
  for (const d of perDay) {
    for (const it of d.items) {
      const f = freqMap.get(it.code) ?? { code: it.code, name: it.name, count: 0, bestRank: 99, days: [] };
      f.count++;
      f.bestRank = Math.min(f.bestRank, it.rank);
      f.days.push(d.date);
      freqMap.set(it.code, f);
    }
  }
  const frequency: HotConceptFrequency[] = [...freqMap.values()]
    .map(f => ({ ...f, totalGain: list.get(f.code)?.gain5d ?? null }))
    .sort((a, b) => b.count - a.count || a.bestRank - b.bestRank || (b.totalGain ?? 0) - (a.totalGain ?? 0))
    .slice(0, 8);

  const todayStr2 = beijingToday();
  const candidates = lastList ? getCandidates(lastList) : [];
  const coldCount = candidates.filter(c => !historyCache.has(c)).length;
  const staleCount = [...historyCache.values()].filter(e => e.fetchedOn !== todayStr2 && e.failCount < 3).length;
  const complete = !warmup.running && coldCount === 0 && staleCount === 0 && historyCache.size > 0;

  return {
    success: true,
    updatedAt: new Date().toISOString(),
    days,
    perDay,
    frequency,
    meta: {
      todayBoards: list.size,
      boardsKnown: historyCache.size,
      candidates: candidates.length,
      complete,
      warmupRunning: warmup.running,
      daysBack: days.length,
    },
  };
}

// ── GET Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  const daysBackReq = Math.min(Math.max(parseInt(searchParams.get("days") || "5", 10) || 5, 3), 10);

  loadDiskCache();

  if (!refresh && respCache && Date.now() - respCache.ts < RESP_TTL && respCache.data.meta.complete) {
    return NextResponse.json(respCache.data, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
    });
  }

  try {
    const list = await fetchConceptList();
    if (list.size === 0) throw new Error("概念板块清单获取失败（东财限流？请稍后重试）");
    lastList = list;

    kickWarmup();

    // 冷启动等待：首个请求等待 warmup 填充一部分历史（最多 ~9s，期间已有今日快照可先出今日列）
    if (historyCache.size < 30) {
      const t0 = Date.now();
      while (Date.now() - t0 < 9000 && historyCache.size < Math.min(60, Math.ceil(list.size * 0.2))) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    const data = buildResponse(list, daysBackReq);
    if (data.meta.complete) respCache = { data, ts: Date.now() };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
    });
  } catch (error: any) {
    console.error("hot-concepts API error:", error?.message || error);
    return NextResponse.json(
      {
        success: false,
        updatedAt: new Date().toISOString(),
        days: [],
        perDay: [],
        frequency: [],
        meta: { todayBoards: 0, boardsKnown: historyCache.size, candidates: 0, complete: false, warmupRunning: warmup.running, daysBack: 0 },
        error: error?.message || "未知错误",
      } satisfies HotConceptsResponse,
      { status: 500 },
    );
  }
}
