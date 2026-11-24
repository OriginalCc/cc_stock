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
}

/** Per-stock derived metrics (from kline) shared across analyses */
export interface StockExt {
  reboundFromLow: number; // 现价相对涨停后最低收盘价的涨幅(%)
  lowWindow: number;      // 回踩低点距涨停日的交易日数
  daysSinceLow: number;   // 低点距最新的交易日数(反弹启动耗时)
  streak: number;         // 连板数(涨停日向前连续涨停天数)
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
  return { reboundFromLow, lowWindow, daysSinceLow, streak };
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
 * 机会/风险信号评分 (0-100)。构成:
 *   反弹确认 40 + 今日动向 20 + 回踩位置 20 + 时间窗口 10 + 板型弹性 10 + 量能确认 10
 * 判定: score >= 65 且反弹已确认(≥3%) → 机会; score <= 38 → 风险; 其余 → 观察。
 */
export function calcStockSignal(s: PullbackStock): StockSignal {
  const ext = buildExt(s);
  const reasons: string[] = [];
  let score = 0;

  // ── 1. 反弹确认 (40): 自回踩低点的反弹幅度, 核心因子 ──
  const r = ext.reboundFromLow;
  if (r >= 10) {
    score += 40;
    reasons.push(`自低点反弹 +${r.toFixed(1)}%（强势修复）`);
  } else if (r >= 5) {
    score += 32;
    reasons.push(`自低点反弹 +${r.toFixed(1)}%`);
  } else if (r >= REBOUND_CONFIRM) {
    score += 26;
    reasons.push(`自低点反弹 +${r.toFixed(1)}%（反弹确认）`);
  } else if (r >= 1) {
    score += 12;
    reasons.push(`自低点仅反弹 +${r.toFixed(1)}%，反弹未确认`);
  } else if (r >= 0) {
    score += 5;
    reasons.push("仍在低点区域横盘");
  } else {
    score += 0;
    reasons.push(`较前期低点再跌 ${Math.abs(r).toFixed(1)}%，阴跌未止`);
  }

  // ── 2. 今日动向 (20) ──
  const c = s.currentChangePct;
  if (c >= 9.5) {
    score += 20;
    reasons.push(`今日大涨 +${c.toFixed(1)}%（再度封板动能）`);
  } else if (c >= 0) {
    score += 18;
    reasons.push(c <= 3 ? `今日微涨 +${c.toFixed(1)}%（止跌企稳）` : `今日上涨 +${c.toFixed(1)}%`);
  } else if (c >= -3) {
    score += 8;
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

  // ── 4. 时间窗口 (10): 低点落在涨停后 3-8 天为高发期 ──
  if (ext.lowWindow >= 3 && ext.lowWindow <= 8) {
    score += 10;
    reasons.push(`低点窗口 ${ext.lowWindow} 天（涨停后 3-8 天高发期）`);
  } else {
    score += 5;
    reasons.push(`低点窗口 ${ext.lowWindow} 天（偏离主流节奏）`);
  }

  // ── 5. 板型弹性 (10): 首板是回踩再涨的主力 ──
  if (ext.streak === 1) {
    score += 10;
    reasons.push("首板弹性（回踩再涨的主力）");
  } else if (ext.streak === 2) {
    score += 7;
    reasons.push("2 板股，弹性适中");
  } else {
    score += 3;
    reasons.push(`${ext.streak} 板高位，深回踩多属情绪退潮`);
  }

  // ── 6. 量能确认 (10, 加分项): 行情富化缺失时取中性 ──
  if (s.volumeRatio > 0) {
    if (s.volumeRatio >= 1.5) {
      score += 10;
      reasons.push(`放量反抽（量比 ${s.volumeRatio.toFixed(1)}）`);
    } else if (s.volumeRatio >= 1) {
      score += 7;
      reasons.push(`量能温和（量比 ${s.volumeRatio.toFixed(1)}）`);
    } else {
      score += 3;
      reasons.push(`缩量反抽（量比 ${s.volumeRatio.toFixed(1)}），待量能确认`);
    }
  } else {
    score += 4;
  }

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

  return { type, label: SIGNAL_META[type].label, score, reasons: reasons.slice(0, 7) };
}
