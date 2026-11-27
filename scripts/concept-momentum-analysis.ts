/**
 * 热点概念与个股涨跌关系分析（复跑：bun run scripts/concept-momentum-analysis.ts）
 *
 * 数据源（本地 dev server API）：
 * - /api/stock/hot-concepts   近 5 个交易日每日涨幅前 8 的概念板块 + 频次统计
 * - /api/stock/limit-up-pullback 涨停回踩候选池（个股 top6 贴切概念，按今日板块涨幅降序）
 *
 * 分析维度：
 * 1. 热点概念成分股 vs 非成分股：今日涨跌 / 回踩深度 / 最大回撤差异
 * 2. 概念板块动量 → 成分股表现：板块涨幅与候选池成分股平均涨跌的相关性
 * 3. 持续性热点（5 日内 ≥2 次上榜）vs 一日热点：成分股表现差异
 * 4. 主概念（concepts[0]）命中热点的领先效应
 */

interface HotItem { code: string; name: string; changePercent: number; rank: number }
interface HotDay { date: string; items: HotItem[] }
interface HotConceptsResp {
  perDay: HotDay[];
  frequency: { name: string; count: number; days: string[]; totalGain: number }[];
}
interface Stock {
  symbol: string; name: string; currentChangePct: number; approachPct: number;
  maxPullbackPct: number; volumeRatio: number; concepts: string[]; concept: string;
}

const BASE = process.env.BASE_URL || "http://localhost:3000";

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pearson = (xs: number[], ys: number[]) => {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : NaN;
};
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "--");
const pct = (v: number) => `${fmt(v * 100, 0)}%`;

async function main() {
  const [hotRes, stockRes] = await Promise.all([
    fetch(`${BASE}/api/stock/hot-concepts`).then(r => r.json() as Promise<HotConceptsResp>),
    fetch(`${BASE}/api/stock/limit-up-pullback`).then(r => r.json()),
  ]);
  const stocks: Stock[] = stockRes.stocks ?? [];
  const perDay = hotRes.perDay ?? [];
  if (!stocks.length || perDay.length < 2) {
    console.error("数据不足：", { stocks: stocks.length, days: perDay.length });
    process.exit(1);
  }

  const today = perDay[perDay.length - 1];
  const todayHot = today.items.map(i => i.name);
  const pastHot = new Set(perDay.slice(0, -1).flatMap(d => d.items.map(i => i.name)));
  const hotAll = new Set([...todayHot, ...pastHot]);
  const persistNames = (hotRes.frequency ?? []).filter(f => f.count >= 2).map(f => f.name);
  const persist = new Set(persistNames);

  const has = (s: Stock, set: Set<string>) => (s.concepts ?? []).some(c => set.has(c));

  // ── 1. 成分股 vs 非成分股 ────────────────────────────────
  const todayGrp = stocks.filter(s => has(s, new Set(todayHot)));
  const pastOnlyGrp = stocks.filter(s => !has(s, new Set(todayHot)) && has(s, pastHot));
  const noneGrp = stocks.filter(s => !has(s, hotAll));
  const stats = (g: Stock[], label: string) => {
    const chg = g.map(s => s.currentChangePct);
    const app = g.map(s => s.approachPct);
    const mpb = g.map(s => s.maxPullbackPct);
    console.log(
      `${label.padEnd(14, "　")}n=${String(g.length).padStart(3)} | 今日涨跌均值 ${fmt(mean(chg), 2)}% 中位 ${fmt(median(chg), 2)}%` +
      ` | 回踩深度均值 ${fmt(mean(app), 1)}% | 最大回撤均值 ${fmt(mean(mpb), 1)}%`
    );
    return { chg, app };
  };
  console.log(`\n== 1. 热点概念成分股 vs 非成分股（候选池 ${stocks.length} 只，今日热点：${todayHot.slice(0, 4).join("/")} 等 ${todayHot.length} 个） ==`);
  stats(todayGrp, "命中今日热点");
  stats(pastOnlyGrp, "仅命中往日热点");
  stats(noneGrp, "未命中热点");

  // ── 2. 概念板块动量 → 成分股表现相关性 ────────────────────
  console.log(`\n== 2. 今日概念板块涨幅 vs 候选池成分股平均涨跌（按板块涨幅降序） ==`);
  const rows: { name: string; board: number; n: number; avgChg: number; avgApp: number }[] = [];
  for (const item of today.items) {
    const cons = stocks.filter(s => (s.concepts ?? []).includes(item.name));
    rows.push({
      name: item.name, board: item.changePercent, n: cons.length,
      avgChg: mean(cons.map(s => s.currentChangePct)),
      avgApp: mean(cons.map(s => s.approachPct)),
    });
  }
  for (const r of [...rows].sort((a, b) => b.board - a.board)) {
    console.log(
      `${r.name.padEnd(10, "　")} 板块 ${fmt(r.board, 2).padStart(6)}% | 成分股 n=${String(r.n).padStart(2)}` +
      ` 均涨 ${fmt(r.avgChg, 2).padStart(6)}% | 回踩 ${fmt(r.avgApp, 1).padStart(5)}%`
    );
  }
  const valid = rows.filter(r => r.n >= 2);
  const corr = pearson(valid.map(r => r.board), valid.map(r => r.avgChg));
  console.log(`>>> 相关性（板块涨幅 vs 成分股均涨，仅计 n≥2 的 ${valid.length} 个概念）：r = ${fmt(corr)}`);

  // ── 3. 持续性热点 vs 一日热点 ────────────────────────────
  console.log(`\n== 3. 持续性热点（5 日上榜≥2 次，共 ${persist.size} 个）vs 一日热点 ==`);
  stats(stocks.filter(s => has(s, new Set(todayHot)) && has(s, persist)), "持续热点成分");
  stats(stocks.filter(s => has(s, new Set(todayHot)) && !has(s, persist)), "仅今日新热点");
  stats(stocks.filter(s => !has(s, new Set(todayHot)) && has(s, persist)), "持续热点已掉榜");

  // ── 4. 主概念（concepts[0]）领先效应 ─────────────────────
  console.log(`\n== 4. 主概念（第 1 贴切概念）命中今日热点 vs 次要概念命中 ==`);
  stats(stocks.filter(s => todayHot.includes(s.concept ?? "")), "主概念即热点");
  stats(stocks.filter(s => !todayHot.includes(s.concept ?? "") && has(s, new Set(todayHot))), "仅次概念命中");
}

main().catch(e => { console.error(e); process.exit(1); });
