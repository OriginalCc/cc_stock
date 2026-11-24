// ── Pullback derived metrics + opportunity/risk signal ──
// Shared by the screener (table badges / sort / filters / CSV) and the
// commonality footer (signal distribution). The signal rules are derived
// directly from the "共性归纳" findings (Task 30):
//   - 反弹确认线: 自回踩低点反弹 >= 3%
//   - 深回踩 (approachPct >= 70) 是回踩再上涨的主流形态
//   - 低点窗口: 距涨停 3-8 个交易日为高发期
//   - 首板是回踩再涨的绝对主力; 高位连板深回踩多属情绪退潮
//   - 放量反抽确认动能; 缩量反弹待量能验证
//   - 风险特征: 未脱离低点区域 + 今日续跌 (阴跌不止), 起涨点失守过深

export interface KLineDay {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number;
  volume?: number; // 成交量（手/股，源数据口径）；旧缓存/旧快照可能缺省
}

export interface PullbackStock {
  symbol: string;
  name: string;
  limitUpDate: string;
  limitUpClose: number;
  preLimitUpClose: number;
  limitUpPct: number;
  currentPrice: number;
  currentChangePct: number;
  pullbackPct: number;
  approachPct: number;
  daysSinceLimitUp: number;
  maxPullbackPct: number;
  maxPullbackDate: string;
  klineSummary: KLineDay[];
  turnover: number;
  marketCap: number;
  volumeRatio: number;
  sector?: string; // 所属行业板块（东财 f100，行情富化时填充，可能缺省）
  concept?: string; // 最贴切概念（slist 概念族剔除风格标签后取今日动量最强，可能缺省）
  preTrend?: number; // 涨停前均线结构：2=MA5>MA10>MA20 多头排列 1=MA10>MA20 0=其他；旧数据缺省
}

/** Per-stock derived metrics (from kline) shared across analyses */
export interface StockExt {
  reboundFromLow: number; // 现价相对涨停后最低收盘价的涨幅(%)
  lowWindow: number;      // 回踩低点距涨停日的交易日数
  daysSinceLow: number;   // 低点距最新的交易日数(反弹启动耗时)
  streak: number;         // 连板数(涨停日向前连续涨停天数)
  // ── Task 40: 量能结构 + 破位度（无量数据的旧缓存/快照 → 量能项 undefined，评分取中性） ──
  volShrinkPct?: number;   // 回踩段均量较涨停日量的萎缩度(%，正=缩量/抛压枯竭，负=放量/出逃)
  recentVolRatio?: number; // 近3日均量 / 回踩段均量（<1=近端继续缩量）
  stabilized?: boolean;    // 企稳：低点已过去≥1天且最新一根非大阴线(>-3%)
  brokenPct: number;       // 起涨点失守度(%，0=守住起涨点，不封顶；与 approachPct 的 100 封顶互补)
  recent3DayDrop: number;  // 近3日累计跌幅(%，阴跌动能，风险分用)
}

export function buildExt(s: PullbackStock): StockExt {
  const kline = s.klineSummary || [];
  const luIdx = kline.findIndex(k => k.date === s.limitUpDate);
  const after = luIdx >= 0 ? kline.slice(luIdx + 1) : [];

  // 回踩低点 = 涨停日之后的最低收盘价
  let lowClose = Number.POSITIVE_INFINITY;
  let lowIdx = -1;
  after.forEach((k, i) => {
    if (k.close < lowClose) {
      lowClose = k.close;
      lowIdx = i;
    }
  });
  if (lowIdx < 0) lowClose = s.currentPrice;

  const reboundFromLow = lowClose > 0 ? ((s.currentPrice - lowClose) / lowClose) * 100 : 0;
  const lowWindow = lowIdx >= 0 ? lowIdx : 0;
  const daysSinceLow = lowIdx >= 0 ? after.length - 1 - lowIdx : 0;

  // 连板数: 涨停日向前连续涨停(含当日), 板块阈值由涨停日涨幅推断
  const threshold = s.limitUpPct >= 19.5 ? 19.5 : 9.5;
  let streak = 0;
  if (luIdx >= 0) {
    for (let i = luIdx; i >= 0; i--) {
      if (kline[i].changePct >= threshold) streak++;
      else break;
    }
  }

  // ── 量能结构（Task 40）──
  // 回踩段均量 vs 涨停日量：缩量回踩 = 抛压枯竭（健康），放量回踩 = 出逃迹象（危险）
  const limitUpVol = luIdx >= 0 ? kline[luIdx].volume || 0 : 0;
  const pullbackVols = after.map(k => k.volume || 0).filter(v => v > 0);
  const avgPullbackVol = pullbackVols.length > 0
    ? pullbackVols.reduce((a, b) => a + b, 0) / pullbackVols.length
    : 0;
  const volShrinkPct = limitUpVol > 0 && avgPullbackVol > 0
    ? (1 - avgPullbackVol / limitUpVol) * 100
    : undefined;
  const recentVolRatio = avgPullbackVol > 0 && pullbackVols.length >= 2
    ? (() => {
        const recent = pullbackVols.slice(-3);
        return recent.reduce((a, b) => a + b, 0) / recent.length / avgPullbackVol;
      })()
    : undefined;

  // 破位度：现价跌破起涨点的幅度（不封顶，区分「贴着起涨点」和「深破位」）
  const brokenPct = s.preLimitUpClose > 0
    ? Math.max(0, ((s.preLimitUpClose - s.currentPrice) / s.preLimitUpClose) * 100)
    : 0;

  // 企稳：低点已过去 ≥1 天（近端未创新低）且最新一根非大阴线
  const lastBar = kline[kline.length - 1];
  const stabilized = after.length > 0 && daysSinceLow >= 1 && Boolean(lastBar) && lastBar.changePct > -3;

  // 近3日累计跌幅（阴跌动能）
  let recent3DayDrop = 0;
  if (kline.length >= 4) {
    const ref = kline[kline.length - 4].close;
    recent3DayDrop = ref > 0 ? Math.max(0, ((ref - kline[kline.length - 1].close) / ref) * 100) : 0;
  }

  return { reboundFromLow, lowWindow, daysSinceLow, streak, volShrinkPct, recentVolRatio, stabilized, brokenPct, recent3DayDrop };
}

export function median(nums: number[]): number {
  const valid = nums.filter(n => Number.isFinite(n));
  if (valid.length === 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// ── Opportunity/Risk signal ────────────────────────────

export type SignalType = "opportunity" | "watch" | "risk";

export interface StockSignal {
  type: SignalType;
  label: string;
  score: number;     // 0-100, 越高机会越大 (可排序)
  reasons: string[]; // 判定依据 (用于悬浮提示/展开详情)
}

/** 统一的信号解析器签名：优先快照，缺省时本地按 T-1 口径计算 */
export type SignalResolver = (s: PullbackStock) => StockSignal;

export const SIGNAL_META: Record<SignalType, {
  label: string;
  badge: string; // 行内小徽章（表格/卡片/分布行）
  card: string;  // 展开详情大卡片容器（低饱和底色，不用实底徽章色）
  desc: string;
}> = {
  opportunity: {
    label: "机会",
    // 鲜艳实底红（A股语义：红=涨/机会），白字 + 微光晕，表格中最醒目
    badge: "bg-red-500 border-red-500 text-white shadow-sm shadow-red-500/40",
    card: "bg-red-500/[0.07] border-red-500/40",
    desc: "反弹确认 + 企稳信号共振",
  },
  watch: {
    label: "观察",
    badge: "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400",
    card: "bg-amber-500/[0.06] border-amber-500/30",
    desc: "具备部分条件，等待反弹确认",
  },
  risk: {
    label: "风险",
    badge: "bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-400",
    card: "bg-red-500/[0.06] border-red-500/30",
    desc: "反弹乏力或阴跌未止",
  },
};

const REBOUND_CONFIRM = 3; // 反弹确认线(%), 与共性归纳一致

/**
 * 量能结构评分 (0-10, Task 40): 回踩段均量较涨停日量的萎缩度。
 * 缩量回踩 = 抛压枯竭（健康）；放量回踩 = 出逃迹象（危险）。
 * 无量数据（旧缓存/旧快照）→ 中性 4 分。
 */
function volumeStructureScore(ext: StockExt, reasons: string[]): number {
  const v = ext.volShrinkPct;
  if (v === undefined) {
    reasons.push("量能数据缺失，量能结构未计入");
    return 4;
  }
  if (v >= 50) {
    reasons.push(`回踩段极度缩量（较涨停日量 -${v.toFixed(0)}%，抛压枯竭）`);
    return 10;
  }
  if (v >= 30) {
    reasons.push(`缩量回踩（较涨停日量 -${v.toFixed(0)}%，抛压有限）`);
    return ext.recentVolRatio !== undefined && ext.recentVolRatio <= 0.85 ? 9 : 8;
  }
  if (v >= 10) {
    reasons.push(`回踩量能温和（较涨停日量 -${v.toFixed(0)}%）`);
    return 6;
  }
  if (v < 0) {
    reasons.push(`回踩段不缩反放量（+${Math.abs(v).toFixed(0)}%，有出逃迹象）`);
    return 0;
  }
  reasons.push("回踩量能与涨停日接近，未见明显缩量");
  return 3;
}

/**
 * 涨停前趋势评分 (0-5, Task 40): 涨停前 MA5/MA10/MA20 结构。
 * 趋势首板（多头排列）的回踩可靠性高于超跌反抽。旧数据缺省 → 中性 2 分。
 */
function preTrendScore(s: PullbackStock, reasons: string[]): number {
  if (s.preTrend === undefined) return 2;
  if (s.preTrend >= 2) {
    reasons.push("涨停前均线多头排列（趋势首板，回踩可靠性高）");
    return 5;
  }
  if (s.preTrend === 1) {
    reasons.push("涨停前中期趋势向上");
    return 3;
  }
  reasons.push("涨停前非多头形态（超跌反抽，弹性依赖情绪）");
  return 1;
}

// ── Pre-market (T-1 close) signal ──────────────────────
// 用户要求：机会/风险必须盘前就算出来，而不是盘中看谁涨了就是机会。
// 因此本组函数只使用 T-1 收盘前的数据（涨停池 + 日K），当日盘中行情
// （最新价/涨跌幅/量比）一律不参与判定，保证开盘前结果已定型且盘中不漂移。

/** 中国时区 "YYYY-MM-DD"（服务端/浏览器通用） */
export function chinaDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

/**
 * 推导 T-1 视角的股票：把 klineSummary 截断到 basisDate（含）当天，
 * 并把现价/涨跌幅/回踩深度等指标全部改按 T-1 收盘价计算。
 * basisDate 缺省时按"严格剔除今日"处理（date < 中国今天）。
 * 返回 null 表示截断后没有可用 K 线。
 */
export function deriveT1Stock(s: PullbackStock, basisDate?: string): PullbackStock | null {
  const hasBasis = Boolean(basisDate);
  const cutoff = basisDate || chinaDateStr();
  const kline = (s.klineSummary || []).filter(k =>
    hasBasis ? k.date <= cutoff : k.date < cutoff
  );
  const t1 = kline[kline.length - 1];
  if (!t1 || !(t1.close > 0)) return null;

  // 用 T-1 收盘价重算回踩指标
  const totalRise = s.limitUpClose - s.preLimitUpClose;
  const drop = s.limitUpClose - t1.close;
  const approachPct = totalRise > 0 ? Math.min((drop / totalRise) * 100, 100) : 0;
  const pullbackPct = s.limitUpClose > 0 ? ((s.limitUpClose - t1.close) / s.limitUpClose) * 100 : 0;

  const luIdx = kline.findIndex(k => k.date === s.limitUpDate);
  const daysSinceLimitUp = luIdx >= 0 ? kline.length - 1 - luIdx : 0;

  let maxPullbackPct = 0;
  let maxPullbackDate = "";
  for (let i = luIdx + 1; i < kline.length; i++) {
    const pb = s.limitUpClose > 0 ? ((s.limitUpClose - kline[i].close) / s.limitUpClose) * 100 : 0;
    if (pb > maxPullbackPct) {
      maxPullbackPct = pb;
      maxPullbackDate = kline[i].date;
    }
  }

  return {
    ...s,
    currentPrice: t1.close,
    currentChangePct: t1.changePct,
    pullbackPct,
    approachPct,
    daysSinceLimitUp,
    maxPullbackPct,
    maxPullbackDate,
    klineSummary: kline,
    // 盘中数据不得泄漏进盘前判定：换手/量比清零（评分函数据此取中性值）
    turnover: 0,
    volumeRatio: 0,
  };
}

/**
 * 盘前研判信号（T-1 收盘口径，0-100，Task 40 升级为 7 因子）。
 * 构成: 反弹确认 35 + 昨日动向 15 + 回踩位置 20 + 时间窗口 8 + 板型弹性 7 + 量能结构 10 + 涨停前趋势 5
 *   - 量能结构用 T-1 截断后 K 线的回踩段萎缩度（替代原"昨日K线形态"），盘前可得且盘中不漂移
 *   - 涨停前趋势为静态事实，盘前同样可得
 * 判定: score >= 65 且反弹已确认(≥3%) → 机会; score <= 38 → 风险; 其余 → 观察。
 * 门槛与 calcStockSignal 完全一致，便于两种口径对照。
 */
export function calcPremarketSignal(s: PullbackStock, basisDate?: string): StockSignal {
  const t1 = deriveT1Stock(s, basisDate);
  if (!t1) {
    return {
      type: "watch",
      label: SIGNAL_META.watch.label,
      score: 40,
      reasons: ["T-1 收盘数据不足，暂列观察"],
    };
  }

  const ext = buildExt(t1);
  const reasons: string[] = [];
  let score = 0;

  // ── 1. 反弹确认 (35): 截至昨收自回踩低点的反弹幅度, 核心因子 ──
  const r = ext.reboundFromLow;
  if (r >= 10) {
    score += 35;
    reasons.push(`截至昨收自低点反弹 +${r.toFixed(1)}%（强势修复）`);
  } else if (r >= 5) {
    score += 28;
    reasons.push(`截至昨收自低点反弹 +${r.toFixed(1)}%`);
  } else if (r >= REBOUND_CONFIRM) {
    score += 23;
    reasons.push(`截至昨收自低点反弹 +${r.toFixed(1)}%（反弹确认）`);
  } else if (r >= 1) {
    score += 10;
    reasons.push(`截至昨收自低点仅反弹 +${r.toFixed(1)}%，反弹未确认`);
  } else if (r >= 0) {
    score += 4;
    reasons.push("截至昨收仍在低点区域横盘");
  } else {
    score += 0;
    reasons.push(`截至昨收较前期低点再跌 ${Math.abs(r).toFixed(1)}%，阴跌未止`);
  }

  // ── 2. 昨日动向 (15): T-1 涨跌幅（替代盘中"今日动向"） ──
  const c = t1.currentChangePct;
  if (c >= 9.5) {
    score += 15;
    reasons.push(`昨日大涨 +${c.toFixed(1)}%（动能强劲）`);
  } else if (c >= 0) {
    score += 13;
    reasons.push(c <= 3 ? `昨日微涨 +${c.toFixed(1)}%（止跌企稳）` : `昨日上涨 +${c.toFixed(1)}%`);
  } else if (c >= -3) {
    score += 6;
    reasons.push(`昨日微跌 ${c.toFixed(1)}%`);
  } else {
    score += 0;
    reasons.push(`昨日大跌 ${c.toFixed(1)}%，弱势延续`);
  }

  // ── 3. 回踩位置 (20): 深回踩 + 守住起涨点为最佳（按 T-1 收盘价） ──
  const broken = Math.max(0, ((s.preLimitUpClose - t1.currentPrice) / s.preLimitUpClose) * 100);
  if (t1.approachPct >= 70) {
    if (broken <= 0.5) {
      score += 20;
      reasons.push("深回踩且守住起涨点");
    } else if (broken <= 5) {
      score += 14;
      reasons.push(`深回踩，跌破起涨点 ${broken.toFixed(1)}%`);
    } else {
      score += 6;
      reasons.push(`起涨点失守 ${broken.toFixed(1)}%，破位风险`);
    }
  } else {
    score += 12;
    reasons.push(`浅回踩（仅回吐 ${t1.approachPct.toFixed(0)}% 涨幅），强势整理`);
  }

  // ── 4. 时间窗口 (8): 低点落在涨停后 3-8 天为高发期 ──
  if (ext.lowWindow >= 3 && ext.lowWindow <= 8) {
    score += 8;
    reasons.push(`低点窗口 ${ext.lowWindow} 天（涨停后 3-8 天高发期）`);
  } else {
    score += 4;
    reasons.push(`低点窗口 ${ext.lowWindow} 天（偏离主流节奏）`);
  }

  // ── 5. 板型弹性 (7): 首板是回踩再涨的主力 ──
  if (ext.streak === 1) {
    score += 7;
    reasons.push("首板弹性（回踩再涨的主力）");
  } else if (ext.streak === 2) {
    score += 5;
    reasons.push("2 板股，弹性适中");
  } else {
    score += 2;
    reasons.push(`${ext.streak} 板高位，深回踩多属情绪退潮`);
  }

  // ── 6. 量能结构 (10, Task 40): 回踩段缩量度（T-1 截断 K 线可得，盘前不漂移） ──
  score += volumeStructureScore(ext, reasons);

  // ── 7. 涨停前趋势 (5, Task 40): 趋势首板 > 超跌反抽 ──
  score += preTrendScore(t1, reasons);

  // ── 硬性风险否决: 未脱离低点 + 昨日续跌 ──
  if (r < 1 && c < -1) {
    score = Math.min(score, 30);
    reasons.unshift("未脱离低点区域且昨日续跌（弱势特征）");
  }
  // ── 龙回头形态加成标注 (不改分, 仅提示) ──
  if (r >= REBOUND_CONFIRM && c > 0 && t1.approachPct >= 70 && broken <= 0.5) {
    reasons.unshift("深回踩 + 低点反弹 + 昨日企稳，典型「龙回头」形态（盘前口径）");
  }

  score = Math.min(100, Math.max(0, Math.round(score)));
  const type: SignalType =
    score >= 65 && r >= REBOUND_CONFIRM ? "opportunity"
      : score <= 38 ? "risk"
      : "watch";

  return { type, label: SIGNAL_META[type].label, score, reasons: reasons.slice(0, 9) };
}

/**
 * 机会/风险信号评分 (0-100, Task 40 升级为 7 因子)。
 * 构成: 反弹确认 35 + 今日动向 15 + 回踩位置 20 + 时间窗口 8 + 板型弹性 7 + 量能结构 10 + 涨停前趋势 5
 *   - 量能结构: 回踩段均量较涨停日量的萎缩度（缩量回踩=抛压枯竭；放量回踩=出逃迹象）
 *   - 涨停前趋势: 涨停前均线多头排列（趋势首板）优于超跌反抽
 * 判定: score >= 65 且反弹已确认(≥3%) → 机会; score <= 38 → 风险; 其余 → 观察。
 * 旧数据（K线无量/preTrend 缺失）对应项取中性分，与历史口径平滑兼容。
 */
export function calcStockSignal(s: PullbackStock): StockSignal {
  const ext = buildExt(s);
  const reasons: string[] = [];
  let score = 0;

  // ── 1. 反弹确认 (35): 自回踩低点的反弹幅度, 核心因子 ──
  const r = ext.reboundFromLow;
  if (r >= 10) {
    score += 35;
    reasons.push(`自低点反弹 +${r.toFixed(1)}%（强势修复）`);
  } else if (r >= 5) {
    score += 28;
    reasons.push(`自低点反弹 +${r.toFixed(1)}%`);
  } else if (r >= REBOUND_CONFIRM) {
    score += 23;
    reasons.push(`自低点反弹 +${r.toFixed(1)}%（反弹确认）`);
  } else if (r >= 1) {
    score += 10;
    reasons.push(`自低点仅反弹 +${r.toFixed(1)}%，反弹未确认`);
  } else if (r >= 0) {
    score += 4;
    reasons.push("仍在低点区域横盘");
  } else {
    score += 0;
    reasons.push(`较前期低点再跌 ${Math.abs(r).toFixed(1)}%，阴跌未止`);
  }

  // ── 2. 今日动向 (15) ──
  const c = s.currentChangePct;
  if (c >= 9.5) {
    score += 15;
    reasons.push(`今日大涨 +${c.toFixed(1)}%（再度封板动能）`);
  } else if (c >= 0) {
    score += 13;
    reasons.push(c <= 3 ? `今日微涨 +${c.toFixed(1)}%（止跌企稳）` : `今日上涨 +${c.toFixed(1)}%`);
  } else if (c >= -3) {
    score += 6;
    reasons.push(`今日微跌 ${c.toFixed(1)}%`);
  } else {
    score += 0;
    reasons.push(`今日大跌 ${c.toFixed(1)}%，弱势延续`);
  }

  // ── 3. 回踩位置 (20): 深回踩 + 守住起涨点为最佳 ──
  const broken = Math.max(0, ((s.preLimitUpClose - s.currentPrice) / s.preLimitUpClose) * 100);
  if (s.approachPct >= 70) {
    if (broken <= 0.5) {
      score += 20;
      reasons.push("深回踩且守住起涨点");
    } else if (broken <= 5) {
      score += 14;
      reasons.push(`深回踩，跌破起涨点 ${broken.toFixed(1)}%`);
    } else {
      score += 6;
      reasons.push(`起涨点失守 ${broken.toFixed(1)}%，破位风险`);
    }
  } else {
    score += 12;
    reasons.push(`浅回踩（仅回吐 ${s.approachPct.toFixed(0)}% 涨幅），强势整理`);
  }

  // ── 4. 时间窗口 (8): 低点落在涨停后 3-8 天为高发期 ──
  if (ext.lowWindow >= 3 && ext.lowWindow <= 8) {
    score += 8;
    reasons.push(`低点窗口 ${ext.lowWindow} 天（涨停后 3-8 天高发期）`);
  } else {
    score += 4;
    reasons.push(`低点窗口 ${ext.lowWindow} 天（偏离主流节奏）`);
  }

  // ── 5. 板型弹性 (7): 首板是回踩再涨的主力 ──
  if (ext.streak === 1) {
    score += 7;
    reasons.push("首板弹性（回踩再涨的主力）");
  } else if (ext.streak === 2) {
    score += 5;
    reasons.push("2 板股，弹性适中");
  } else {
    score += 2;
    reasons.push(`${ext.streak} 板高位，深回踩多属情绪退潮`);
  }

  // ── 6. 量能结构 (10, Task 40): 回踩段缩量度；盘中量比降级为标注 ──
  score += volumeStructureScore(ext, reasons);
  if (s.volumeRatio >= 1.5) {
    reasons.push(`今日放量反抽（量比 ${s.volumeRatio.toFixed(1)}，动能确认）`);
  }

  // ── 7. 涨停前趋势 (5, Task 40): 趋势首板 > 超跌反抽 ──
  score += preTrendScore(s, reasons);

  // ── 硬性风险否决: 未脱离低点 + 今日续跌 (共性归纳中的弱势特征) ──
  if (r < 1 && c < -1) {
    score = Math.min(score, 30);
    reasons.unshift("未脱离低点区域且今日续跌（弱势特征）");
  }
  // ── 龙回头形态加成标注 (不改分, 仅提示) ──
  if (r >= REBOUND_CONFIRM && c > 0 && s.approachPct >= 70 && broken <= 0.5) {
    reasons.unshift("深回踩 + 低点反弹 + 今日企稳，典型「龙回头」形态");
  }

  score = Math.min(100, Math.max(0, Math.round(score)));
  const type: SignalType =
    score >= 65 && r >= REBOUND_CONFIRM ? "opportunity"
      : score <= 38 ? "risk"
      : "watch";

  return { type, label: SIGNAL_META[type].label, score, reasons: reasons.slice(0, 9) };
}
