// ── 主力意图识别引擎 (V2 优化版) ──
// Based on price-volume pattern analysis to identify institutional behavior:
// 吸筹 (accumulation), 出货 (distribution), 洗盘 (shakeout), 拉升 (markup)
//
// V2 优化点:
// 1. 增加成交量趋势/集中度/脉冲分析
// 2. 价格位置感知（5日区间相对位置）
// 3. 更精细的评分规则（缩量横盘、诱多、回踩确认等）
// 4. 跨日关联分析（吸筹→拉升、拉升→出货演进）
// 5. 置信度基于评分差距和信号一致性

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
  scores: IntentScores;     // V2: expose raw scores for transparency
}

export interface FiveDayIntentResult {
  overallIntent: IntentSignal;
  dailyIntents: DayIntentResult[];
  trendPhase: string;       // e.g., "底部吸筹区", "拉升初期", "高位出货区"
  riskLevel: number;        // 1-5, 5=highest risk
  crossDayPattern: string;  // V2: cross-day pattern description
}

// ── Score Types ──

export interface IntentScores {
  accumulation: number;
  distribution: number;
  shakeout: number;
  markup: number;
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

// ── V2: Volume Trend Analysis ──

interface VolumeTrendAnalysis {
  trend: "increasing" | "decreasing" | "stable" | "volatile";
  concentrationRatio: number;  // 0-1, how concentrated volume is in few segments
  spikeCount: number;          // number of volume spikes (> 2x average)
  avgSpikeDirection: "up" | "down" | "mixed";  // price direction during spikes
  volumeOnUpMoves: number;     // total volume on up-moving segments
  volumeOnDownMoves: number;   // total volume on down-moving segments
  volumeOnFlatMoves: number;   // total volume on flat segments
  upVolumeRatio: number;       // volume on up / total
  downVolumeRatio: number;     // volume on down / total
}

function analyzeVolumeTrend(segments: VolumePriceSegment[], totalVol: number): VolumeTrendAnalysis {
  if (segments.length < 2) {
    return {
      trend: "stable", concentrationRatio: 0.5, spikeCount: 0,
      avgSpikeDirection: "mixed", volumeOnUpMoves: 0, volumeOnDownMoves: 0,
      volumeOnFlatMoves: 0, upVolumeRatio: 0.5, downVolumeRatio: 0.5,
    };
  }

  // Volume trend: are segments generally increasing or decreasing?
  let increasingPairs = 0;
  let decreasingPairs = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].totalVolume > segments[i - 1].totalVolume * 1.1) increasingPairs++;
    else if (segments[i].totalVolume < segments[i - 1].totalVolume * 0.9) decreasingPairs++;
  }
  let trend: VolumeTrendAnalysis["trend"] = "stable";
  if (increasingPairs > segments.length * 0.6) trend = "increasing";
  else if (decreasingPairs > segments.length * 0.6) trend = "decreasing";
  else if (increasingPairs > 1 && decreasingPairs > 1) trend = "volatile";

  // Concentration ratio: what % of volume is in the top 2 segments?
  const sortedVols = segments.map(s => s.totalVolume).sort((a, b) => b - a);
  const top2Vol = sortedVols.slice(0, Math.min(2, sortedVols.length)).reduce((a, b) => a + b, 0);
  const concentrationRatio = totalVol > 0 ? top2Vol / totalVol : 0.5;

  // Volume spikes
  const avgSegVol = totalVol / segments.length;
  let spikeCount = 0;
  let spikeUpVol = 0;
  let spikeDownVol = 0;
  for (const seg of segments) {
    if (seg.totalVolume > avgSegVol * 2) {
      spikeCount++;
      if (seg.priceChange > 0.05) spikeUpVol += seg.totalVolume;
      else if (seg.priceChange < -0.05) spikeDownVol += seg.totalVolume;
    }
  }
  const avgSpikeDirection: VolumeTrendAnalysis["avgSpikeDirection"] =
    spikeUpVol > spikeDownVol * 1.5 ? "up" :
    spikeDownVol > spikeUpVol * 1.5 ? "down" : "mixed";

  // Volume by direction
  let volumeOnUpMoves = 0, volumeOnDownMoves = 0, volumeOnFlatMoves = 0;
  for (const seg of segments) {
    if (seg.priceChange > 0.1) volumeOnUpMoves += seg.totalVolume;
    else if (seg.priceChange < -0.1) volumeOnDownMoves += seg.totalVolume;
    else volumeOnFlatMoves += seg.totalVolume;
  }
  const upVolumeRatio = totalVol > 0 ? volumeOnUpMoves / totalVol : 0.5;
  const downVolumeRatio = totalVol > 0 ? volumeOnDownMoves / totalVol : 0.5;

  return {
    trend, concentrationRatio, spikeCount, avgSpikeDirection,
    volumeOnUpMoves, volumeOnDownMoves, volumeOnFlatMoves,
    upVolumeRatio, downVolumeRatio,
  };
}

// ── V2: Price Position Analysis ──

interface PricePositionAnalysis {
  positionInRange: number;     // 0-1, where current close is within the day's range
  upperWickRatio: number;      // ratio of upper wick to total range
  lowerWickRatio: number;      // ratio of lower wick to total range
  bodyRatio: number;           // ratio of body to total range
  isDoji: boolean;             // very small body relative to range
  closeVsVwap: number;         // % difference between close and VWAP
  highVsVwap: number;          // % difference between high and VWAP
}

function analyzePricePosition(
  open: number, close: number, high: number, low: number, vwap: number
): PricePositionAnalysis {
  const range = high - low;
  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;

  const positionInRange = range > 0 ? (close - low) / range : 0.5;
  const upperWickRatio = range > 0 ? upperWick / range : 0;
  const lowerWickRatio = range > 0 ? lowerWick / range : 0;
  const bodyRatio = range > 0 ? body / range : 0;
  const isDoji = bodyRatio < 0.1 && range > 0;

  const closeVsVwap = vwap > 0 ? ((close - vwap) / vwap) * 100 : 0;
  const highVsVwap = vwap > 0 ? ((high - vwap) / vwap) * 100 : 0;

  return {
    positionInRange, upperWickRatio, lowerWickRatio,
    bodyRatio, isDoji, closeVsVwap, highVsVwap,
  };
}

// ── Core: Analyze one day's data for institutional intent (V2) ──

function analyzeDayIntent(data: TimelineItem[], prevClose: number): { signal: IntentSignal; scores: IntentScores } {
  if (data.length < 10) return { signal: defaultIntent("观察"), scores: { accumulation: 0, distribution: 0, shakeout: 0, markup: 0 } };

  const open = data[0].price;
  const close = data[data.length - 1].price;
  const high = Math.max(...data.map(d => d.price));
  const low = Math.min(...data.map(d => d.price));
  const changePct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;

  // Split into 4 periods
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

  // Segment-based analysis (8 segments for finer granularity)
  const segments = segmentDay(data, Math.floor(data.length / 8));

  // V2: Volume trend analysis
  const volTrend = analyzeVolumeTrend(segments, totalVol);

  // VWAP
  const vwap = data[data.length - 1].avgPrice;

  // V2: Price position analysis
  const pricePos = analyzePricePosition(open, close, high, low, vwap);

  // Opening & closing patterns
  const openChange = prevClose > 0 ? ((openPeriod[openPeriod.length - 1].price - open) / prevClose) * 100 : 0;
  const closeChange = closePeriod.length >= 2
    ? ((closePeriod[closePeriod.length - 1].price - closePeriod[0].price) / closePeriod[0].price) * 100
    : 0;

  // Max segment
  const maxSegment = segments.length > 0 ? segments.reduce((a, b) => a.totalVolume > b.totalVolume ? a : b) : null;

  // Intraday range
  const range = prevClose > 0 ? ((high - low) / prevClose) * 100 : 0;

  // ══════ V2 SCORING RULES ══════

  let score = { accumulation: 0, distribution: 0, shakeout: 0, markup: 0 };
  const reasons: string[] = [];

  // ── ACCUMULATION (吸筹) patterns ──

  // A. 量价配合：上涨放量、下跌缩量 (core pattern, high weight)
  if (volTrend.upVolumeRatio > 0.55 && changePct > -1 && changePct < 2) {
    const bonus = volTrend.upVolumeRatio > 0.65 ? 10 : 0;
    score.accumulation += 25 + bonus;
    reasons.push(volTrend.upVolumeRatio > 0.65
      ? "量价高度配合：上涨大幅放量、下跌明显缩量"
      : "量价配合：上涨放量、下跌缩量");
  }

  // B. 价格围绕均价线震荡回升
  if (pricePos.closeVsVwap > -0.3 && pricePos.closeVsVwap < 0.5 && low < vwap) {
    score.accumulation += 20;
    reasons.push("价格围绕均价线震荡回升");
  }

  // C. 早盘下探后午后回升 (V型回升)
  if (openChange < -0.3 && closeChange > 0.2) {
    score.accumulation += 20;
    reasons.push("早盘下探后午后回升");
  }

  // D. 尾盘放量拉升 (late-day accumulation)
  if (closeVolRatio > openVolRatio * 1.2 && closeVolRatio > 0.2) {
    score.accumulation += 15;
    reasons.push("尾盘放量拉升");
  }

  // E. V2: 缩量横盘 (quiet consolidation - accumulation in tight range)
  if (range < 1.5 && Math.abs(changePct) < 0.8 && volTrend.trend === "stable" && volTrend.concentrationRatio < 0.4) {
    score.accumulation += 18;
    reasons.push("缩量横盘整理（主力暗中吸筹）");
  }

  // F. V2: 放量突破后缩量回踩 (breakout then quiet pullback - confirmation)
  if (segments.length >= 4) {
    const firstHalf = segments.slice(0, Math.floor(segments.length / 2));
    const secondHalf = segments.slice(Math.floor(segments.length / 2));
    const firstAvgVol = firstHalf.reduce((s, seg) => s + seg.avgVolume, 0) / firstHalf.length;
    const secondAvgVol = secondHalf.length > 0 ? secondHalf.reduce((s, seg) => s + seg.avgVolume, 0) / secondHalf.length : firstAvgVol;
    const firstAvgChange = firstHalf.reduce((s, seg) => s + seg.priceChange, 0);
    const secondAvgChange = secondHalf.reduce((s, seg) => s + seg.priceChange, 0);
    // First half up with volume, second half quiet pullback
    if (firstAvgChange > 0.3 && secondAvgChange < 0 && secondAvgVol < firstAvgVol * 0.7) {
      score.accumulation += 15;
      reasons.push("放量上攻后缩量回踩（吸筹确认）");
    }
  }

  // G. 量能均匀（稳步吸筹）
  const avgSegVariance = segments.length > 0 ? segments.reduce((s, seg) => s + seg.volumeVariance, 0) / segments.length : 0;
  if (avgSegVariance < 0.3 && Math.abs(changePct) < 1.5) {
    score.accumulation += 10;
    reasons.push("成交量分布均匀（稳步吸筹）");
  }

  // H. V2: 成交量递增 + 价格微涨 (volume creeping up with price = accumulation)
  if (volTrend.trend === "increasing" && changePct > 0 && changePct < 2) {
    score.accumulation += 12;
    reasons.push("量能递增微涨（主力持续吸筹）");
  }

  // ── DISTRIBUTION (出货) patterns ──

  // A. 下跌放量 (core pattern, high weight)
  if (volTrend.downVolumeRatio > 0.55 && changePct < -0.5) {
    const bonus = volTrend.downVolumeRatio > 0.65 ? 10 : 0;
    score.distribution += 30 + bonus;
    reasons.push(volTrend.downVolumeRatio > 0.65
      ? "下跌大幅放量：主力集中抛售"
      : "下跌放量：主力借高位抛售");
  }

  // B. 冲高回落跌破均价线
  if (pricePos.highVsVwap > 0.5 && pricePos.closeVsVwap < 0 && changePct < 0) {
    score.distribution += 25;
    reasons.push("冲高回落跌破均价线");
  }

  // C. 早盘冲高后持续回落
  if (openChange > 0.5 && closeChange < -0.3) {
    score.distribution += 25;
    reasons.push("早盘冲高后持续回落");
  }

  // D. V2: 诱多出货 (bull trap) - volume spike on up-move but close weak
  if (volTrend.spikeCount >= 1 && volTrend.avgSpikeDirection === "up" && pricePos.positionInRange < 0.4) {
    score.distribution += 20;
    reasons.push("放量诱多后回落（诱多出货）");
  }

  // E. 假突破：放量上攻但收盘偏弱
  if (volTrend.upVolumeRatio > 0.5 && pricePos.positionInRange < 0.5 && changePct < 0.5) {
    score.distribution += 15;
    reasons.push("放量上攻但收盘偏弱（假突破）");
  }

  // F. 开盘放量滞涨
  if (openVolRatio > 0.25 && changePct < 0.5) {
    score.distribution += 15;
    reasons.push("开盘放量但涨幅有限");
  }

  // G. 尾盘放量下杀
  if (closeChange < -0.3 && closeVolRatio > 0.2) {
    score.distribution += 20;
    reasons.push("尾盘放量下杀");
  }

  // H. V2: 上影线过长 (long upper wick = rejection at highs)
  if (pricePos.upperWickRatio > 0.4 && changePct < 1) {
    score.distribution += 15;
    reasons.push("长上影线（高位抛压重）");
  }

  // I. V2: 量能递减下跌 (volume declining on down trend = slow distribution)
  if (volTrend.trend === "decreasing" && changePct < -0.3) {
    score.distribution += 10;
    reasons.push("量能递减下行（主力缓慢出货）");
  }

  // J. V2: 高位震荡出货 (high price + volatile volume = distribution at top)
  if (pricePos.highVsVwap > 1 && volTrend.trend === "volatile" && Math.abs(changePct) < 1) {
    score.distribution += 12;
    reasons.push("高位放量震荡（高位出货）");
  }

  // ── SHAKEOUT (洗盘) patterns ──

  // A. 快速下探后收回
  if (low < prevClose * 0.98 && close > prevClose * 0.995 && changePct > -0.5) {
    score.shakeout += 30;
    reasons.push("快速下探后收回（洗盘特征）");
  }

  // B. 大振幅小涨跌
  if (range > 2 && Math.abs(changePct) < 0.8) {
    score.shakeout += 25;
    reasons.push("日内振幅大但收盘平稳（震仓洗盘）");
  }

  // C. 低位放量后缩量回升
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

  // D. V2: 缩量下跌（量缩价跌 = 无恐慌盘，主力不卖）
  if (volTrend.trend === "decreasing" && changePct < -0.3 && changePct > -2 && volTrend.downVolumeRatio < 0.45) {
    score.shakeout += 18;
    reasons.push("缩量下跌（无恐慌抛售，洗盘特征）");
  }

  // E. V2: 下影线长 + 收盘偏强 (long lower wick = buyers step in)
  if (pricePos.lowerWickRatio > 0.35 && pricePos.positionInRange > 0.5) {
    score.shakeout += 15;
    reasons.push("长下影线收盘偏强（下方承接有力）");
  }

  // F. V2: V型反转（深跌后快速拉回）
  if (changePct > -0.5 && low < prevClose * 0.97 && close > low * 1.01) {
    const depthPct = prevClose > 0 ? ((low - prevClose) / prevClose) * 100 : 0;
    const recoveryPct = low > 0 ? ((close - low) / low) * 100 : 0;
    if (depthPct < -1.5 && recoveryPct > Math.abs(depthPct) * 0.7) {
      score.shakeout += 15;
      reasons.push("深跌后快速拉回（V型洗盘）");
    }
  }

  // ── MARKUP (拉升) patterns ──

  // A. 放量拉升
  if (changePct > 1.5 && volTrend.upVolumeRatio > 0.6) {
    const bonus = changePct > 3 ? 10 : 0;
    score.markup += 30 + bonus;
    reasons.push(changePct > 3
      ? "大幅放量拉升：主力强势进攻"
      : "放量拉升：主力强势上攻");
  }

  // B. 收盘接近日高
  if (close > high * 0.995 && changePct > 0.5) {
    score.markup += 25;
    reasons.push("收盘接近日内高点");
  }

  // C. 午后放量突破
  if (closeChange > 0.5 && closeVolRatio > openVolRatio) {
    score.markup += 20;
    reasons.push("午后放量突破");
  }

  // D. 远超均价线
  if (pricePos.closeVsVwap > 0.5 && changePct > 0.8) {
    score.markup += 15;
    reasons.push("价格远高于均价线");
  }

  // E. 量能递增上攻
  if (volTrend.trend === "increasing" && changePct > 0.5) {
    score.markup += 12;
    reasons.push("量能递增上攻");
  }

  // F. V2: 量价齐升 (volume and price rising together, strong momentum)
  if (volTrend.trend === "increasing" && volTrend.avgSpikeDirection === "up" && changePct > 1) {
    score.markup += 15;
    reasons.push("量价齐升（强劲上攻动能）");
  }

  // G. V2: 开盘强势且全天维持 (gap up + hold)
  if (openChange > 0.5 && pricePos.positionInRange > 0.7 && changePct > 0.8) {
    score.markup += 15;
    reasons.push("跳空高开全天强势");
  }

  // H. V2: 实体饱满 (strong body ratio = decisive move)
  if (pricePos.bodyRatio > 0.6 && changePct > 1) {
    score.markup += 10;
    reasons.push("K线实体饱满（坚决上攻）");
  }

  // ── Determine primary intent with V2 confidence ──

  const maxScore = Math.max(score.accumulation, score.distribution, score.shakeout, score.markup);
  let intent: InstitutionalIntent;
  let confidence: number;

  // V2: Calculate confidence based on score separation and signal clarity
  const secondScore = [score.accumulation, score.distribution, score.shakeout, score.markup]
    .filter(s => s !== maxScore)
    .reduce((a, b) => Math.max(a, b), 0);
  const scoreGap = maxScore - secondScore;
  const scoreGapRatio = maxScore > 0 ? scoreGap / maxScore : 0;

  if (maxScore < 15) {
    intent = "震荡";
    confidence = 30;
    reasons.length = 0;
    reasons.push("量价无明显方向，观望为主");
  } else if (score.accumulation === maxScore) {
    intent = "吸筹";
    // V2: Higher confidence when gap is large
    confidence = Math.min(95, 35 + score.accumulation + Math.round(scoreGapRatio * 20));
  } else if (score.distribution === maxScore) {
    intent = "出货";
    confidence = Math.min(95, 35 + score.distribution + Math.round(scoreGapRatio * 20));
  } else if (score.shakeout === maxScore) {
    intent = "洗盘";
    confidence = Math.min(90, 30 + score.shakeout + Math.round(scoreGapRatio * 15));
  } else {
    intent = "拉升";
    confidence = Math.min(95, 35 + score.markup + Math.round(scoreGapRatio * 20));
  }

  return {
    signal: buildIntentSignal(intent, confidence, reasons, changePct, volTrend.upVolumeRatio),
    scores: { ...score },
  };
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
      icon: "🔴",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      volumePattern: "上涨放量、下跌缩量",
      pricePattern: "价格重心上移、回调幅度小",
      suggestion: "可跟随主力低吸，正T为主",
    },
    "出货": {
      icon: "🟢",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
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

// ── V2: Cross-day Pattern Analysis ──

interface CrossDayPattern {
  pattern: string;
  description: string;
  confidence: number;  // 0-1
}

function analyzeCrossDayPattern(dailyIntents: DayIntentResult[]): CrossDayPattern {
  if (dailyIntents.length < 2) {
    return { pattern: "数据不足", description: "需要至少2日数据", confidence: 0 };
  }

  const intentSequence = dailyIntents.map(d => d.intent.intent);
  const len = intentSequence.length;

  // Pattern: 连续吸筹 → 可能即将拉升
  const recentAccumulation = intentSequence.slice(-3).filter(i => i === "吸筹").length;
  if (recentAccumulation >= 2 && intentSequence[len - 1] === "吸筹") {
    return {
      pattern: "连续吸筹蓄势",
      description: "多日吸筹后有望拉升，关注放量突破信号",
      confidence: 0.7,
    };
  }

  // Pattern: 吸筹 → 拉升（健康上涨）
  if (len >= 2 && intentSequence[len - 2] === "吸筹" && intentSequence[len - 1] === "拉升") {
    return {
      pattern: "吸筹转拉升",
      description: "主力吸筹完毕开始拉升，上涨有量能支撑",
      confidence: 0.8,
    };
  }

  // Pattern: 拉升 → 出货（典型派发）
  if (len >= 2 && intentSequence[len - 2] === "拉升" && intentSequence[len - 1] === "出货") {
    return {
      pattern: "拉升转出货",
      description: "主力拉高后开始派发，警惕继续下跌",
      confidence: 0.75,
    };
  }

  // Pattern: 连续出货（危险）
  const recentDistribution = intentSequence.slice(-3).filter(i => i === "出货").length;
  if (recentDistribution >= 2) {
    return {
      pattern: "连续出货",
      description: "多日呈现出货特征，主力持续派发，风险较高",
      confidence: 0.8,
    };
  }

  // Pattern: 拉升 → 洗盘 → 拉升（中继上涨）
  if (len >= 3) {
    const last3 = intentSequence.slice(-3);
    if (last3[0] === "拉升" && last3[1] === "洗盘" && last3[2] === "拉升") {
      return {
        pattern: "洗盘后再次拉升",
        description: "上涨中继形态，洗盘后继续上攻，趋势健康",
        confidence: 0.8,
      };
    }
  }

  // Pattern: 洗盘后方向选择
  if (intentSequence[len - 1] === "洗盘") {
    const beforeShakeout = intentSequence.slice(0, -1);
    const lastBefore = beforeShakeout[beforeShakeout.length - 1];
    if (lastBefore === "拉升") {
      return {
        pattern: "拉升中洗盘",
        description: "上涨途中的洗盘整理，关注后续方向选择",
        confidence: 0.65,
      };
    }
    if (lastBefore === "吸筹") {
      return {
        pattern: "吸筹后洗盘",
        description: "吸筹后洗盘震仓，可能是拉升前最后一次清洗",
        confidence: 0.6,
      };
    }
  }

  // Pattern: 震荡持续
  const recentOscillation = intentSequence.slice(-3).filter(i => i === "震荡").length;
  if (recentOscillation >= 2) {
    return {
      pattern: "持续震荡",
      description: "多日无明显方向，等待突破信号",
      confidence: 0.5,
    };
  }

  // Default: mixed signals
  return {
    pattern: "信号混合",
    description: "多日意图不一致，方向不明朗",
    confidence: 0.3,
  };
}

// ── Public: Analyze 5-day data for institutional intent (V2) ──

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
      crossDayPattern: "数据不足",
    };
  }

  // Split data by day
  const dayRanges: { start: number; end: number }[] = [];
  for (let i = 0; i < dayBoundaries.length; i++) {
    const start = dayBoundaries[i];
    const end = i + 1 < dayBoundaries.length ? dayBoundaries[i + 1] : items.length;
    dayRanges.push({ start, end });
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

    const { signal: intent, scores } = analyzeDayIntent(dayData, dayPrevClose);

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
      scores,
    });

    dayPrevClose = dayClose;
  }

  // ── Determine overall intent (V2: improved weighting) ──
  if (dailyIntents.length === 0) {
    return {
      overallIntent: buildIntentSignal("观察", 10, ["数据不足"], 0, 0.5),
      dailyIntents: [],
      trendPhase: "数据不足",
      riskLevel: 3,
      crossDayPattern: "数据不足",
    };
  }

  // V2: Exponential weighting (more aggressive time decay)
  const weights = dailyIntents.map((_, i) => Math.pow(1.6, i));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const overallScores = { accumulation: 0, distribution: 0, shakeout: 0, markup: 0 };
  for (let i = 0; i < dailyIntents.length; i++) {
    const d = dailyIntents[i];
    const w = weights[i] / totalWeight;
    // V2: Use weighted confidence * score ratio for more nuanced aggregation
    const maxDayScore = Math.max(d.scores.accumulation, d.scores.distribution, d.scores.shakeout, d.scores.markup, 1);
    overallScores.accumulation += w * (d.scores.accumulation / maxDayScore) * d.intent.confidence;
    overallScores.distribution += w * (d.scores.distribution / maxDayScore) * d.intent.confidence;
    overallScores.shakeout += w * (d.scores.shakeout / maxDayScore) * d.intent.confidence;
    overallScores.markup += w * (d.scores.markup / maxDayScore) * d.intent.confidence;
  }

  // V2: Cross-day pattern analysis
  const crossDay = analyzeCrossDayPattern(dailyIntents);

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
    trendPhase = overallChange > 3 ? "高位出货区" : "下行出货区";
    riskLevel = overallChange > 3 ? 5 : 4;
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

  // V2: Adjust risk level based on cross-day pattern
  if (crossDay.pattern === "拉升转出货" || crossDay.pattern === "连续出货") {
    riskLevel = Math.max(riskLevel, 4);
  } else if (crossDay.pattern === "吸筹转拉升" || crossDay.pattern === "洗盘后再次拉升") {
    riskLevel = Math.min(riskLevel, 2);
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

  // V2: Add cross-day pattern info to reasons
  if (crossDay.confidence >= 0.5) {
    overallReasons.push(crossDay.description);
  }

  // Add trend context
  if (overallChange > 3) overallReasons.push(`5日累计涨幅${overallChange.toFixed(1)}%`);
  else if (overallChange < -3) overallReasons.push(`5日累计跌幅${Math.abs(overallChange).toFixed(1)}%`);

  // V2: Confidence based on score separation and cross-day consistency
  const secondOverall = [overallScores.accumulation, overallScores.distribution, overallScores.shakeout, overallScores.markup]
    .filter(s => s !== maxOverall)
    .reduce((a, b) => Math.max(a, b), 0);
  const overallGapRatio = maxOverall > 0 ? (maxOverall - secondOverall) / maxOverall : 0;
  const overallConfidence = Math.min(92, Math.round(maxOverall * 80 + overallGapRatio * 20 + crossDay.confidence * 10));

  return {
    overallIntent: buildIntentSignal(overallIntent, overallConfidence, overallReasons, overallChange, 0.5),
    dailyIntents,
    trendPhase,
    riskLevel,
    crossDayPattern: crossDay.pattern,
  };
}
