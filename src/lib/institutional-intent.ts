// ── 主力意图识别引擎 ──
// Based on price-volume pattern analysis to identify institutional behavior:
// 吸筹 (accumulation), 出货 (distribution), 洗盘 (shakeout), 拉升 (markup)

import type { TimelineItem } from "@/hooks/use-stock-data";

// ── Types ──

export type InstitutionalIntent = "吸筹" | "出货" | "洗盘" | "拉升" | "震荡" | "观察";

export interface IntentSignal {
  intent: InstitutionalIntent;
  confidence: number;      // 0-100
  reasons: string[];       // Human-readable reasons
  volumePattern: string;   // Volume pattern description
  pricePattern: string;    // Price pattern description
  suggestion: string;      // Trading suggestion
  icon: string;            // Emoji icon
  color: string;           // Tailwind color class
  bgColor: string;         // Tailwind bg class
  borderColor: string;     // Tailwind border class
}

export interface DayIntentResult {
  date: string;
  dayLabel: string;
  open: number;
  close: number;
  high: number;
  low: number;
  changePercent: number;
  totalVolume: number;
  intent: IntentSignal;
}

export interface FiveDayIntentResult {
  overallIntent: IntentSignal;
  dailyIntents: DayIntentResult[];
  trendPhase: string;       // e.g., "底部吸筹区", "拉升初期", "高位出货区"
  riskLevel: number;        // 1-5, 5=highest risk
}

// ── Helper: segment a day's data into periods ──

interface VolumePriceSegment {
  startIdx: number;
  endIdx: number;
  totalVolume: number;
  priceChange: number;       // % change
  avgVolume: number;
  maxVolume: number;
  minVolume: number;
  volumeVariance: number;    // how uneven volume distribution is
  upBars: number;
  downBars: number;
  totalBars: number;
}

function segmentDay(data: TimelineItem[], segmentMinutes: number): VolumePriceSegment[] {
  if (data.length < 2) return [];
  const segments: VolumePriceSegment[] = [];
  const segSize = Math.max(1, Math.round(segmentMinutes));

  for (let i = 0; i < data.length; i += segSize) {
    const chunk = data.slice(i, Math.min(i + segSize, data.length));
    if (chunk.length === 0) continue;

    const startPrice = chunk[0].price;
    const endPrice = chunk[chunk.length - 1].price;
    const volumes = chunk.map(d => d.volume);
    const totalVol = volumes.reduce((a, b) => a + b, 0);
    const avgVol = totalVol / volumes.length;
    const maxVol = Math.max(...volumes);
    const minVol = Math.min(...volumes);
    const volVariance = avgVol > 0 ? volumes.reduce((s, v) => s + Math.pow(v - avgVol, 2), 0) / volumes.length / (avgVol * avgVol) : 0;
    const upBars = chunk.filter((d, idx) => idx > 0 && d.price >= chunk[idx - 1].price).length;
    const downBars = chunk.length - 1 - upBars;

    segments.push({
      startIdx: i,
      endIdx: i + chunk.length - 1,
      totalVolume: totalVol,
      priceChange: startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0,
      avgVolume: avgVol,
      maxVolume: maxVol,
      minVolume: minVol,
      volumeVariance: volVariance,
      upBars,
      downBars,
      totalBars: chunk.length - 1,
    });
  }
  return segments;
}

// ── Core: Analyze one day's data for institutional intent ──

function analyzeDayIntent(data: TimelineItem[], prevClose: number): IntentSignal {
  if (data.length < 10) return defaultIntent("观察");

  const open = data[0].price;
  const close = data[data.length - 1].price;
  const high = Math.max(...data.map(d => d.price));
  const low = Math.min(...data.map(d => d.price));
  const changePct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;

  // Split into 4 periods (open, morning, afternoon open, afternoon close)
  const midPoint = Math.floor(data.length / 2);
  const q1 = Math.floor(data.length / 4);
  const q3 = Math.floor(data.length * 3 / 4);

  const openPeriod = data.slice(0, q1);
  const morningPeriod = data.slice(q1, midPoint);
  const afternoonOpen = data.slice(midPoint, q3);
  const closePeriod = data.slice(q3);

  // Volume analysis
  const totalVol = data.reduce((s, d) => s + d.volume, 0);
  const openVol = openPeriod.reduce((s, d) => s + d.volume, 0);
  const closeVol = closePeriod.reduce((s, d) => s + d.volume, 0);
  const midVol = morningPeriod.reduce((s, d) => s + d.volume, 0) + afternoonOpen.reduce((s, d) => s + d.volume, 0);

  const openVolRatio = totalVol > 0 ? openVol / totalVol : 0;
  const closeVolRatio = totalVol > 0 ? closeVol / totalVol : 0;
  const midVolRatio = totalVol > 0 ? midVol / totalVol : 0;

  // Segment-based analysis (6 segments per day ~40min each)
  const segments = segmentDay(data, Math.floor(data.length / 6));

  // ── Key metrics ──
  let score = { accumulation: 0, distribution: 0, shakeout: 0, markup: 0 };
  const reasons: string[] = [];

  // 1. Volume-price divergence analysis
  // Accumulation: price drops but volume shrinks (sellers exhausted)
  // Distribution: price rises with shrinking volume (fake rally)
  const volByDir = segments.reduce((acc, seg) => {
    if (seg.priceChange > 0.1) acc.upVol += seg.totalVolume;
    else if (seg.priceChange < -0.1) acc.downVol += seg.totalVolume;
    else acc.flatVol += seg.totalVolume;
    return acc;
  }, { upVol: 0, downVol: 0, flatVol: 0 });

  const upVolRatio = totalVol > 0 ? volByDir.upVol / totalVol : 0.5;
  const downVolRatio = totalVol > 0 ? volByDir.downVol / totalVol : 0.5;

  // 2. Opening pattern (first 30 min)
  const openChange = prevClose > 0 ? ((openPeriod[openPeriod.length - 1].price - open) / prevClose) * 100 : 0;

  // 3. Closing pattern (last 30 min)
  const closeChange = closePeriod.length >= 2
    ? ((closePeriod[closePeriod.length - 1].price - closePeriod[0].price) / closePeriod[0].price) * 100
    : 0;

  // 4. VWAP analysis
  const vwap = data[data.length - 1].avgPrice;
  const priceVsVwap = vwap > 0 ? ((close - vwap) / vwap) * 100 : 0;

  // 5. Volume concentration
  const maxSegment = segments.length > 0 ? segments.reduce((a, b) => a.totalVolume > b.totalVolume ? a : b) : null;

  // ══════ SCORING RULES ══════

  // ── ACCUMULATION (吸筹) patterns ──
  // A. Price near lows, volume picking up on up-moves
  if (changePct > -1 && changePct < 1.5 && upVolRatio > 0.55) {
    score.accumulation += 25;
    reasons.push("量价配合：上涨放量、下跌缩量");
  }
  // B. Price below VWAP but closing near VWAP (recovering)
  if (priceVsVwap > -0.3 && priceVsVwap < 0.5 && low < vwap) {
    score.accumulation += 20;
    reasons.push("价格围绕均价线震荡回升");
  }
  // C. Morning dip recovered in afternoon
  if (openChange < -0.3 && closeChange > 0.2) {
    score.accumulation += 20;
    reasons.push("早盘下探后午后回升");
  }
  // D. Closing volume > opening volume (late-day accumulation)
  if (closeVolRatio > openVolRatio * 1.2 && closeVolRatio > 0.2) {
    score.accumulation += 15;
    reasons.push("尾盘放量拉升");
  }
  // E. Low volume variance (steady accumulation)
  const avgSegVariance = segments.length > 0 ? segments.reduce((s, seg) => s + seg.volumeVariance, 0) / segments.length : 0;
  if (avgSegVariance < 0.3 && Math.abs(changePct) < 1.5) {
    score.accumulation += 10;
    reasons.push("成交量分布均匀（稳步吸筹）");
  }

  // ── DISTRIBUTION (出货) patterns ──
  // A. High volume on down-moves
  if (downVolRatio > 0.55 && changePct < -0.5) {
    score.distribution += 30;
    reasons.push("下跌放量：主力借高位抛售");
  }
  // B. Price above VWAP but closing below (failing at highs)
  if (high > vwap * 1.005 && close < vwap && changePct < 0) {
    score.distribution += 25;
    reasons.push("冲高回落跌破均价线");
  }
  // C. Opening spike + distribution
  if (openChange > 0.5 && closeChange < -0.3) {
    score.distribution += 25;
    reasons.push("早盘冲高后持续回落");
  }
  // D. Heavy volume on rise but price can't hold (fake breakout)
  if (upVolRatio > 0.5 && close < (high + low) / 2) {
    score.distribution += 15;
    reasons.push("放量上攻但收盘偏弱（假突破）");
  }
  // E. Opening volume very heavy (gap-up distribution)
  if (openVolRatio > 0.25 && changePct < 0.5) {
    score.distribution += 15;
    reasons.push("开盘放量但涨幅有限");
  }
  // F. Late-day dump
  if (closeChange < -0.3 && closeVolRatio > 0.2) {
    score.distribution += 20;
    reasons.push("尾盘放量下杀");
  }

  // ── SHAKEOUT (洗盘) patterns ──
  // A. Quick dip with volume then recovery
  if (low < prevClose * 0.98 && close > prevClose * 0.995 && changePct > -0.5) {
    score.shakeout += 30;
    reasons.push("快速下探后收回（洗盘特征）");
  }
  // B. Intraday range > 2% but closes near open
  const range = prevClose > 0 ? ((high - low) / prevClose) * 100 : 0;
  if (range > 2 && Math.abs(changePct) < 0.8) {
    score.shakeout += 25;
    reasons.push("日内振幅大但收盘平稳（震仓洗盘）");
  }
  // C. Volume spike at low, then shrinking volume recovery
  if (maxSegment && segments.length > 2) {
    const lowIdx = data.findIndex(d => d.price === low);
    const lowSegIdx = Math.floor(lowIdx / Math.max(1, Math.floor(data.length / segments.length)));
    if (lowSegIdx < segments.length && lowSegIdx > 0) {
      const lowSeg = segments[lowSegIdx];
      const afterSegs = segments.slice(lowSegIdx + 1);
      const avgAfterVol = afterSegs.length > 0 ? afterSegs.reduce((s, seg) => s + seg.avgVolume, 0) / afterSegs.length : 0;
      if (lowSeg.avgVolume > avgAfterVol * 1.5 && changePct > -0.5) {
        score.shakeout += 20;
        reasons.push("低位放量后缩量回升（恐慌洗盘）");
      }
    }
  }

  // ── MARKUP (拉升) patterns ──
  // A. Strong upward move with volume
  if (changePct > 1.5 && upVolRatio > 0.6) {
    score.markup += 30;
    reasons.push("放量拉升：主力强势上攻");
  }
  // B. Closing near high
  if (close > high * 0.995 && changePct > 0.5) {
    score.markup += 25;
    reasons.push("收盘接近日内高点");
  }
  // C. Afternoon breakout
  if (closeChange > 0.5 && closeVolRatio > openVolRatio) {
    score.markup += 20;
    reasons.push("午后放量突破");
  }
  // D. Price well above VWAP
  if (priceVsVwap > 0.5 && changePct > 0.8) {
    score.markup += 15;
    reasons.push("价格远高于均价线");
  }
  // E. Volume increasing trend
  if (segments.length >= 3) {
    const volTrend = segments.slice(1).every((seg, i) => seg.totalVolume >= segments[i].totalVolume * 0.9);
    if (volTrend && changePct > 0.5) {
      score.markup += 10;
      reasons.push("量能递增上攻");
    }
  }

  // ── Determine primary intent ──
  const maxScore = Math.max(score.accumulation, score.distribution, score.shakeout, score.markup);
  let intent: InstitutionalIntent;
  let confidence: number;

  if (maxScore < 15) {
    intent = "震荡";
    confidence = 30;
    reasons.length = 0;
    reasons.push("量价无明显方向，观望为主");
  } else if (score.accumulation === maxScore) {
    intent = "吸筹";
    confidence = Math.min(95, 40 + score.accumulation);
  } else if (score.distribution === maxScore) {
    intent = "出货";
    confidence = Math.min(95, 40 + score.distribution);
  } else if (score.shakeout === maxScore) {
    intent = "洗盘";
    confidence = Math.min(90, 35 + score.shakeout);
  } else {
    intent = "拉升";
    confidence = Math.min(95, 40 + score.markup);
  }

  return buildIntentSignal(intent, confidence, reasons, changePct, upVolRatio);
}

function defaultIntent(intent: InstitutionalIntent): IntentSignal {
  return buildIntentSignal(intent, 20, ["数据不足，无法判断"], 0, 0.5);
}

function buildIntentSignal(
  intent: InstitutionalIntent,
  confidence: number,
  reasons: string[],
  changePct: number,
  upVolRatio: number,
): IntentSignal {
  const config: Record<InstitutionalIntent, {
    icon: string; color: string; bgColor: string; borderColor: string;
    volumePattern: string; pricePattern: string; suggestion: string;
  }> = {
    "吸筹": {
      icon: "🟢",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
      volumePattern: "上涨放量、下跌缩量",
      pricePattern: "价格重心上移、回调幅度小",
      suggestion: "可跟随主力低吸，正T为主",
    },
    "出货": {
      icon: "🔴",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      volumePattern: "下跌放量、反弹缩量",
      pricePattern: "冲高回落、收盘偏弱",
      suggestion: "警惕主力派发，反T冲高卖出为主",
    },
    "洗盘": {
      icon: "🟡",
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/30",
      volumePattern: "低位放量后缩量回升",
      pricePattern: "快速下探后收回",
      suggestion: "持股不恐慌，可趁低位加仓",
    },
    "拉升": {
      icon: "🚀",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      volumePattern: "量能递增、持续放量",
      pricePattern: "收盘接近日高、远超均价线",
      suggestion: "顺势持有，回调即买点",
    },
    "震荡": {
      icon: "⚪",
      color: "text-gray-500 dark:text-gray-400",
      bgColor: "bg-gray-500/10",
      borderColor: "border-gray-500/30",
      volumePattern: "量能平稳、无明显异动",
      pricePattern: "围绕均价线上下波动",
      suggestion: "观望为主，等待方向明确",
    },
    "观察": {
      icon: "🔍",
      color: "text-gray-400 dark:text-gray-500",
      bgColor: "bg-gray-400/10",
      borderColor: "border-gray-400/30",
      volumePattern: "数据不足",
      pricePattern: "数据不足",
      suggestion: "等待更多数据",
    },
  };

  const c = config[intent];
  return {
    intent,
    confidence,
    reasons,
    volumePattern: c.volumePattern,
    pricePattern: c.pricePattern,
    suggestion: c.suggestion,
    icon: c.icon,
    color: c.color,
    bgColor: c.bgColor,
    borderColor: c.borderColor,
  };
}

// ── Public: Analyze 5-day data for institutional intent ──

export function analyzeFiveDayIntent(
  items: TimelineItem[],
  dayBoundaries: number[],
  dayLabels: string[],
  prevClose: number,
): FiveDayIntentResult {
  if (items.length < 10 || dayBoundaries.length === 0) {
    return {
      overallIntent: buildIntentSignal("观察", 10, ["数据不足"], 0, 0.5),
      dailyIntents: [],
      trendPhase: "数据不足",
      riskLevel: 3,
    };
  }

  // Split data by day
  const dayRanges: { start: number; end: number }[] = [];
  for (let i = 0; i < dayBoundaries.length; i++) {
    const start = dayBoundaries[i];
    const end = i + 1 < dayBoundaries.length ? dayBoundaries[i + 1] : items.length;
    dayRanges.push({ start, end });
  }

  // Also add the last segment if there's data after last boundary
  const lastBoundary = dayBoundaries[dayBoundaries.length - 1];
  if (lastBoundary < items.length - 1 && dayRanges.length > 0) {
    // Already covered by the last range
  }

  let dayPrevClose = prevClose;
  const dailyIntents: DayIntentResult[] = [];

  for (let i = 0; i < dayRanges.length; i++) {
    const { start, end } = dayRanges[i];
    const dayData = items.slice(start, end);
    if (dayData.length < 5) continue;

    const dayOpen = dayData[0].price;
    const dayClose = dayData[dayData.length - 1].price;
    const dayHigh = Math.max(...dayData.map(d => d.price));
    const dayLow = Math.min(...dayData.map(d => d.price));
    const dayChangePct = dayPrevClose > 0 ? ((dayClose - dayPrevClose) / dayPrevClose) * 100 : 0;
    const dayTotalVol = dayData.reduce((s, d) => s + d.volume, 0);

    const intent = analyzeDayIntent(dayData, dayPrevClose);

    dailyIntents.push({
      date: dayData[0].time || `Day${i + 1}`,
      dayLabel: dayLabels[i] || `第${i + 1}日`,
      open: dayOpen,
      close: dayClose,
      high: dayHigh,
      low: dayLow,
      changePercent: dayChangePct,
      totalVolume: dayTotalVol,
      intent,
    });

    dayPrevClose = dayClose;
  }

  // ── Determine overall intent ──
  if (dailyIntents.length === 0) {
    return {
      overallIntent: buildIntentSignal("观察", 10, ["数据不足"], 0, 0.5),
      dailyIntents: [],
      trendPhase: "数据不足",
      riskLevel: 3,
    };
  }

  // Weight recent days more heavily
  const weights = dailyIntents.map((_, i) => 1 + i * 0.5);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const overallScores = { accumulation: 0, distribution: 0, shakeout: 0, markup: 0 };
  for (let i = 0; i < dailyIntents.length; i++) {
    const d = dailyIntents[i];
    const w = weights[i] / totalWeight;
    switch (d.intent.intent) {
      case "吸筹": overallScores.accumulation += w * d.intent.confidence; break;
      case "出货": overallScores.distribution += w * d.intent.confidence; break;
      case "洗盘": overallScores.shakeout += w * d.intent.confidence; break;
      case "拉升": overallScores.markup += w * d.intent.confidence; break;
    }
  }

  // Trend phase detection
  const firstDay = dailyIntents[0];
  const lastDay = dailyIntents[dailyIntents.length - 1];
  const overallChange = dailyIntents.length > 1
    ? ((lastDay.close - firstDay.open) / firstDay.open) * 100
    : lastDay.changePercent;

  let trendPhase: string;
  let riskLevel: number;

  const maxOverall = Math.max(overallScores.accumulation, overallScores.distribution, overallScores.shakeout, overallScores.markup);

  if (maxOverall === overallScores.distribution && overallScores.distribution > 0.3) {
    trendPhase = "高位出货区";
    riskLevel = 5;
  } else if (maxOverall === overallScores.markup && overallScores.markup > 0.3) {
    trendPhase = overallChange > 5 ? "拉升后期" : "拉升初期";
    riskLevel = overallChange > 5 ? 3 : 2;
  } else if (maxOverall === overallScores.accumulation && overallScores.accumulation > 0.3) {
    trendPhase = overallChange < -3 ? "底部吸筹区" : "震荡吸筹区";
    riskLevel = 2;
  } else if (maxOverall === overallScores.shakeout && overallScores.shakeout > 0.3) {
    trendPhase = "洗盘整理区";
    riskLevel = 3;
  } else {
    trendPhase = "震荡整理区";
    riskLevel = 3;
  }

  // Build overall intent
  let overallIntent: InstitutionalIntent;
  const overallReasons: string[] = [];

  if (maxOverall < 0.15) {
    overallIntent = "震荡";
    overallReasons.push("5日量价无明显主力行为");
  } else if (overallScores.accumulation === maxOverall) {
    overallIntent = "吸筹";
    overallReasons.push("多日呈现吸筹特征");
  } else if (overallScores.distribution === maxOverall) {
    overallIntent = "出货";
    overallReasons.push("多日呈现出货特征");
  } else if (overallScores.shakeout === maxOverall) {
    overallIntent = "洗盘";
    overallReasons.push("多日呈现洗盘特征");
  } else {
    overallIntent = "拉升";
    overallReasons.push("多日呈现拉升特征");
  }

  // Add trend context
  if (overallChange > 3) overallReasons.push(`5日累计涨幅${overallChange.toFixed(1)}%`);
  else if (overallChange < -3) overallReasons.push(`5日累计跌幅${Math.abs(overallChange).toFixed(1)}%`);

  const overallConfidence = Math.min(90, Math.round(maxOverall * 100));

  return {
    overallIntent: buildIntentSignal(overallIntent, overallConfidence, overallReasons, overallChange, 0.5),
    dailyIntents,
    trendPhase,
    riskLevel,
  };
}
